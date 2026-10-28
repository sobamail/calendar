import {
    delete_calendar,
    delete_event,
    put_calendar,
    put_event,
    read_account,
    read_calendars,
    read_events,
    send_invite,
} from "./model";
import {H1, PALETTE, UNKNOWN_CALENDAR, deepOf} from "./data";
import {moved, pieceOn, resized, whenText} from "./calendar";
import type {Placement} from "./calendar";
import {call_url_ok, email_ok} from "./email";
import {download, ics_filename, parse_ics, write_ics} from "./ics";
import type {ImportedEvent} from "./ics";
import {
    addDays,
    addMonths,
    convertZone,
    dateOf,
    daysBetween,
    hourOf,
    isoAt,
    loadWindow,
    localZone,
    parseYmd,
    today,
    ymd,
} from "./dates";
import type {
    CalendarEvent,
    CalendarForm,
    CalendarId,
    CalendarMeta,
    DayPiece,
    EventForm,
    ViewName,
} from "./types";
import {namespace} from "$module/calendar/v1";
import type {Event, EventData} from "$module/calendar/v1";

/**
 * The app event stream (doc/pub/ref/app-events.md): every mutation written to the
 * instance — by this page, another page or a peer replica — is announced under its object
 * key. An event names the mutation, not the row, so a listener rereads.
 */
const EVENT_STREAM = "/api/v2/event";
/** The insert events of the event tables (Mutator.mjs): an event or its attributes changed. */
const EVENT_KEYS = [ "AddEvent", "SetEventAttr", "AddEventAttr", "AddEventAttrValue" ];
/** The insert events of the calendar tables. */
const CALENDAR_KEYS = [ "AddCalendar", "SetCalendarAttr" ];
/** A row deleted from any table; it doesn't say which, so both are reread. */
const DELETE_ROW = "{https://sobamail.com/module/base/v1}DeleteRow";
/** A batch arrives as consecutive events; they are taken in one reread this long after. */
const STREAM_SETTLE_MS = 50;

/** localStorage key of the calendar visibility: {id: false} for each hidden calendar. */
const VISIBLE_KEY = "calendar.visible";

/** The stored visibility; storage that is missing, refused or garbled shows everything. */
function loadShown(): Record<CalendarId, boolean> {
    try {
        const stored = JSON.parse(localStorage.getItem(VISIBLE_KEY) ?? "{}");
        return stored && typeof stored === "object" ? stored : {};
    } catch {
        return {};
    }
}

function saveShown(shown: Record<CalendarId, boolean>) {
    try {
        localStorage.setItem(VISIBLE_KEY, JSON.stringify(shown));
    } catch {
        // storage refused (private mode, quota): visibility just won't outlive the page
    }
}

/** An event of an imported file, and whether it is ticked for import. */
export interface ImportRow {
    event: ImportedEvent;
    chosen: boolean;
}

/** How many events to pull per read — the schedule is small, so one page (`capped` says when not). */
export const PAGE = 1000;

/** The last minute of a day as a fractional hour (23:59). */
const END_OF_DAY = 24 - 1 / 60;

/** All-day events are stored spanning the whole day; the times are ignored by the UI. */
const ALL_DAY_SPAN = {s : 0, e : END_OF_DAY};

/** A fresh, timed draft for `date` in calendar `cal`, an hour long from `hour`. */
function blankForm(date: string, cal: CalendarId, hour = 10): EventForm {
    return {
        title : "",
        cal,
        date,
        endDate : date,
        s : hour,
        // the form's last end option is the last half hour; save() fixes a zero span
        e : Math.min(hour + 1, H1 - 0.5),
        allDay : false,
        location : "",
        desc : "",
        attendees : [],
        callUrl : "",
    };
}

/**
 * Backend Event → the UI's CalendarEvent shape (uuid → id, coerce scalars). A timed
 * event's times move from its zone to the browser's; one stored without a zone is in
 * the browser's.
 */
