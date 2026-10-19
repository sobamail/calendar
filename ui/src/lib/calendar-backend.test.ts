// The calendar module's request handlers (sobamail.com/module/calendar/v1.mjs),
// run on a stand-in runtime with a real SQLite underneath.

import { beforeEach, describe, expect, it } from "vitest";
import {
    AddCalendar,
    AddEvent,
    AddEventAttr,
    AddEventAttrValue,
    Calendar,
    DeleteCalendar,
    DeleteCalendarResponse,
    DeleteEvent,
    GetCalendars,
    GetCalendarsResponse,
    PutCalendar,
    PutCalendarResponse,
    SetCalendarAttr,
    Event,
    GetEvent,
    GetEvents,
    GetEventsResponse,
    MalformedObject,
    PutEvent,
    PutEventResponse,
    SetEventAttr,
    type EventData,
} from "$module/calendar/v1";
import { ERRORS, NotFoundError, PRIMARY, install_fake_soba, type FakeSoba } from "../test/soba";

let soba: FakeSoba;

beforeEach(async () => {
    soba = await install_fake_soba();
});

const put = (content: Partial<EventData>) => soba.run<PutEventResponse>(new PutEvent(content))!.uuid;
const get = (uuid: string) =>
    soba.run<Event>({ process: () => new GetEvent({ uuid }).process(ERRORS) });
const list = (content: ConstructorParameters<typeof GetEvents>[0] = {}) =>
    soba.run<GetEventsResponse>(new GetEvents({ limit: 100, offset: 0, ...content }))!.data;
const titles = (events: Event[]) => events.map((e) => e.title).sort();
const count = (table: string) => soba.sql(`SELECT count(*) FROM ${table}`)[0][0];

const STANDUP = {
    title: "Standup",
    start: "2026-10-15T09:00",
    end: "2026-10-15T09:15",
    location: "Room 4",
    desc: "daily",
    attendees: ["a@example.com", "b@example.com"],
};

