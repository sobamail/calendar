// The iCalendar (RFC 5545) writer and parser of ics.ts.

import { afterEach, describe, expect, it } from "vitest";
import { parse_ics as module_parse_ics } from "$module/calendar/v1";
import { ics_filename, parse_ics, write_ics } from "./ics";
import { setZone, ymd } from "./dates";
import type { CalendarEvent } from "./types";

const CRLF = String.fromCharCode(13, 10);

// a test that pins the browser's zone gets the real one back
afterEach(() => setZone(null));

const NOW = new Date(Date.UTC(2026, 9, 15, 8, 30, 0));

// the content lines, folding undone
const unfold = (text: string) => text.split(CRLF + " ").join("").split(CRLF).filter(Boolean);

// the VEVENT's lines only
const vevent = (text: string) => {
    const lines = unfold(text);
    return lines.slice(lines.indexOf("BEGIN:VEVENT"), lines.indexOf("END:VEVENT") + 1);
};

const ev = (init: Partial<CalendarEvent>): CalendarEvent => ({
    id: "{00000000-0000-4000-8000-000000000001}",
    date: "2026-07-08",
    endDate: "2026-07-08",
    s: 9.5,
    e: 10.75,
    cal: "work",
    title: "Standup",
    ...init,
});

// the local date and fractional hour of an instant, as the parser reports a zoned time
const local = (utc: number) => {
    const d = new Date(utc);
    return { date: ymd(d), hour: d.getHours() + d.getMinutes() / 60 };
};

describe("write_ics", () => {
    it("wraps the events in one VCALENDAR with the fields a client imports", () => {
        const text = write_ics(
            [
                ev({
                    location: "Room 4",
                    desc: "Daily",
                    attendees: ["a@example.com", "b@example.com"],
                    callUrl: "https://meet.example.com/abc",
                }),
            ],
            { now: NOW },
        );

        expect(text.endsWith(CRLF)).toBe(true);
        const lines = unfold(text);
        expect(lines.slice(0, 5)).toEqual([
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Sobamail//Calendar//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
        ]);
        expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
        expect(vevent(text)).toEqual([
            "BEGIN:VEVENT",
            "UID:00000000-0000-4000-8000-000000000001",
            "DTSTAMP:20261015T083000Z",
            "SEQUENCE:0",
            "STATUS:CONFIRMED",
            "SUMMARY:Standup",
            "DTSTART:20260708T093000",
            "DTEND:20260708T104500",
            "LOCATION:Room 4",
            "DESCRIPTION:Daily",
            "URL:https://meet.example.com/abc",
            "ATTENDEE:mailto:a@example.com",
            "ATTENDEE:mailto:b@example.com",
            "END:VEVENT",
        ]);
    });

    it("writes the event's sequence, so a client takes an update for one", () => {
        expect(vevent(write_ics([ev({ sequence: 3 })], { now: NOW }))).toContain("SEQUENCE:3");
    });

    it("writes an all-day event as dates, DTEND the day after the last", () => {
        const text = write_ics([ev({ allDay: true, endDate: "2026-07-10", s: 0, e: 23.98 })], {
            now: NOW,
        });
        const lines = vevent(text);
        expect(lines).toContain("DTSTART;VALUE=DATE:20260708");
        expect(lines).toContain("DTEND;VALUE=DATE:20260711");
    });

    it("writes a multi-day timed event with its end on the end date", () => {
        const lines = vevent(write_ics([ev({ endDate: "2026-07-09", s: 22, e: 2 })], { now: NOW }));
        expect(lines).toContain("DTSTART:20260708T220000");
        expect(lines).toContain("DTEND:20260709T020000");
    });

    it("writes the times in the event's zone, as a TZID or as UTC", () => {
        setZone("UTC");
        // the UI's times are the browser's (UTC here); the file has them in the event's zone
        const tokyo = vevent(write_ics([ev({ s: 9, e: 10, tz: "Asia/Tokyo" })], { now: NOW }));
        expect(tokyo).toContain("DTSTART;TZID=Asia/Tokyo:20260708T180000");
        expect(tokyo).toContain("DTEND;TZID=Asia/Tokyo:20260708T190000");

        const utc = vevent(write_ics([ev({ s: 9, e: 10, tz: "UTC" })], { now: NOW }));
        expect(utc).toContain("DTSTART:20260708T090000Z");
        expect(utc).toContain("DTEND:20260708T100000Z");

        // all-day events stay dates, whatever their zone
        const day = vevent(write_ics([ev({ allDay: true, tz: "Asia/Tokyo" })], { now: NOW }));
        expect(day).toContain("DTSTART;VALUE=DATE:20260708");
    });

    it("reads back the zone it wrote", () => {
        setZone("UTC");
        const [got] = parse_ics(write_ics([ev({ s: 9, e: 10, tz: "Asia/Tokyo" })], { now: NOW })).events;
        expect(got).toMatchObject({ date: "2026-07-08", s: 9, e: 10, tz: "Asia/Tokyo" });
    });

    it("names the method and the organizer of a request", () => {
        const text = write_ics([ev({ attendees: ["a@example.com"] })], {
            method: "REQUEST",
            organizer: "me@example.com",
            now: NOW,
        });
        expect(unfold(text)).toContain("METHOD:REQUEST");
        expect(vevent(text)).toContain("ORGANIZER:mailto:me@example.com");
    });

    it("escapes backslash, semicolon, comma and line breaks in text", () => {
        const lines = vevent(
            write_ics([ev({ title: "a;b,c\\d", desc: "one\ntwo\r\nthree" })], { now: NOW }),
        );
        expect(lines).toContain("SUMMARY:a\\;b\\,c\\\\d");
        expect(lines).toContain("DESCRIPTION:one\\ntwo\\nthree");
    });

    it("folds at 75 octets without splitting a character", () => {
        const title = "ğ".repeat(30) + "x".repeat(10) + "😀".repeat(20);
        const text = write_ics([ev({ title })], { now: NOW });
        const enc = new TextEncoder();
        for (const physical of text.split(CRLF)) {
            expect(enc.encode(physical).length).toBeLessThanOrEqual(75);
            // a split surrogate pair or a lone byte sequence would not survive a round trip
            expect(physical).not.toMatch(/[\uD800-\uDBFF]$/);
        }
        expect(vevent(text)).toContain(`SUMMARY:${title}`);
    });
});