function toCalendarEvent(e: Event): CalendarEvent {
    const tz = e.tz || localZone();
    let start = e.start ?? "";
    let end = e.end ?? "";
    if (! e.allDay) {
        start = convertZone(start, tz, "");
        end = convertZone(end, tz, "");
    }
    return {
        id : e.uuid,
        title : e.title ?? "",
        cal : e.cal ?? "",
        date : dateOf(start),
        // a stored end before its start (PutEvent refuses those) reads as a one-day event
        endDate : [ dateOf(start), dateOf(end) ].sort()[1],
        s : hourOf(start),
        e : hourOf(end),
        allDay : !!e.allDay,
        location : e.location || undefined,
        desc : e.desc || undefined,
        attendees : e.attendees && e.attendees.length ? e.attendees : undefined,
        call : !!e.call,
        callUrl : e.callUrl || undefined,
        invitation : e.status === "tentative" || undefined,
        organizer : e.organizer || undefined,
        sequence : e.sequence || undefined,
        tz,
    };
}

/**
 * CalendarEvent fields + a uuid → the plain object PutEvent expects, the times moved
 * back into the event's zone (the browser's for a new one). An invitation's uid,
 * organizer and status are left out, so PutEvent keeps them. No `cal` (or "") is the
 * primary calendar to PutEvent.
 */
function toBackendEvent(e: Partial<CalendarEvent>, uuid: string): EventData {
    const tz = e.tz || localZone();
    let start = isoAt(e.date ?? "", e.s ?? 0);
    let end = isoAt(e.endDate ?? e.date ?? "", e.e ?? 0);
    if (! e.allDay) {
        start = convertZone(start, "", tz);
        end = convertZone(end, "", tz);
    }
    return {
        uuid,
        title : e.title ?? "",
        cal : e.cal ?? "",
        start,
        end,
        tz,
        // a boolean must never be persisted, and the request is
        allDay : e.allDay ? 1 : 0,
        location : e.location ?? "",
        desc : e.desc ?? "",
        call : e.call ? 1 : 0,
        callUrl : e.callUrl ?? "",
        attendees : e.attendees ?? [],
    };
}

/**
 * The text body of an invitation, or of an `update` to one: what, when and where, for a
 * reader without a calendar.
 */
function inviteText(ev: CalendarEvent, update = false): string {
    return [ update ? `${ev.title} has a new time.` : `You are invited to ${ev.title}.`, "",
             `When: ${whenText(ev)}`, ...(ev.location ? [ `Where: ${ev.location}` ] : []),
             ...(ev.callUrl ? [ `Call: ${ev.callUrl}` ] : []), "",
             update ? "The updated invitation is attached; open it to update your calendar."
                    : "The invitation is attached; open it to add the event to your calendar." ]
            .join("\n");
}

/**
 * Central calendar store built on Svelte 5 runes. A single instance is created
 * in App.svelte and passed down via context, so every view shares one source of
 * truth for events, the active view, the navigation cursor, calendar visibility
 * and the open dialogs.
 *
 * `cursor` is the anchor date the views render around; navigation moves it by a
 * day / week / month depending on the active view. Events are persisted through
 * the Sobamail calendar backend (see model.ts): the store loads them on
 * construction and re-reads after every write.
 */
export class CalendarStore {
    view = $state<ViewName>("week");
    /** Anchor date all views render around. */
    cursor = $state<Date>(today());
    /** Wall-clock now, ticked each minute — drives the "today" mark & now-line. */
    now = $state<Date>(new Date());
    events = $state<CalendarEvent[]>([]);
    /** True when the last load filled a whole page: the window may hold more events. */
    capped = $state(false);
    /** Visibility per calendar id; a calendar missing from it is shown. */
    shown = $state<Record<CalendarId, boolean>>(loadShown());
    /** The calendars, as the backend lists them: the primary one first, then by name. */
    calendars = $state<CalendarMeta[]>([]);
    /** The primary calendar's id; "" until the calendars load, which PutEvent reads as it. */
    primaryId = $derived(this.calendars.find((c) => c.primary)?.id ?? "");

    /** The calendar dialog: open, the uuid it edits (null: a new one), its draft and error. */
    showCalendar = $state(false);
    editingCalId = $state<string|null>(null);
    calForm = $state<CalendarForm>({name : "", color : PALETTE[0].color});
    calError = $state<string|null>(null);

    /** Toolbar search text; events that don't match it are dimmed. */
    query = $state("");
    /** uuids matching `query` within the loaded window; null when not searching. */
    matches = $state<Set<string>|null>(null);
    /** Bumped per search request so a stale response can't overwrite a newer one. */
    private searchSeq = 0;
    /** Same for window loads: rapid navigation must not let a slow reply win. */
    private loadSeq = 0;