describe("PutEvent", () => {
    it("creates an event under a minted uuid with every attr", () => {
        const uuid = put({ ...STANDUP, allDay: 1, callUrl: "https://meet.example.com/x" });
        expect(uuid).toMatch(/^\{00000000-0000-4000-8000-\d{12}\}$/);
        expect(get(uuid)).toMatchObject({
            ...STANDUP,
            uuid,
            // sent without a calendar: the primary one
            cal: PRIMARY,
            callUrl: "https://meet.example.com/x",
            // booleans are stored as 0/1
            allDay: 1,
            call: 1,
        });
    });

    describe("call link", () => {
        it("derives call from callUrl, whatever call was sent", () => {
            expect(get(put({ ...STANDUP, call: 1 }))).toMatchObject({ callUrl: "", call: 0 });
            expect(get(put({ ...STANDUP, call: 0, callUrl: "http://x.example/r" }))).toMatchObject(
                { callUrl: "http://x.example/r", call: 1 },
            );
        });

        it("stores the link trimmed and clears it on edit", () => {
            const uuid = put({ ...STANDUP, callUrl: "  https://meet.example.com/x \n" });
            expect(get(uuid)!.callUrl).toBe("https://meet.example.com/x");
            put({ ...STANDUP, uuid, callUrl: "" });
            expect(get(uuid)).toMatchObject({ callUrl: "", call: 0 });
        });

        it("reads a stored call=1 row without a link as call 1, callUrl ''", () => {
            const uuid = put(STANDUP);
            soba.sql("DELETE FROM event_attr_single WHERE key = 'callUrl'");
            soba.sql("UPDATE event_attr_single SET value = 1 WHERE key = 'call'");
            expect(get(uuid)).toMatchObject({ callUrl: "", call: 1 });
            expect(list()[0]).toMatchObject({ callUrl: "", call: 1 });
        });
    });

    it("reads back as numbers the flags its text columns store as text", () => {
        const uuid = put(STANDUP);
        expect(
            soba.sql("SELECT key, value, typeof(value) FROM event_attr_single WHERE key IN ('allDay', 'call') ORDER BY key"),
        ).toEqual([
            ["allDay", "0", "text"],
            ["call", "0", "text"],
        ]);
        expect(get(uuid)).toMatchObject({ allDay: 0, call: 0 });
        expect(list()[0]).toMatchObject({ allDay: 0, call: 0 });
    });

    it("updates in place under the given uuid, clearing emptied fields", () => {
        const uuid = put(STANDUP);
        expect(put({ ...STANDUP, uuid, title: "Retro", location: "" })).toBe(uuid);
        expect(count("event")).toBe(1);
        expect(get(uuid)).toMatchObject({ title: "Retro", location: "" });
    });

    it("replaces a changed guest list, dropping a removed guest", () => {
        const uuid = put(STANDUP);
        put({ ...STANDUP, uuid, attendees: ["b@example.com"] });
        expect(get(uuid)!.attendees).toEqual(["b@example.com"]);
        expect(count("event_attr_multi_value")).toBe(1);
    });

    it("leaves an unchanged guest list untouched", () => {
        const uuid = put(STANDUP);
        const before = soba.sql("SELECT id FROM event_attr_multi_value ORDER BY id");
        put({ ...STANDUP, uuid, attendees: ["b@example.com", "a@example.com"] });
        expect(soba.sql("SELECT id FROM event_attr_multi_value ORDER BY id")).toEqual(before);
    });

    it("drops the list container when the guests are cleared", () => {
        const uuid = put(STANDUP);
        put({ ...STANDUP, uuid, attendees: [] });
        expect(count("event_attr_multi")).toBe(0);
        expect(count("event_attr_multi_value")).toBe(0);
        // GetEvent leaves the constructor default
        expect(get(uuid)!.attendees).toEqual([]);
    });

    it("stores the title trimmed", () => {
        expect(get(put({ ...STANDUP, title: "  Standup \n" }))!.title).toBe("Standup");
    });

    it("takes an event that ends when it starts", () => {
        expect(() => put({ ...STANDUP, end: STANDUP.start })).not.toThrow();
    });

    describe("time zone", () => {
        it("stores the zone the times are in", () => {
            const uuid = put({ ...STANDUP, tz: "Europe/Istanbul" });
            expect(get(uuid)).toMatchObject({ start: STANDUP.start, tz: "Europe/Istanbul" });
            expect(list()[0]).toMatchObject({ tz: "Europe/Istanbul" });
        });

        it("keeps the zone when saved without one", () => {
            const uuid = put({ ...STANDUP, tz: "Asia/Tokyo" });
            put({ ...STANDUP, uuid, title: "Retro" });
            expect(get(uuid)).toMatchObject({ title: "Retro", tz: "Asia/Tokyo" });
        });

        it("reads an event stored without a zone as tz ''", () => {
            const uuid = put(STANDUP);
            expect(new Event(get(uuid)!).tz).toBe("");
            expect(new Event(list()[0]).tz).toBe("");
        });
    });

    describe("sequence", () => {
        it("stores the sequence when sent, reads it back as a number, keeps it otherwise", () => {
            const uuid = put(STANDUP);
            expect(get(uuid)!.sequence).toBe(0);
            put({ ...STANDUP, uuid, sequence: 2 });
            expect(get(uuid)!.sequence).toBe(2);
            expect(list()[0].sequence).toBe(2);
            put({ ...STANDUP, uuid, title: "Retro" });
            expect(get(uuid)).toMatchObject({ title: "Retro", sequence: 2 });
        });
    });

    describe("refuses malformed content", () => {
        it.each<[string, Partial<EventData>]>([
            ["a negative sequence", { sequence: -1 }],
            ["a fractional sequence", { sequence: 1.5 }],
            ["a sequence that is no number", { sequence: "2" as unknown as number }],
            ["an empty title", { title: "" }],
            ["a blank title", { title: "  \t" }],
            ["no start", { start: "" }],
            ["no end", { end: "" }],
            ["a start that is no local ISO datetime", { start: "2026-10-15 09:00" }],
            ["an end with seconds", { end: "2026-10-15T09:15:00" }],
            ["a date-only start", { start: "2026-10-15" }],
            ["an end before the start", { end: "2026-10-15T08:59" }],
            ["a calendar that is no string", { cal: 7 as unknown as string }],
            ["a call link that is no http(s) URL", { callUrl: "javascript:alert(1)" }],
            ["a call link without a host", { callUrl: "https://" }],
            ["a call link with blanks inside", { callUrl: "https://a.example/x y" }],
            ["a call link that is no string", { callUrl: 7 as unknown as string }],
            ["a zone that is no string", { tz: 7 as unknown as string }],
            ["a zone with blanks (a Windows name)", { tz: "Pacific Standard Time" }],
            ["a zone that is a path", { tz: "../etc/passwd" }],
        ])("%s", (_, change) => {
            expect(() => new PutEvent({ ...STANDUP, ...change })).toThrow(MalformedObject);
        });
    });
});

