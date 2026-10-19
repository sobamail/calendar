// Type declarations for the runtime module `sobamail.com/module/calendar/v1.mjs`.
// The `$module/*` tsconfig path points here for type-checking, while the Vite
// alias points at the `.mjs` for runtime. Keep these class shapes in sync with
// the constructors in v1.mjs.

export interface EventData {
    uuid: string;
    title: string;
    /** The calendar's uuid; PutEvent takes "" as the primary calendar's. */
    cal: string;
    /** Start, as a naive ISO datetime "YYYY-MM-DDTHH:MM": the wall clock of `tz`. */
    start: string;
    /** End, as a naive ISO datetime "YYYY-MM-DDTHH:MM": the wall clock of `tz`. */
    end: string;
    allDay: Flag;
    location: string;
    desc: string;
    /**
     * PutEvent ignores a sent value and derives it from `callUrl`; rows stored before
     * `callUrl` existed may read 1 with an empty link.
     */
    call: Flag;
    /** The video call link, an http(s) URL, or "". */
    callUrl: string;
    attendees: string[];
    /** A mailed invitation's iCalendar UID; "" for the user's own events. */
    uid?: string;
    /** The address that sent the invitation; "". */
    organizer?: string;
    /** "tentative" for a mailed invitation; "". */
    status?: string;
    /** The IANA zone `start`/`end` are in; "" (rows stored before zones) is the browser's. */
    tz?: string;
    /** The iCalendar SEQUENCE the guests were last mailed; 0 before any update. */
    sequence?: number;
}

/**
 * A flag on the wire and in the database: 1 or 0, both ways. A boolean must never be
 * persisted (the runtime throws "Boolean types are not supported"); the UI's own types
 * are booleans.
 */
export type Flag = 0 | 1;

export class Event implements EventData {
    constructor(init?: Partial<EventData>);
    uuid: string;
    title: string;
    cal: string;
    start: string;
    end: string;
    allDay: Flag;
    location: string;
    desc: string;
    call: Flag;
    callUrl: string;
    attendees: string[];
    uid: string;
    organizer: string;
    status: string;
    tz: string;
    sequence: number;
}

export class GetEventsResponse {
    constructor(init?: { data?: Event[] });
    data: Event[];
}

export class PutEventResponse {
    constructor(init?: { uuid?: string });
    uuid: string;
}

export const namespace: string;

/** Thrown by a constructor on content no retry can fix; the Mutator logs and drops it. */
export class MalformedObject extends Error {}

// Replicated events: each is a table's insert event. asText/toString describe the
// mutation to the user and in logs.

export class AddEvent {
    static KEY: string;
    constructor(init: { uuid: string });
    uuid: string;
    process(): void;
    asText(locale: string): string;
}

export class SetEventAttr {
    static KEY: string;
    constructor(init: { event: string; key: string; value?: unknown });
    event: string;
    key: string;
    value: unknown;
    process(): void;
    asText(locale: string): string;
}

export class AddEventAttr {
    static KEY: string;
    constructor(init: { event: string; key: string });
    event: string;
    key: string;
    process(): void;
    asText(locale: string): string;
}

export class AddEventAttrValue {
    static KEY: string;
    constructor(init: { event: string; key: string; value?: unknown });
    event: string;
    key: string;
    value: unknown;
    process(): void;
    asText(locale: string): string;
}

// Requests from the UI: each responds (or not) through soba.task.respond.

/**
 * Throws MalformedObject unless the title is non-blank (it is stored trimmed), `cal`
 * is a string, `start` <= `end` are both "YYYY-MM-DDTHH:MM", and `callUrl` is "" or an
 * http(s) URL (stored trimmed), `tz` is "" or shaped like an IANA zone name, and
 * `sequence` is a whole number >= 0. `call` is derived from `callUrl`. `uid`,
 * `organizer`, `status`, `tz` and `sequence` are written only when sent, so a save
 * without them keeps them.
 */
export class PutEvent implements EventData {
    static KEY: string;
    constructor(init?: Partial<EventData>);
    uuid: string;
    title: string;
    cal: string;
    start: string;
    end: string;
    allDay: Flag;
    location: string;
    desc: string;
    call: Flag;
    callUrl: string;
    attendees: string[];
    uid?: string;
    organizer?: string;
    status?: string;
    tz?: string;
    sequence?: number;
    /** Responds a PutEventResponse with the uuid write() returns. */
    process(): void;
    /**
     * Writes the event; returns its uuid, minted when it had none. `cal` "" files it under
     * the primary calendar (created if need be); throws MalformedObject, writing nothing,
     * when `cal` names no stored calendar.
     */
    write(): string;
}

export class GetEvents {
    static KEY: string;
    constructor(init?: {
        /** With `to`: the events overlapping [from, to) — start before `to`, end at or after `from`. */
        from?: string;
        to?: string;
        filter?: string;
        limit?: number;
        offset?: number;
    });
    process(): void;
}

/** Throws the base module's NotFoundError, which the Mutator passes in, on an unknown uuid. */
export class GetEvent {
    static KEY: string;
    constructor(init?: { uuid?: string });
    uuid: string;
    process(errors: { NotFoundError: new (message: string) => Error }): void;
}

export class DeleteEvent {
    static KEY: string;
    constructor(init: { uuid: string });
    uuid: string;
    process(): void;
}

// Invitations out.