    selectedId = $state<string|null>(null);
    showCreate = $state(false);
    editingId = $state<string|null>(null);
    form = $state<EventForm>(blankForm(ymd(today()), ""));
    /** Validation message shown inside the form, if any. */
    formError = $state<string|null>(null);
    /** True while a write is in flight; blocks a second submit of the same action. */
    saving = $state(false);
    /** Last backend failure, shown in a dismissible banner; null when all is well. */
    error = $state<string|null>(null);

    /** The import dialog: the file's events, each ticked or not, and the run's progress. */
    showImport = $state(false);
    importRows = $state<ImportRow[]>([]);
    importSkipped = $state(0);
    importCal = $state<CalendarId>("");
    importTotal = $state(0);
    importDone = $state(0);
    importRunning = $state(false);
    /** The outcome line once a run ends, "" before. */
    importStatus = $state("");
    private importStop = false;

    /** The event just saved with guests who haven't been sent it; the popover says so. */
    uninvitedId = $state<string|null>(null);
    /** The outcome of the last invitation sent, for the event it was sent for. */
    inviteStatus = $state<{id: string, text: string}|null>(null);
    /** The account's address, asked for once, on the first invitation. */
    private account = "";

    constructor() {
        this.load();
        this.loadCalendars();
        this.listen();
        if (typeof setInterval !== "undefined") {
            setInterval(() => { this.now = new Date(); }, 60000);
        }
    }

    // ---- Realtime updates --------------------------------------------------
    /** What the stream said changed since the last reread, and the reread's timer. */
    private stale = {events : false, calendars : false};
    private staleTimer: ReturnType<typeof setTimeout>|null = null;

    /**
     * Follow the app event stream, so a change made on another replica or page shows up
     * without a reload. The browser reconnects by itself and replays what it missed.
     */
    private listen() {
        if (typeof EventSource === "undefined")
            return;
        const stream = new EventSource(EVENT_STREAM);
        for (const name of EVENT_KEYS)
            stream.addEventListener(`{${namespace}}${name}`, () => this.markStale(true, false));
        for (const name of CALENDAR_KEYS)
            stream.addEventListener(`{${namespace}}${name}`, () => this.markStale(false, true));
        stream.addEventListener(DELETE_ROW, () => this.markStale(true, true));
        // whatever was written before the stream (re)opened went unannounced
        stream.addEventListener("open", () => this.markStale(true, true));
    }

    /** Reread what the stream said changed, once for a whole burst of events. */
    private markStale(events: boolean, calendars: boolean) {
        this.stale.events ||= events;
        this.stale.calendars ||= calendars;
        if (this.staleTimer !== null)
            return;
        this.staleTimer = setTimeout(() => {
            const {events, calendars} = this.stale;
            this.stale = {events : false, calendars : false};
            this.staleTimer = null;
            if (events)
                this.load();
            if (calendars)
                this.loadCalendars();
        }, STREAM_SETTLE_MS);
    }

    /** The event being dragged and where it would land; the views show it there. */
    moving = $state<{id: string, to: Placement}|null>(null);

    /**
     * Events belonging to a currently-visible calendar; an unknown calendar is shown. A
     * dragged event is where it would land.
     */
    visible = $derived(this.events
                               .map((e) => (this.moving?.id === e.id ? {...e, ...this.moving.to} : e))
                               .filter((e) => this.shown[e.cal] !== false));

    /** The calendar an id names; an unknown id gets a neutral gray. */
    meta(id: CalendarId): CalendarMeta {
        return this.calendars.find((c) => c.id === id) ?? {id, ...UNKNOWN_CALENDAR};
    }

    isShown(id: CalendarId): boolean { return this.shown[id] !== false; }

    /** The full event backing the detail popover, if any. */
    selected = $derived(this.events.find((e) => e.id === this.selectedId) ?? null);

    /**
     * The visible events' pieces on a given "YYYY-MM-DD" — a multi-day event on
     * every day it covers — all-day first, then by start time on that day.
     */
    eventsOn(date: string): DayPiece[] {
        return this.visible.map((e) => pieceOn(e, date))
                .filter((p): p is DayPiece => p !== null)
                .sort((a, b) => (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0) || a.s - b.s);
    }