describe("replicated events refuse content without their keys", () => {
    it.each<[string, () => unknown]>([
        ["AddEvent", () => new AddEvent({} as never)],
        ["SetEventAttr without event", () => new SetEventAttr({ key: "title" } as never)],
        ["SetEventAttr without key", () => new SetEventAttr({ event: "{e}" } as never)],
        ["AddEventAttr without event", () => new AddEventAttr({ key: "attendees" } as never)],
        ["AddEventAttr without key", () => new AddEventAttr({ event: "{e}" } as never)],
        ["AddEventAttrValue without event", () => new AddEventAttrValue({ key: "a" } as never)],
        ["AddEventAttrValue without key", () => new AddEventAttrValue({ event: "{e}" } as never)],
    ])("%s", (_, make) => {
        expect(make).toThrow(MalformedObject);
    });
});

describe("replicated events describe themselves", () => {
    const E = "{e}";
    it.each<[string, { asText(locale: string): string; toString(): string }, string]>([
        ["AddEvent({e})", new AddEvent({ uuid: E }), "Add event {e}"],
        [
            "SetEventAttr({e}, 'title', 'Standup')",
            new SetEventAttr({ event: E, key: "title", value: "Standup" }),
            "Set title of event {e} to 'Standup'",
        ],
        [
            "AddEventAttr({e}, 'attendees')",
            new AddEventAttr({ event: E, key: "attendees" }),
            "Start the attendees list of event {e}",
        ],
        [
            "AddEventAttrValue({e}, 'attendees', 'a@example.com')",
            new AddEventAttrValue({ event: E, key: "attendees", value: "a@example.com" }),
            "Add 'a@example.com' to the attendees of event {e}",
        ],
    ])("%s", (string, event, text) => {
        expect(event.asText("en")).toBe(text);
        expect(event.toString()).toBe(string);
    });
});

