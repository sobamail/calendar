import {H0, H1, HOUR_PX} from "./data";
import {addDays, daysBetween, longDate, parseYmd, ymd} from "./dates";
import {clock} from "./locale";
import type {CalendarEvent, DayPiece, LaidOutEvent} from "./types";

/** The half hour under a y offset (px) into a day column, clamped to a start the form offers. */
export function slotAt(y: number): number {
    const h = H0 + Math.floor((y / HOUR_PX) * 2) / 2;
    return Math.min(Math.max(h, H0), H1 - 0.5);
}

/** Where an event sits: its days and, for a timed one, its start and end hours. */
export type Placement = Pick<CalendarEvent, "date"|"endDate"|"s"|"e">;

/** A dragged event's start snaps to quarter hours (minutes). */
const QUARTER = 15;

/**
 * Where `ev` lands when dragged `days` columns over and `hours` down: a timed event's
 * start snapped to the quarter hour on the grid, its length kept, a one-day event kept
 * within its day (ending at midnight at the latest). An all-day event moves by whole
 * days only.
 */
export function moved(ev: CalendarEvent, days: number, hours: number): Placement {
    const date = ymd(addDays(parseYmd(ev.date), days));
    if (ev.allDay)
        return {date, endDate : ymd(addDays(parseYmd(ev.endDate), days)), s : ev.s, e : ev.e};

    // in minutes from midnight of the first day
    const span = Math.round((daysBetween(ev.date, ev.endDate) * 24 + ev.e - ev.s) * 60);
    const latest = ev.date === ev.endDate ? H1 * 60 - span : H1 * 60 - QUARTER;
    const start = Math.min(Math.max(Math.round(((ev.s + hours) * 60) / QUARTER) * QUARTER, H0 * 60),
                           Math.floor(latest / QUARTER) * QUARTER);
    const end = start + span;
    const over = Math.floor(end / (24 * 60));
    return {
        date,
        endDate : ymd(addDays(parseYmd(date), over)),
        s : start / 60,
        e : (end - over * 24 * 60) / 60,
    };
}

/**
 * Timed `ev` with its end dragged `hours` down (up when negative), snapped to the quarter
 * hour: still on the day the event ends on in the grid, a quarter hour into it and after
 * the start at least, midnight at the latest. The start stays.
 */
export function resized(ev: CalendarEvent, hours: number): Placement {
    // in minutes from midnight of the first day
    const start = Math.round(ev.s * 60);
    const end = daysBetween(ev.date, ev.endDate) * 24 * 60 + Math.round(ev.e * 60);
    // the day the grid draws the end on: one ending at midnight ends the day before
    const last = Math.floor(Math.max(end - 1, start) / (24 * 60)) * 24 * 60;
    const to = Math.min(Math.max(Math.round((end + hours * 60) / QUARTER) * QUARTER,
                                 start + QUARTER, last + QUARTER),
                        last + 24 * 60);
    const over = Math.floor(to / (24 * 60));
    return {
        date : ev.date,
        endDate : ymd(addDays(parseYmd(ev.date), over)),
        s : ev.s,
        e : (to - over * 24 * 60) / 60,
    };
}

/** The column whose [left, right) holds x; the nearest end one when x is off the row. */
export function columnAt(x: number, cols: {left: number, right: number}[]): number {
    const i = cols.findIndex((c) => x >= c.left && x < c.right);
    if (i !== -1)
        return i;
    return cols.length > 0 && x >= cols[cols.length - 1].right ? cols.length - 1 : 0;
}

/** Format a fractional hour as the locale's clock label, e.g. 13.5 → "1:30 PM" / "13:30". */
export function fmt(h: number): string {
    const whole = Math.floor(h + 1e-9);
    const m = Math.round((h - whole) * 60);
    return clock(whole % 24, m); // 24 is the grid's bottom edge: midnight
}

/** When `ev` is, in words: "Wednesday, October 14, 2026, 11:15 AM – 12:15 PM" and the like. */
export function whenText(ev: CalendarEvent): string {
    const start = longDate(parseYmd(ev.date));
    const end = longDate(parseYmd(ev.endDate));
    if (ev.allDay)
        return ev.endDate === ev.date ? `${start}, all day` : `${start} – ${end}, all day`;
    if (ev.endDate === ev.date)
        return `${start}, ${fmt(ev.s)} – ${fmt(ev.e)}`;
    return `${start}, ${fmt(ev.s)} – ${end}, ${fmt(ev.e)}`;
}

/**
 * The part of `ev` that falls on "YYYY-MM-DD" `date`, or null when it doesn't.
 * A timed event ending at midnight takes nothing of its end day.
 */
export function pieceOn(ev: CalendarEvent, date: string): DayPiece|null {
    let last = ev.endDate;
    if (! ev.allDay && last > ev.date && ev.e === 0)
        last = ymd(addDays(parseYmd(last), -1));
    if (date < ev.date || date > last)
        return null;
    const s = date === ev.date ? ev.s : 0;
    const e = date === ev.endDate ? ev.e : 24;
    return {...ev, s, e, day : daysBetween(ev.date, date) + 1, days : daysBetween(ev.date, last) + 1};
}

/** A pale fill tinted from an accent color, used for event blocks/chips. */
export function tint(color: string): string { return `color-mix(in srgb, ${color} 15%, #fff)`; }

/**
 * Assign overlapping events to side-by-side lanes.
 * Events are grouped into clusters of mutual overlap; within each cluster every
 * event gets a `lane` index and the cluster's total `lanes` count so the caller
 * can compute left/width percentages.
 */
export function layoutDay<T extends CalendarEvent>(events: T[]): (T&LaidOutEvent)[] {
    const list = [...events ].sort((a, b) => a.s - b.s || a.e - b.e);
    const clusters: T[][] = [];
    let cur: T[] = [];
    let curEnd = -1;

    for (const ev of list) {
        if (cur.length && ev.s >= curEnd) {
            clusters.push(cur);
            cur = [];
            curEnd = -1;
        }
        cur.push(ev);
        curEnd = Math.max(curEnd, ev.e);
    }
    if (cur.length)
        clusters.push(cur);

    const out: (T&LaidOutEvent)[] = [];
    for (const cluster of clusters) {
        const lanesEnd: number[] = [];
        const withLane = cluster.map((ev) => {
            let lane = lanesEnd.findIndex((end) => end <= ev.s + 1e-9);
            if (lane === -1) {
                lane = lanesEnd.length;
                lanesEnd.push(ev.e);
            }
            else {
                lanesEnd[lane] = ev.e;
            }
            return {ev, lane};
        });
        for (const {ev, lane} of withLane) {
            out.push({...ev, lane, lanes : lanesEnd.length});
        }
    }
    return out;
}