    // ---- Backend sync ----------------------------------------------------
    /**
     * Load the visible window from the backend (a ±~1-month range around the
     * cursor), so the server does the date filtering. A fresh account is empty.
     */
    async load() {
        const seq = ++this.loadSeq;
        // the window (or the events in it) changed, so re-run any search too
        this.search();
        try {
            const {from, to} = loadWindow(this.cursor);
            const rows = await read_events(from, to, "", PAGE, 0);
            if (seq === this.loadSeq) {
                // a drop waiting on the guests question stays where it was dropped
                const p = this.pendingMove;
                this.events = rows.map(toCalendarEvent).map((e) => (p?.to.id === e.id ? p.to : e));
                this.capped = rows.length >= PAGE;
            }
        } catch (err) {
            if (seq === this.loadSeq)
                this.fail("Couldn't load events", err);
        }
    }

    /** Record a backend failure where the user can see it (and in the console). */
    private fail(what: string, err: unknown) {
        console.error(`${what}:`, err);
        const detail = err instanceof Error ? err.message : String(err);
        this.error = detail ? `${what}: ${detail}` : what;
    }

    dismissError() { this.error = null; }

    // ---- Search ------------------------------------------------------------
    // Like soba-contacts, matching is done server-side (GetEvents `filter`, folded
    // in js). The full window stays loaded; the hits only decide what gets dimmed.

    setQuery(q: string) {
        this.query = q;
        this.search();
    }

    async search() {
        const seq = ++this.searchSeq;
        const q = this.query.trim();
        if (! q) {
            this.matches = null;
            return;
        }
        try {
            const {from, to} = loadWindow(this.cursor);
            const hits = await read_events(from, to, q, PAGE, 0);
            if (seq === this.searchSeq)
                this.matches = new Set(hits.map((e) => e.uuid));
        } catch (err) {
            if (seq === this.searchSeq)
                this.fail("Search failed", err);
        }
    }

    /** How many shown events match the search; null when not searching. */
    matchCount = $derived(this.matches === null ? null
                                                : this.visible.filter((e) => this.matches!.has(e.id))
                                                          .length);

    /** True when a search is active and the event doesn't match it. */
    isDimmed(id: string): boolean { return this.matches !== null && ! this.matches.has(id); }

    // ---- Navigation ------------------------------------------------------
    // Moving the cursor changes the fetch window, so each nav reloads.
    goToday() {
        this.cursor = today();
        this.load();
    }
    goPrev() { this.shiftCursor(-1); }
    goNext() { this.shiftCursor(1); }

    /** Jump to a specific day and show it in the day view. */
    goToDay(date: Date) {
        this.cursor = date;
        this.view = "day";
        this.load();
    }

    /** Step the cursor by the active view's unit, then reload the window. */
    shiftCursor(dir: number) {
        if (this.view === "month")
            this.cursor = addMonths(this.cursor, dir);
        else if (this.view === "day")
            this.cursor = addDays(this.cursor, dir);
        else // week + agenda
            this.cursor = addDays(this.cursor, dir * 7);
        this.load();
    }

    setMonth(dir: number) {
        this.cursor = addMonths(this.cursor, dir);
        this.load();
    }

    toggleCal(id: CalendarId) {
        this.shown[id] = ! this.isShown(id);
        saveShown(this.shown);
    }

    // ---- Calendars -------------------------------------------------------
    async loadCalendars() {
        try {
            const rows = await read_calendars();
            this.calendars = rows.map((c) => ({id : c.uuid, name : c.name, color : c.color,
                                               deep : deepOf(c.color), primary : !! c.primary}));
        } catch (err) {
            this.fail("Couldn't load calendars", err);
            return;
        }
        // a form opened before the calendars came picks the primary one now
        if (! this.form.cal)
            this.form.cal = this.primaryId;
        if (! this.importCal)
            this.importCal = this.primaryId;
    }

    /** Open the calendar dialog on a calendar, or on a new one without an id. */
    openCalendar(id?: CalendarId) {
        const cal = id === undefined ? null : this.calendars.find((c) => c.id === id);
        if (id !== undefined && ! cal)
            return;
        this.calForm = cal ? {name : cal.name, color : cal.color} : {name : "", color : PALETTE[0].color};
        this.editingCalId = cal ? cal.id : null;
        this.calError = null;
        this.showCalendar = true;
    }