describe("GetEvents", () => {
    // events that start and end at `start`
    const at = (start: string) => ({ start, end: start });

    beforeEach(() => {
        put({ ...STANDUP, title: "Before", ...at("2026-09-30T23:59") });
        put({ ...STANDUP, title: "First", ...at("2026-10-01T00:00") });
        put({ ...STANDUP, title: "Last", ...at("2026-10-31T23:59") });
        put({ ...STANDUP, title: "After", ...at("2026-11-01T00:00") });
    });

    it("returns the events starting inside [from, to)", () => {
        expect(titles(list({ from: "2026-10-01", to: "2026-11-01" }))).toEqual(["First", "Last"]);
    });

    it("returns every event without a window", () => {
        expect(list()).toHaveLength(4);
    });

    describe("multi-day events", () => {
        beforeEach(() => {
            put({ ...STANDUP, title: "Trip", start: "2026-09-28T00:00", end: "2026-10-02T23:59" });
            put({ ...STANDUP, title: "Overnight", start: "2026-10-31T22:00", end: "2026-11-01T02:00" });
        });

        it("returns an event that started before the window and ends inside it", () => {
            expect(titles(list({ from: "2026-10-01", to: "2026-10-02" }))).toEqual(["First", "Trip"]);
        });

        it("returns an event spanning the whole window", () => {
            expect(titles(list({ from: "2026-09-29", to: "2026-09-30" }))).toEqual(["Trip"]);
        });

        it("returns an event that ends after the window", () => {
            expect(titles(list({ from: "2026-10-31", to: "2026-11-01" }))).toEqual(["Last", "Overnight"]);
        });

        it("leaves out an event that ended before the window", () => {
            expect(titles(list({ from: "2026-10-03", to: "2026-10-31" }))).toEqual([]);
        });

        it("pages in start order", () => {
            expect(list({ from: "2026-10-01", to: "2026-11-01" }).map((e) => e.title)).toEqual([
                "Trip",
                "First",
                "Overnight",
                "Last",
            ]);
        });
    });

    it("returns each event whole, guest list included", () => {
        const [first] = list({ from: "2026-10-01", to: "2026-10-02" });
        expect(first).toBeInstanceOf(Event);
        expect(first).toMatchObject({ ...STANDUP, title: "First", ...at("2026-10-01T00:00") });
    });

    it("pages with limit and offset in start order", () => {
        const page = (offset: number) =>
            list({ from: "2026-09-01", to: "2026-12-01", limit: 2, offset }).map((e) => e.start);
        expect(page(0)).toEqual(["2026-09-30T23:59", "2026-10-01T00:00"]);
        expect(page(2)).toEqual(["2026-10-31T23:59", "2026-11-01T00:00"]);
    });

    describe("filter", () => {
        beforeEach(() => {
            put({ title: "Dentist", ...at("2026-10-10T10:00"), location: "Main St" });
            put({ title: "Lunch", ...at("2026-10-11T12:00"), desc: "bring the SLIDES" });
            put({ title: "Sync", ...at("2026-10-12T15:00"), attendees: ["Zed@example.com"] });
        });

        it("matches title, location, description and guests, ignoring case", () => {
            const hits = (filter: string) => titles(list({ filter }));
            expect(hits("dentist")).toEqual(["Dentist"]);
            expect(hits("main st")).toEqual(["Dentist"]);
            expect(hits("slides")).toEqual(["Lunch"]);
            expect(hits("zed@")).toEqual(["Sync"]);
            expect(hits("nothing like this")).toEqual([]);
        });

        it("combines with the window", () => {
            expect(titles(list({ from: "2026-10-11", to: "2026-10-12", filter: "l" }))).toEqual([
                "Lunch",
            ]);
        });

        it("ignores accents and case beyond ascii", () => {
            put({ title: "Şahin İLKAY", ...at("2026-10-13T09:00"), location: "Café Müller" });
            const hits = (filter: string) => titles(list({ filter }));
            expect(hits("sahin")).toEqual(["Şahin İLKAY"]);
            expect(hits("ŞAHİN")).toEqual(["Şahin İLKAY"]);
            expect(hits("ilkay")).toEqual(["Şahin İLKAY"]);
            expect(hits("ılkay")).toEqual(["Şahin İLKAY"]);
            expect(hits("cafe muller")).toEqual(["Şahin İLKAY"]);
        });

        it("takes % and _ literally", () => {
            put({ title: "50% off", ...at("2026-10-14T09:00"), desc: "snake_case" });
            const hits = (filter: string) => titles(list({ filter }));
            expect(hits("%")).toEqual(["50% off"]);
            expect(hits("_")).toEqual(["50% off"]);
            expect(hits("d%t")).toEqual([]);
            expect(hits("l_nch")).toEqual([]);
        });

        it("pages the hits in start order, not the window", () => {
            put({ title: "Review B", ...at("2026-10-20T09:00") });
            put({ title: "Review A", ...at("2026-10-02T09:00") });
            const page = (offset: number) =>
                list({ from: "2026-09-01", to: "2026-12-01", filter: "review", limit: 1, offset })
                    .map((e) => e.title);
            expect(page(0)).toEqual(["Review A"]);
            expect(page(1)).toEqual(["Review B"]);
            expect(page(2)).toEqual([]);
        });

        it("returns each hit whole", () => {
            const [sync] = list({ filter: "zed" });
            expect(sync).toMatchObject({ title: "Sync", attendees: ["Zed@example.com"] });
        });
    });
});