describe("ics_filename", () => {
    it("names one event after its title and many after the calendar", () => {
        expect(ics_filename([ev({ title: "Plan: Q4/Q1?" })])).toBe("Plan_ Q4_Q1_.ics");
        expect(ics_filename([ev({}), ev({})])).toBe("calendar.ics");
        expect(ics_filename([ev({ title: "" })])).toBe("event.ics");
    });
});

describe("parse_ics", () => {
    it("reads back what write_ics wrote", () => {
        const events = [
            ev({
                location: "Room 4",
                desc: "a;b,c\\d\nnext",
                attendees: ["a@example.com"],
                callUrl: "https://meet.example.com/abc",
            }),
            ev({ id: "{2}", title: "Trip", allDay: true, endDate: "2026-07-12", s: 0, e: 0 }),
            ev({ id: "{3}", title: "Night", endDate: "2026-07-09", s: 22, e: 2 }),
        ];
        const { events: got, skipped, method } = parse_ics(write_ics(events, { now: NOW }));
        expect(skipped).toBe(0);
        expect(method).toBe("PUBLISH");
        expect(got).toEqual([
            {
                uid: "00000000-0000-4000-8000-000000000001",
                title: "Standup",
                date: "2026-07-08",
                endDate: "2026-07-08",
                s: 9.5,
                e: 10.75,
                allDay: false,
                location: "Room 4",
                desc: "a;b,c\\d\nnext",
                attendees: ["a@example.com"],
                callUrl: "https://meet.example.com/abc",
                organizer: "",
                status: "CONFIRMED",
                sequence: 0,
                tz: "",
            },
            expect.objectContaining({
                uid: "2",
                title: "Trip",
                date: "2026-07-08",
                endDate: "2026-07-12",
                allDay: true,
            }),
            expect.objectContaining({ date: "2026-07-08", endDate: "2026-07-09", s: 22, e: 2 }),
        ]);
    });

    it("reads a Google Calendar export: UTC times, a TZID'd time, an all-day day", () => {
        const text = [
            "BEGIN:VCALENDAR",
            "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
            "VERSION:2.0",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "X-WR-CALNAME:me@gmail.com",
            "X-WR-TIMEZONE:Europe/Istanbul",
            "BEGIN:VEVENT",
            "DTSTART:20261020T070000Z",
            "DTEND:20261020T080000Z",
            "DTSTAMP:20261015T101010Z",
            "ORGANIZER;CN=Me:mailto:me@gmail.com",
            "UID:abc123@google.com",
            "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Some O",
            " ne;X-NUM-GUESTS=0:mailto:some@example.com",
            "X-GOOGLE-CONFERENCE:https://meet.google.com/aaa-bbbb-ccc",
            "CREATED:20261001T090000Z",
            "DESCRIPTION:Agenda:\\n- one\\n- two",
            "LAST-MODIFIED:20261002T090000Z",
            "LOCATION:Office\\, 3rd floor",
            "SEQUENCE:2",
            "STATUS:CONFIRMED",
            "SUMMARY:Review",
            "TRANSP:OPAQUE",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            "DESCRIPTION:This is an event reminder",
            "TRIGGER:-P0DT0H10M0S",
            "END:VALARM",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "DTSTART;TZID=America/New_York:20261021T090000",
            "DTEND;TZID=America/New_York:20261021T093000",
            "UID:def456@google.com",
            "SUMMARY:Call NY",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "DTSTART;VALUE=DATE:20261029",
            "DTEND;VALUE=DATE:20261030",
            "UID:ghi789@google.com",
            "SUMMARY:Holiday",
            "STATUS:CONFIRMED",
            "END:VEVENT",
            "END:VCALENDAR",
            "",
        ].join(CRLF);

        const { events, skipped } = parse_ics(text);
        expect(skipped).toBe(0);
        expect(events).toHaveLength(3);

        const [review, ny, holiday] = events;
        const s = local(Date.UTC(2026, 9, 20, 7, 0));
        const e = local(Date.UTC(2026, 9, 20, 8, 0));
        expect(review).toEqual({
            uid: "abc123@google.com",
            title: "Review",
            date: s.date,
            endDate: e.date,
            s: s.hour,
            e: e.hour,
            allDay: false,
            location: "Office, 3rd floor",
            desc: "Agenda:\n- one\n- two",
            attendees: ["some@example.com"],
            callUrl: "https://meet.google.com/aaa-bbbb-ccc",
            organizer: "me@gmail.com",
            status: "CONFIRMED",
            sequence: 2,
            tz: "UTC",
        });

        // 09:00 in New York on Oct 21 2026 (EDT, -4) is 13:00 UTC
        const nys = local(Date.UTC(2026, 9, 21, 13, 0));
        const nye = local(Date.UTC(2026, 9, 21, 13, 30));
        expect(ny).toEqual(
            expect.objectContaining({
                date: nys.date,
                s: nys.hour,
                endDate: nye.date,
                e: nye.hour,
                tz: "America/New_York",
            }),
        );

        expect(holiday).toEqual(
            expect.objectContaining({
                title: "Holiday",
                date: "2026-10-29",
                endDate: "2026-10-29",
                allDay: true,
            }),
        );
    });

    it("reads an Outlook invitation: a Windows TZID kept as written, a Teams link", () => {
        const text = [
            "BEGIN:VCALENDAR",
            "METHOD:REQUEST",
            "PRODID:Microsoft Exchange Server 2010",
            "VERSION:2.0",
            "BEGIN:VTIMEZONE",
            "TZID:Pacific Standard Time",
            "BEGIN:STANDARD",
            "DTSTART:16010101T020000",
            "TZOFFSETFROM:-0700",
            "TZOFFSETTO:-0800",
            "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=1SU;BYMONTH=11",
            "END:STANDARD",
            "BEGIN:DAYLIGHT",
            "DTSTART:16010101T020000",
            "TZOFFSETFROM:-0800",
            "TZOFFSETTO:-0700",
            "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=2SU;BYMONTH=3",
            "END:DAYLIGHT",
            "END:VTIMEZONE",
            "BEGIN:VEVENT",
            'ORGANIZER;CN="Boss, The":MAILTO:boss@contoso.com',
            'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="Me":MAILTO:',
            "\tme@example.com",
            "ATTENDEE;ROLE=OPT-PARTICIPANT;RSVP=TRUE:mailto:other@example.com",
            "DESCRIPTION;LANGUAGE=en-US:Quarterly planning.\\n",
            "UID:040000008200E00074C5B7101A82E00800000000",
            "SUMMARY;LANGUAGE=en-US:Planning",
            "DTSTART;TZID=Pacific Standard Time:20261022T140000",
            "DTEND;TZID=Pacific Standard Time:20261022T153000",
            "CLASS:PUBLIC",
            "PRIORITY:5",
            "DTSTAMP:20261015T120000Z",
            "TRANSP:OPAQUE",
            "STATUS:CONFIRMED",
            "SEQUENCE:0",
            "LOCATION;LANGUAGE=en-US:Microsoft Teams Meeting",
            "X-MICROSOFT-SKYPETEAMSMEETINGURL:https://teams.microsoft.com/l/meetup-join/x",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join(CRLF);

        const { events, method } = parse_ics(text);
        expect(method).toBe("REQUEST");
        expect(events).toEqual([
            {
                uid: "040000008200E00074C5B7101A82E00800000000",
                title: "Planning",
                date: "2026-10-22",
                endDate: "2026-10-22",
                s: 14,
                e: 15.5,
                allDay: false,
                location: "Microsoft Teams Meeting",
                desc: "Quarterly planning.",
                attendees: ["me@example.com", "other@example.com"],
                callUrl: "https://teams.microsoft.com/l/meetup-join/x",
                organizer: "boss@contoso.com",
                status: "CONFIRMED",
                sequence: 0,
                tz: "",
            },
        ]);
    });

    it("takes the end from DURATION, or the start when there is neither", () => {
        const cal = (...lines: string[]) =>
            ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:x", ...lines, "END:VEVENT", "END:VCALENDAR"].join(
                "\n",
            );
        const [a] = parse_ics(cal("DTSTART:20260708T090000", "DURATION:PT1H30M")).events;
        expect(a).toEqual(expect.objectContaining({ date: "2026-07-08", s: 9, endDate: "2026-07-08", e: 10.5 }));

        const [b] = parse_ics(cal("DTSTART:20260708T230000", "DURATION:P1DT2H")).events;
        expect(b).toEqual(expect.objectContaining({ endDate: "2026-07-10", e: 1 }));

        const [c] = parse_ics(cal("DTSTART;VALUE=DATE:20260708", "DURATION:P3D")).events;
        expect(c).toEqual(expect.objectContaining({ allDay: true, endDate: "2026-07-10" }));

        const [d] = parse_ics(cal("DTSTART;VALUE=DATE:20260708")).events;
        expect(d).toEqual(expect.objectContaining({ allDay: true, endDate: "2026-07-08" }));

        const [f] = parse_ics(cal("DTSTART:20260708T090000")).events;
        expect(f).toEqual(expect.objectContaining({ s: 9, endDate: "2026-07-08", e: 9 }));
    });

    it("ends an event that ends at midnight on the day before", () => {
        const text = [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            "SUMMARY:Late",
            "DTSTART:20260708T220000",
            "DTEND:20260709T000000",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join(CRLF);
        const [late] = parse_ics(text).events;
        expect(late.endDate).toBe("2026-07-08");
        expect(late.e).toBeCloseTo(24 - 1 / 60);
    });

    it("skips cancelled events and events without a start, and counts them", () => {
        const text = [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            "SUMMARY:Gone",
            "STATUS:CANCELLED",
            "DTSTART:20260708T090000",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "SUMMARY:No start",
            "END:VEVENT",
            "BEGIN:VTODO",
            "SUMMARY:Not an event",
            "DTSTART:20260708T090000",
            "END:VTODO",
            "BEGIN:VEVENT",
            "DTSTART:20260708T090000",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join(CRLF);
        const { events, skipped } = parse_ics(text);
        expect(skipped).toBe(2);
        expect(events).toEqual([expect.objectContaining({ title: "", date: "2026-07-08", s: 9 })]);
    });

    it("drops a URL that is not http(s) and attendees that are not addresses", () => {
        const text = [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            "DTSTART:20260708T090000",
            "URL:javascript:alert(1)",
            "ATTENDEE:mailto:ok@example.com",
            "ATTENDEE:urn:uuid:123",
            "ATTENDEE:MAILTO:ok@example.com",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join(CRLF);
        const [x] = parse_ics(text).events;
        expect(x.callUrl).toBe("");
        expect(x.attendees).toEqual(["ok@example.com"]);
    });

    it("reads nothing out of a file that is not iCalendar", () => {
        expect(parse_ics("BEGIN:VCARD\r\nFN:x\r\nEND:VCARD\r\n")).toEqual({
            events: [],
            skipped: 0,
            method: "",
        });
    });
});

// The parser itself lives in the calendar module, which reads mailed invitations with it;
// parse_ics above is its UI face, in dates and fractional hours.
describe("the module's parse_ics", () => {
    it("reports times as the stored local-naive ISO datetimes", () => {
        const text = [
            "BEGIN:VCALENDAR",
            "METHOD:REQUEST",
            "BEGIN:VEVENT",
            "UID:x@example.com",
            "SUMMARY:Late",
            "DTSTART:20260708T221500",
            "DTEND:20260709T000000",
            "ORGANIZER:mailto:boss@example.com",
            "SEQUENCE:3",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "SUMMARY:Trip",
            "DTSTART;VALUE=DATE:20260710",
            "DTEND;VALUE=DATE:20260713",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join(CRLF);
        const { events, skipped, method } = module_parse_ics(text);
        expect(method).toBe("REQUEST");
        expect(skipped).toBe(0);
        expect(events).toEqual([
            {
                uid: "x@example.com",
                title: "Late",
                start: "2026-07-08T22:15",
                end: "2026-07-08T23:59",
                allDay: false,
                location: "",
                desc: "",
                attendees: [],
                callUrl: "",
                organizer: "boss@example.com",
                status: "",
                sequence: 3,
                tz: "",
            },
            expect.objectContaining({
                start: "2026-07-10T00:00",
                end: "2026-07-12T23:59",
                allDay: true,
                tz: "",
            }),
        ]);
    });

    it("keeps a zoned time's wall clock and names its zone, whatever the runtime's is", () => {
        const cal = (...lines: string[]) =>
            ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:x", ...lines, "END:VEVENT", "END:VCALENDAR"].join(CRLF);
        const one = (...lines: string[]) => module_parse_ics(cal(...lines)).events[0];

        expect(one("DTSTART;TZID=America/New_York:20261021T090000", "DTEND;TZID=America/New_York:20261021T093000"))
            .toMatchObject({ start: "2026-10-21T09:00", end: "2026-10-21T09:30", tz: "America/New_York" });
        // a leading slash (a globally unique TZID) goes
        expect(one("DTSTART;TZID=/Europe/Istanbul:20261021T090000")).toMatchObject({ tz: "Europe/Istanbul" });
        expect(one("DTSTART:20261020T070000Z", "DTEND:20261020T080000Z"))
            .toMatchObject({ start: "2026-10-20T07:00", end: "2026-10-20T08:00", tz: "UTC" });
        // an end in another zone than the start is moved into the start's
        expect(one("DTSTART;TZID=Europe/Berlin:20260708T220000", "DTEND:20260708T210000Z"))
            .toMatchObject({ start: "2026-07-08T22:00", end: "2026-07-08T23:00", tz: "Europe/Berlin" });
        // floating, a Windows name: kept as written, in no zone (the browser's)
        expect(one("DTSTART:20261021T090000")).toMatchObject({ start: "2026-10-21T09:00", tz: "" });
        expect(one("DTSTART;TZID=Pacific Standard Time:20261021T090000"))
            .toMatchObject({ start: "2026-10-21T09:00", tz: "" });
        expect(one("DTSTART;VALUE=DATE:20261021")).toMatchObject({ allDay: true, tz: "" });
    });
});