    closeCalendar() {
        this.showCalendar = false;
        this.editingCalId = null;
        this.calError = null;
    }

    async saveCalendar() {
        const name = this.calForm.name.trim();
        if (this.saving || ! name)
            return;
        this.saving = true;
        try {
            await put_calendar(
                    {uuid : this.editingCalId ?? "", name, color : this.calForm.color});
        } catch (err) {
            this.fail("Couldn't save the calendar", err);
            return;
        } finally {
            this.saving = false;
        }
        this.closeCalendar();
        await this.loadCalendars();
    }

    async deleteCalendar() {
        const id = this.editingCalId;
        if (this.saving || id === null)
            return;
        this.saving = true;
        try {
            const resp = await delete_calendar(id);
            if (! resp.deleted && resp.events > 0) {
                this.calError = resp.events === 1
                                        ? "1 event uses this calendar; move or delete it first."
                                        : `${resp.events} events use this calendar; move or delete them first.`;
                return;
            }
        } catch (err) {
            this.fail("Couldn't delete the calendar", err);
            return;
        } finally {
            this.saving = false;
        }
        this.closeCalendar();
        await this.loadCalendars();
    }

    // ---- Dragging ----------------------------------------------------------
    // The week and day views drag an event by whole days and quarter hours (moved()),
    // or its end by quarter hours (resized()); the release saves it there.

    /**
     * Whether event `id` may be dragged: not one organized by someone else (a received
     * invitation), which only its organizer can reschedule.
     */
    movable(id: string): boolean {
        const ev = this.events.find((e) => e.id === id);
        return !! ev && ! ev.organizer && ! ev.invitation;
    }

    /** Show event `id` dragged `days` columns over and `hours` down. */
    dragTo(id: string, days: number, hours: number) {
        const ev = this.events.find((e) => e.id === id);
        this.moving = ev && this.movable(id) ? {id, to : moved(ev, days, hours)} : null;
    }

    /** Show event `id` with its end dragged `hours` down. */
    resizeTo(id: string, hours: number) {
        const ev = this.events.find((e) => e.id === id);
        this.moving = ev && this.movable(id) ? {id, to : resized(ev, hours)} : null;
    }

    dragCancel() { this.moving = null; }

    /**
     * The dragged event as dropped, and as it was, while the user is asked whether its
     * guests should hear of the change.
     */
    pendingMove = $state<{from: CalendarEvent, to: CalendarEvent}|null>(null);

    /**
     * Take the dragged (moved or resized) event as it was dropped; nothing when it is
     * back as it was. An event with guests isn't saved yet: the user is asked first
     * (answerMove()).
     */
    async dragDrop() {
        const m = this.moving;
        this.moving = null;
        const ev = m && this.events.find((e) => e.id === m.id);
        if (! m || ! ev || this.saving || ! this.movable(ev.id))
            return;
        const to = {...ev, ...m.to};
        if (to.date === ev.date && to.endDate === ev.endDate && to.s === ev.s && to.e === ev.e)
            return;

        // it stays where it was dropped meanwhile; the reload after the save confirms it,
        // or puts it back when the save failed
        this.events = this.events.map((e) => (e.id === ev.id ? to : e));
        if (ev.attendees?.length) {
            this.pendingMove = {from : ev, to};
            return;
        }
        await this.saveMove(to, false);
    }

    /** The guests hear of the new time (it is saved, then mailed), or it is undone. */
    async answerMove(tell: boolean) {
        const p = this.pendingMove;
        if (! p || this.saving)
            return;
        this.pendingMove = null;
        if (! tell) {
            this.events = this.events.map((e) => (e.id === p.from.id ? p.from : e));
            return;
        }
        await this.saveMove(p.to, true);
    }

    /** Save a dragged event; with `tell`, as an update the guests are then mailed. */
    private async saveMove(to: CalendarEvent, tell: boolean) {
        const sequence = (to.sequence ?? 0) + 1;
        this.saving = true;
        let saved = false;
        try {
            await put_event({...toBackendEvent(to, to.id), ...(tell ? {sequence} : {})});
            saved = true;
        } catch (err) {
            this.fail("Couldn't move the event", err);
        } finally {
            this.saving = false;
        }
        await this.load();
        if (! saved || ! tell)
            return;

        // the reload holds the event as saved; the update tells where it shows
        const ev = this.events.find((e) => e.id === to.id) ?? {...to, sequence};
        this.select(ev.id);
        await this.mailGuests(ev, true);
    }