describe("GetEvent", () => {
    it("responds nothing without a uuid", () => {
        expect(get("")).toBeUndefined();
    });

    it("throws the base module's NotFoundError for an unknown uuid", () => {
        put(STANDUP);
        expect(() => get("{unknown}")).toThrow(NotFoundError);
        expect(() => get("{unknown}")).toThrow("No event {unknown}");
    });

    it("throws NotFoundError for a deleted event", () => {
        const uuid = put(STANDUP);
        soba.run(new DeleteEvent({ uuid }));
        expect(() => get(uuid)).toThrow(NotFoundError);
    });
});

describe("calendars", () => {
    const putCal = (content: ConstructorParameters<typeof PutCalendar>[0]) =>
        soba.run<PutCalendarResponse>(new PutCalendar(content))!.uuid;
    const cals = () => soba.run<GetCalendarsResponse>(new GetCalendars())!.data;
    const delCal = (uuid: string) =>
        soba.run<DeleteCalendarResponse>(new DeleteCalendar({ uuid }))!;
    // every calendar but the primary one
    const others = () => cals().filter((c) => !c.primary);

    describe("the primary calendar", () => {
        it("is listed on a fresh instance: the instance id, no name, the palette's blue", () => {
            expect(cals()).toEqual([
                new Calendar({ uuid: PRIMARY, name: "", color: "#4180ff", primary: 1 }),
            ]);
        });

        it("is created once", () => {
            cals();
            cals();
            expect(count("calendar")).toBe(1);
            expect(count("calendar_attr")).toBe(1);
        });

        it("takes an event sent without a calendar, created if need be", () => {
            const uuid = put(STANDUP);
            expect(get(uuid)!.cal).toBe(PRIMARY);
            expect(count("calendar")).toBe(1);
        });

        it("is renamed and recolored like any other, staying first", () => {
            putCal({ name: "Band", color: "#000000" });
            expect(putCal({ uuid: PRIMARY, name: "Home", color: "#00C400" })).toBe(PRIMARY);
            expect(cals()).toEqual([
                new Calendar({ uuid: PRIMARY, name: "Home", color: "#00c400", primary: 1 }),
                expect.objectContaining({ name: "Band", primary: 0 }),
            ]);
        });

        it("can't be deleted", () => {
            cals();
            expect(delCal(PRIMARY)).toEqual(new DeleteCalendarResponse({ deleted: 0, events: 0 }));
            expect(soba.warnings).toEqual(["The primary calendar can't be deleted"]);
            expect(cals()).toHaveLength(1);
        });
    });

    it("creates a calendar under a minted uuid and lists it", () => {
        const uuid = putCal({ name: "  Book club ", color: "#8E44AD" });
        expect(uuid).toMatch(/^\{00000000-0000-4000-8000-\d{12}\}$/);
        const [cal] = others();
        expect(cal).toBeInstanceOf(Calendar);
        // the name is stored trimmed, the color lowercased
        expect(cal).toEqual(new Calendar({ uuid, name: "Book club", color: "#8e44ad" }));
    });

    it("renames and recolors in place", () => {
        const uuid = putCal({ name: "Book club", color: "#8e44ad" });
        expect(putCal({ uuid, name: "Reading", color: "#16a085" })).toBe(uuid);
        expect(count("calendar")).toBe(1);
        expect(others()).toEqual([new Calendar({ uuid, name: "Reading", color: "#16a085" })]);
    });

    it("lists the primary calendar first, then by name, ignoring case and accents", () => {
        putCal({ name: "zoo", color: "#000000" });
        putCal({ name: "Écoles", color: "#000000" });
        putCal({ name: "Band", color: "#000000" });
        expect(cals().map((c) => c.name)).toEqual(["", "Band", "Écoles", "zoo"]);
    });

    it("deletes a calendar no event uses", () => {
        const uuid = putCal({ name: "Book club", color: "#8e44ad" });
        expect(delCal(uuid)).toEqual(new DeleteCalendarResponse({ deleted: 1, events: 0 }));
        expect(others()).toEqual([]);
        expect(soba.sql("SELECT count(*) FROM calendar_attr WHERE calendar = ?", uuid)[0][0]).toBe(0);
    });

    it("refuses to delete a calendar events use, and says how many", () => {
        const uuid = putCal({ name: "Book club", color: "#8e44ad" });
        put({ ...STANDUP, cal: uuid });
        put({ ...STANDUP, cal: uuid, title: "Again" });
        put(STANDUP);
        expect(delCal(uuid)).toEqual(new DeleteCalendarResponse({ deleted: 0, events: 2 }));
        expect(others()).toHaveLength(1);
    });

    it("logs an unknown uuid on delete and returns instead of throwing", () => {
        expect(delCal("{unknown}")).toEqual(
            new DeleteCalendarResponse({ deleted: 0, events: 0 }),
        );
        expect(soba.warnings).toEqual(["No calendar {unknown} to delete"]);
    });

    it("refuses an event on a calendar that isn't stored, writing nothing", () => {
        expect(() => put({ ...STANDUP, cal: "work" })).toThrow(MalformedObject);
        expect(() => put({ ...STANDUP, cal: "{gone}" })).toThrow("PutEvent.cal '{gone}' names no calendar");
        expect(count("event")).toBe(0);
    });

    it("keeps events on a deleted calendar's id readable", () => {
        const cal = putCal({ name: "Book club", color: "#8e44ad" });
        const uuid = put({ ...STANDUP, cal });
        // as another replica's delete, concurrent with the save, leaves it
        soba.sql("DELETE FROM calendar WHERE uuid = ?", cal);
        expect(get(uuid)!.cal).toBe(cal);
    });

    describe("refuses malformed content", () => {
        it.each<[string, () => unknown]>([
            ["PutCalendar with an empty name", () => new PutCalendar({ name: "", color: "#000000" })],
            ["PutCalendar with a blank name", () => new PutCalendar({ name: " \t", color: "#000000" })],
            ["PutCalendar with no color", () => new PutCalendar({ name: "x" })],
            ["PutCalendar with a named color", () => new PutCalendar({ name: "x", color: "red" })],
            ["PutCalendar with a short color", () => new PutCalendar({ name: "x", color: "#fff" })],
            ["DeleteCalendar without a uuid", () => new DeleteCalendar({} as never)],
            ["AddCalendar without a uuid", () => new AddCalendar({} as never)],
            ["SetCalendarAttr without calendar", () => new SetCalendarAttr({ key: "name" } as never)],
            ["SetCalendarAttr without key", () => new SetCalendarAttr({ calendar: "{c}" } as never)],
        ])("%s", (_, make) => {
            expect(make).toThrow(MalformedObject);
        });
    });

    it("describes its replicated events", () => {
        const add = new AddCalendar({ uuid: "{c}" });
        expect(add.asText("en")).toBe("Add calendar {c}");
        expect(add.toString()).toBe("AddCalendar({c})");
        const set = new SetCalendarAttr({ calendar: "{c}", key: "name", value: "Book club" });
        expect(set.asText("en")).toBe("Set name of calendar {c} to 'Book club'");
        expect(set.toString()).toBe("SetCalendarAttr({c}, 'name', 'Book club')");
    });
});

describe("DeleteEvent", () => {
    it("deletes the event with its attrs and guests", () => {
        const uuid = put(STANDUP);
        expect(soba.run(new DeleteEvent({ uuid }))).toBeUndefined();
        for (const table of [
            "event",
            "event_attr_single",
            "event_attr_multi",
            "event_attr_multi_value",
        ]) {
            expect(count(table)).toBe(0);
        }
    });

    it("logs an unknown uuid and returns instead of throwing", () => {
        put(STANDUP);
        expect(() => soba.run(new DeleteEvent({ uuid: "{unknown}" }))).not.toThrow();
        expect(soba.warnings).toEqual(["No event {unknown} to delete"]);
        expect(count("event")).toBe(1);
    });

    it("refuses content without a uuid", () => {
        const make = () => new DeleteEvent({} as { uuid: string });
        expect(make).toThrow(MalformedObject);
        expect(make).toThrow("Missing Event.uuid");
    });
});
