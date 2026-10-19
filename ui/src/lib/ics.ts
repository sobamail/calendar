// iCalendar (RFC 5545) export and import of events, done in the UI like Contacts' vCard:
// the backend only reads and writes the calendar. Times are written in the event's zone,
// as a TZID naming it or as UTC; an event without a zone is written floating. No
// VTIMEZONE is written: that every client resolves a bare IANA TZID is UNVERIFIED.

import { parse_ics as module_parse_ics } from "$module/calendar/v1";
import { addDays, convertZone, dateOf, hourOf, isoAt, parseYmd, ymd } from "./dates";
import type { CalendarEvent } from "./types";

const CRLF = "\r\n";

/** The last minute of a day, where an all-day event and a midnight end are stored. */
const END_OF_DAY = 24 - 1 / 60;

/** What write_ics() puts at the VCALENDAR level. */
export type IcsOptions = {
    /** PUBLISH (an export, the default) or REQUEST (an invitation). */
    method?: string;
    /** The organizer's address, written as ORGANIZER. */
    organizer?: string;
    /** DTSTAMP; now when not given. */
    now?: Date;
};

// a text value with backslash, semicolon, comma and line breaks escaped
function text(s: string | null | undefined): string {
    return String(s ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r\n|\r|\n/g, "\\n");
}

// a content line, folded at 75 octets of UTF-8 without splitting a character
function line(content: string): string {
    let ret = "";
    let octets = 0;
    for (const c of content) {
        const cp = c.codePointAt(0)!;
        const n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
        if (octets + n > 75) {
            ret += CRLF + " ";
            octets = 1;
        }
        ret += c;
        octets += n;
    }
    return ret + CRLF;
}

// "YYYY-MM-DD" -> "YYYYMMDD"
const basic_date = (date: string) => date.replace(/-/g, "");

// a property holding the browser's date and fractional hour as a DATE-TIME in zone
// `tz`: "NAME;TZID=tz:YYYYMMDDTHHMM00", "NAME:…Z" for UTC, floating without a zone
function date_time(name: string, date: string, hour: number, tz?: string): string {
    const iso = tz ? convertZone(isoAt(date, hour), "", tz) : isoAt(date, hour);
    const basic = iso.replace(/[-:]/g, "") + "00";
    if (!tz) return `${name}:${basic}`;
    return tz === "UTC" ? `${name}:${basic}Z` : `${name};TZID=${tz}:${basic}`;
}

function vevent(ev: CalendarEvent, organizer: string, stamp: string): string[] {
    const lines = [
        "BEGIN:VEVENT",
        `UID:${ev.id.replace(/[{}]/g, "")}`,
        `DTSTAMP:${stamp}`,
        `SEQUENCE:${ev.sequence ?? 0}`,
        "STATUS:CONFIRMED",
        `SUMMARY:${text(ev.title)}`,
    ];
    if (ev.allDay) {
        // DTEND of a date-only event is exclusive: the day after the last one
        lines.push(`DTSTART;VALUE=DATE:${basic_date(ev.date)}`);
        lines.push(`DTEND;VALUE=DATE:${basic_date(ymd(addDays(parseYmd(ev.endDate), 1)))}`);
    } else {
        lines.push(date_time("DTSTART", ev.date, ev.s, ev.tz));
        lines.push(date_time("DTEND", ev.endDate, ev.e, ev.tz));
    }
    if (ev.location) lines.push(`LOCATION:${text(ev.location)}`);
    if (ev.desc) lines.push(`DESCRIPTION:${text(ev.desc)}`);
    if (ev.callUrl) lines.push(`URL:${ev.callUrl}`);
    if (organizer) lines.push(`ORGANIZER:mailto:${organizer}`);
    for (const a of ev.attendees ?? []) lines.push(`ATTENDEE:mailto:${a}`);
    lines.push("END:VEVENT");
    return lines;
}

/** The iCalendar text of `events`, one VCALENDAR holding a VEVENT each. */
export function write_ics(events: CalendarEvent[], opts: IcsOptions = {}): string {
    const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]|\.\d+/g, "");
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Sobamail//Calendar//EN",
        "CALSCALE:GREGORIAN",
        `METHOD:${opts.method ?? "PUBLISH"}`,
        ...events.flatMap((ev) => vevent(ev, opts.organizer ?? "", stamp)),
        "END:VCALENDAR",
    ];
    return lines.map(line).join("");
}

/** A file name for the iCalendar of `events`: the title for one, else calendar.ics. */
export function ics_filename(events: CalendarEvent[]): string {
    if (events.length !== 1) return "calendar.ics";
    const name = events[0].title.trim() || "event";
    return `${name.replace(/[\\/:*?"<>|]+/g, "_")}.ics`;
}

/**
 * Hands `content` to the browser as a file download. Copied from soba-contacts'
 * vcard.ts: works in a plain browser, cancelled inside Sobamail until the host
 * supports downloads.
 */
export function download(content: string, filename: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- import -------------------------------------------------------------------

/** What an imported VEVENT becomes: the fields of a new event, plus what G10 needs. */
export type ImportedEvent = {
    uid: string;
    title: string;
    date: string;
    endDate: string;
    s: number;
    e: number;
    allDay: boolean;
    location: string;
    desc: string;
    attendees: string[];
    callUrl: string;
    organizer: string;
    /** STATUS as written, upper case; "" when there is none. */
    status: string;
    sequence: number;
    /** The zone the file put the times in ("" for none); the dates and hours are the browser's. */
    tz: string;
};

/**
 * The events in an iCalendar file, how many VEVENTs had no usable start or were
 * cancelled, and the calendar's METHOD ("" when none). The parsing is the calendar
 * module's, which reads mailed invitations with it; this turns its times, the wall
 * clock of their zone, into the UI's dates and hours in the browser's zone.
 */
export function parse_ics(s: string): { events: ImportedEvent[]; skipped: number; method: string } {
    const { events, skipped, method } = module_parse_ics(s);
    return {
        events: events.map(({ start, end, ...rest }) => {
            if (!rest.allDay) {
                start = convertZone(start, rest.tz, "");
                end = convertZone(end, rest.tz, "");
            }
            return {
                ...rest,
                date: dateOf(start),
                endDate: dateOf(end),
                s: rest.allDay ? 0 : hourOf(start),
                e: rest.allDay ? END_OF_DAY : hourOf(end),
            };
        }),
        skipped,
        method,
    };
}