    select(id: string) {
        this.selectedId = id;
        this.showCreate = false;
        if (this.uninvitedId !== id)
            this.uninvitedId = null;
        this.inviteStatus = null;
    }

    closePopover() {
        this.selectedId = null;
        this.uninvitedId = null;
        this.inviteStatus = null;
    }

    // ---- Invitations -------------------------------------------------------
    /** Mail the event's guests an invitation (METHOD:REQUEST) organized by the account. */
    async sendInvites(id: string) {
        const ev = this.events.find((e) => e.id === id);
        if (ev)
            await this.mailGuests(ev, false);
    }

    /**
     * Mail `ev`'s guests its invitation (METHOD:REQUEST, organized by the account), or an
     * `update` to it, which carries the raised SEQUENCE; the popover shows the outcome.
     */
    private async mailGuests(ev: CalendarEvent, update: boolean) {
        if (this.saving || ! ev.attendees?.length)
            return;
        this.saving = true;
        try {
            if (! this.account)
                this.account = await read_account();
            const to = await send_invite({
                uuid : ev.id,
                to : ev.attendees,
                ics : write_ics([ ev ], {method : "REQUEST", organizer : this.account}),
                subject : `${update ? "Updated invitation" : "Invitation"}: ${ev.title}`,
                text : inviteText(ev, update),
            });
            const n = to.length === 1 ? "1 guest" : `${to.length} guests`;
            this.inviteStatus = {
                id : ev.id,
                text : update ? `Update sent to ${n}.`
                              : `Invitation${to.length === 1 ? "" : "s"} sent to ${n}.`,
            };
            if (this.uninvitedId === ev.id)
                this.uninvitedId = null;
        } catch (err) {
            this.fail(update ? "Couldn't send the update" : "Couldn't send the invitations", err);
        } finally {
            this.saving = false;
        }
    }

    /** Open the create form on `date`, starting at `hour` (10 when not given). */
    openCreate(date: string = ymd(this.cursor), hour?: number) {
        this.form = blankForm(date, this.primaryId, hour);
        this.formError = null;
        this.editingId = null;
        this.selectedId = null;
        this.showCreate = true;
    }

    edit(id: string) {
        const e = this.events.find((x) => x.id === id);
        if (! e)
            return;
        this.form = {
            title : e.title,
            cal : e.cal,
            date : e.date,
            endDate : e.endDate,
            // an all-day event's stored times are a placeholder span; offer a sane
            // default in case the user switches it to a timed event
            s : e.allDay ? 10 : e.s,
            e : e.allDay ? 11 : e.e,
            allDay : !!e.allDay,
            location : e.location ?? "",
            desc : e.desc ?? "",
            attendees : [...(e.attendees ?? []) ],
            callUrl : e.callUrl ?? "",
        };
        this.formError = null;
        this.editingId = id;
        this.selectedId = null;
        this.showCreate = true;
    }

    /** False while a guest row or the call link would be refused; Save is disabled then. */
    formValid = $derived(this.form.attendees.every(email_ok) && call_url_ok(this.form.callUrl));

    /** Move the form's start date; the end date moves along, keeping the span. */
    setFormDate(date: string) {
        const f = this.form;
        if (date && f.date && f.endDate)
            f.endDate = ymd(addDays(parseYmd(date), daysBetween(f.date, f.endDate)));
        f.date = date;
    }

    addGuest() { this.form.attendees.push(""); }
    removeGuest(i: number) { this.form.attendees.splice(i, 1); }

    closeCreate() {
        this.showCreate = false;
        this.formError = null;
        this.editingId = null;
    }

    async remove(id: string) {
        if (this.saving)
            return;
        this.saving = true;
        try {
            await delete_event(id);
        } catch (err) {
            this.fail("Couldn't delete the event", err);
        } finally {
            this.saving = false;
        }
        this.selectedId = null;
        await this.load();
    }