/** The base module's mail classes, which the Mutator passes in. */
export interface MailClasses {
    Message: new () => {
        genUuid(): void;
        from: unknown;
        to: unknown;
        subject: string;
        bodyText: string;
        attachments: unknown[];
    };
    MessageAttachment: new (init: { name: string; type: string; blobs: ArrayBuffer[] }) => unknown;
}

/**
 * Mails `ics` (an iCalendar file with METHOD:REQUEST, written by the UI) from the account
 * to `to` as an `invite.ics` attachment of type "text/calendar; method=REQUEST". Throws
 * MalformedObject without a uuid, a non-blank address or a non-blank `ics`.
 */
export class SendInvite {
    static KEY: string;
    constructor(init?: { uuid?: string; to?: string | string[]; ics?: string; subject?: string; text?: string });
    uuid: string;
    to: string[];
    ics: string;
    subject: string;
    text: string;
    process(mail: MailClasses): void;
}

export class SendInviteResponse {
    constructor(init?: { uuid?: string; to?: string[] });
    uuid: string;
    to: string[];
}

/** Responds the account's address, the ORGANIZER of the invitations it sends. */
export class GetAccount {
    static KEY: string;
    constructor();
    process(): void;
}

export class Account {
    constructor(init?: { address?: string });
    address: string;
}

// Calendars. Every instance has a primary one, whose uuid is the instance id: created on
// first need without a name, it takes new events and invitations and can't be deleted.
// An event's `cal` is a calendar uuid.

export interface CalendarData {
    uuid: string;
    /** "" until the primary calendar is named; every other calendar has one. */
    name: string;
    /** "#rrggbb", lowercase. */
    color: string;
}

export class Calendar implements CalendarData {
    constructor(init?: Partial<CalendarData> & { primary?: Flag });
    uuid: string;
    name: string;
    color: string;
    /** 1 on the primary calendar. */
    primary: Flag;
}

export class AddCalendar {
    static KEY: string;
    constructor(init: { uuid: string });
    uuid: string;
    process(): void;
    asText(locale: string): string;
}

export class SetCalendarAttr {
    static KEY: string;
    constructor(init: { calendar: string; key: string; value?: unknown });
    calendar: string;
    key: string;
    value: unknown;
    process(): void;
    asText(locale: string): string;
}

/**
 * Creates (no uuid) or updates a calendar, the primary one included. Throws
 * MalformedObject unless the name is non-blank (stored trimmed) and the color is
 * "#rrggbb" (stored lowercase).
 */
export class PutCalendar implements CalendarData {
    static KEY: string;
    constructor(init?: Partial<CalendarData>);
    uuid: string;
    name: string;
    color: string;
    process(): void;
}

export class PutCalendarResponse {
    constructor(init?: { uuid?: string });
    uuid: string;
}

/**
 * Responds every calendar: the primary one first (created here when it doesn't exist
 * yet), then the others by folded name.
 */
export class GetCalendars {
    static KEY: string;
    constructor();
    process(): void;
}

export class GetCalendarsResponse {
    constructor(init?: { data?: Calendar[] });
    data: Calendar[];
}

/**
 * Refused (`deleted` 0) for the primary calendar, while `events` events name the
 * calendar, or when it's unknown.
 */
export class DeleteCalendar {
    static KEY: string;
    constructor(init: { uuid: string });
    uuid: string;
    process(): void;
}

export class DeleteCalendarResponse {
    constructor(init?: { deleted?: Flag; events?: number });
    deleted: Flag;
    events: number;
}

// iCalendar parsing, shared by the mail path and the UI's import.

/** A VEVENT as parse_ics reads it. */
export interface IcsEvent {
    uid: string;
    title: string;
    /** Naive "YYYY-MM-DDTHH:MM", the wall clock of `tz` as written; an all-day event starts at 00:00. */
    start: string;
    /**
     * Naive, in `tz` (an end written in another zone is moved into it); an all-day event,
     * and a timed one ending at midnight, end at 23:59 of their last day.
     */
    end: string;
    allDay: boolean;
    location: string;
    desc: string;
    attendees: string[];
    /** The first http(s) URL among URL, X-GOOGLE-CONFERENCE, X-MICROSOFT-SKYPETEAMSMEETINGURL. */
    callUrl: string;
    organizer: string;
    /** STATUS as written, upper case; "" when there is none. */
    status: string;
    sequence: number;
    /**
     * DTSTART's zone: "UTC" for a UTC time, the TZID when it is an IANA name, "" for a
     * date, a floating time or another TZID (Outlook's Windows names).
     */
    tz: string;
}

/**
 * The events of an iCalendar text, how many VEVENTs were skipped (no usable start, or
 * cancelled) and the VCALENDAR's METHOD, upper case ("" when none). Times are kept as
 * written, with their zone in `tz`: nothing depends on the runtime's zone.
 */
export function parse_ics(text: string): { events: IcsEvent[]; skipped: number; method: string };

/** A delivered mail as read_invitations reads it: the base module's Message, loosely. */
export interface DeliveredMail {
    from?: { address?: string }[];
    bodyText?: string;
    attachments?: { name?: string; type?: string; blobs?: unknown }[];
}

/**
 * Writes every VEVENT of a METHOD:REQUEST calendar in `message` (a text/calendar or .ics
 * attachment, else a calendar in the text body) as a tentative event in the primary
 * calendar, updating the event of the same UID in place (its calendar kept while it
 * exists). Ignores the account's own mail. For a
 * non-replicated handler; returns how many events it wrote.
 */
export function read_invitations(message: DeliveredMail): number;