    async save() {
        if (this.saving || ! this.formValid)
            return;
        const f = this.form;
        if (! f.title.trim()) {
            this.formError = "Give the event a title.";
            return;
        }
        if (! f.date) {
            this.formError = "Pick a date.";
            return;
        }
        const endDate = f.endDate || f.date;
        if (endDate < f.date) {
            this.formError = "The event can't end before it starts.";
            return;
        }
        // PutEvent refuses a calendar it doesn't store (one deleted elsewhere); "" is the
        // primary calendar to it
        if (f.cal && ! this.calendars.some((c) => c.id === f.cal)) {
            this.formError = "Pick a calendar.";
            return;
        }
        this.formError = null;

        let span = {s : f.s, e : f.e};
        if (f.allDay)
            span = ALL_DAY_SPAN;
        else if (endDate === f.date && span.e <= span.s)
            span = {s : f.s, e : Math.min(f.s + 0.5, END_OF_DAY)};

        const draft: Partial<CalendarEvent> = {
            title : f.title.trim(),
            cal : f.cal,
            date : f.date,
            endDate,
            ...span,
            allDay : f.allDay,
            location : f.location,
            desc : f.desc,
            attendees : f.attendees.map((a) => a.trim()).filter(Boolean),
            callUrl : f.callUrl.trim(),
            // an edit stays in the event's zone; a new event takes the browser's
            tz : this.events.find((e) => e.id === this.editingId)?.tz,
        };

        this.saving = true;
        let uuid = "";
        try {
            uuid = (await put_event(toBackendEvent(draft, this.editingId ?? "")))?.uuid ?? "";
        } catch (err) {
            // keep the dialog open so nothing typed is lost
            this.fail("Couldn't save the event", err);
            return;
        } finally {
            this.saving = false;
        }
        // jump to the saved day so it falls inside the fetched window
        this.cursor = parseYmd(f.date);
        this.closeCreate();
        await this.load();
        // guests aren't told on their own: show the event, offering to tell them
        if (uuid && draft.attendees?.length && this.events.some((e) => e.id === uuid)) {
            this.select(uuid);
            this.uninvitedId = uuid;
        }
    }

    // ---- iCalendar export / import ---------------------------------------
    /** Download `events` (the shown ones by default) as an iCalendar file. */
    exportIcs(events: CalendarEvent[] = this.visible) {
        if (! events.length) {
            this.error = "No events to export in the shown months.";
            return;
        }
        download(write_ics(events), ics_filename(events), "text/calendar");
    }

    /** Open the import dialog on a file's text, every readable event ticked. */
    openImport(text: string, filename: string) {
        const {events, skipped} = parse_ics(text);
        if (! events.length) {
            this.error = `No events found in ${filename}.`;
            return;
        }
        this.importRows = events.map((event) => ({event, chosen : true}));
        this.importSkipped = skipped;
        // the calendar picked last time, while it is still there
        if (! this.calendars.some((c) => c.id === this.importCal))
            this.importCal = this.primaryId;
        this.importTotal = 0;
        this.importDone = 0;
        this.importStatus = "";
        this.showImport = true;
    }

    importChosen = $derived(this.importRows.filter((r) => r.chosen).length);

    /** One PutEvent per ticked event, one after the other, into `importCal`. */
    async runImport() {
        const chosen = this.importRows.filter((r) => r.chosen).map((r) => r.event);
        this.importTotal = chosen.length;
        this.importDone = 0;
        this.importRunning = true;
        this.importStop = false;
        let failed = 0;
        for (const ev of chosen) {
            if (this.importStop)
                break;
            try {
                // PutEvent refuses a blank title
                await put_event(toBackendEvent(
                        {...ev, title : ev.title || "(No title)", cal : this.importCal}, ""));
            } catch (err) {
                failed++;
                console.error("import:", err);
            }
            this.importDone++;
        }
        this.importRunning = false;
        this.importStatus = `Imported ${this.importDone - failed} of ${this.importTotal}`
                + (failed ? `, ${failed} failed` : "") + (this.importStop ? ", stopped" : "")
                + ".";
        // show where the first imported event is
        if (chosen.length)
            this.cursor = parseYmd(chosen[0].date);
        await this.load();
    }

    stopImport() { this.importStop = true; }

    closeImport() {
        if (this.importRunning)
            return;
        this.showImport = false;
        this.importRows = [];
    }
}
