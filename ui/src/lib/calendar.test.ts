// The clock labels and the overlap layout of calendar.ts.

import { describe, expect, it } from "vitest";
import { columnAt, fmt, layoutDay, moved, pieceOn, resized, slotAt } from "./calendar";
import { HOUR_PX } from "./data";
import type { CalendarEvent } from "./types";

describe("fmt", () => {
    it("labels hours on a 12-hour clock", () => {
        expect(fmt(0)).toBe("12 AM");
        expect(fmt(9)).toBe("9 AM");
        expect(fmt(12)).toBe("12 PM");
        expect(fmt(13.5)).toBe("1:30 PM");
        expect(fmt(23.75)).toBe("11:45 PM");
    });

    it("labels the grid's bottom edge, 24, as midnight", () => {
        expect(fmt(24)).toBe("12 AM");
    });
});

const ev = (id: string, s: number, e: number): CalendarEvent => ({
    id,
    date: "2026-10-15",
    endDate: "2026-10-15",
    s,
    e,
    cal: "work",
    title: id,
});
const lanes = (events: CalendarEvent[]) =>
    Object.fromEntries(layoutDay(events).map((x) => [x.id, [x.lane, x.lanes]]));

describe("layoutDay", () => {
    it("gives separate events one lane each", () => {
        expect(lanes([ev("a", 9, 10), ev("b", 10, 11)])).toEqual({ a: [0, 1], b: [0, 1] });
    });

    it("puts overlapping events side by side", () => {
        expect(lanes([ev("a", 9, 11), ev("b", 10, 12)])).toEqual({ a: [0, 2], b: [1, 2] });
    });

    it("reuses a freed lane inside a cluster", () => {
        // a overlaps b and c; c starts after b ends, so it takes b's lane
        expect(lanes([ev("a", 9, 13), ev("b", 9.5, 10.5), ev("c", 11, 12)])).toEqual({
            a: [0, 2],
            b: [1, 2],
            c: [1, 2],
        });
    });

    it("sorts by start and does not mutate its input", () => {
        const input = [ev("late", 14, 15), ev("early", 8, 9)];
        expect(layoutDay(input).map((x) => x.id)).toEqual(["early", "late"]);
        expect(input.map((x) => x.id)).toEqual(["late", "early"]);
    });
});

describe("pieceOn", () => {
    const span = (date: string, s: number, endDate: string, e: number, allDay = false) => ({
        ...ev("x", s, e),
        date,
        endDate,
        allDay,
    });
    const piece = (x: CalendarEvent, date: string) => {
        const p = pieceOn(x, date);
        return p && [p.s, p.e, p.day, p.days];
    };

    it("gives a one-day event whole on its day and nothing elsewhere", () => {
        const x = span("2026-10-15", 9, "2026-10-15", 10);
        expect(piece(x, "2026-10-15")).toEqual([9, 10, 1, 1]);
        expect(piece(x, "2026-10-14")).toBeNull();
        expect(piece(x, "2026-10-16")).toBeNull();
    });

    it("clips a timed multi-day event to each day it covers", () => {
        const x = span("2026-10-15", 22, "2026-10-17", 2);
        expect(piece(x, "2026-10-15")).toEqual([22, 24, 1, 3]);
        expect(piece(x, "2026-10-16")).toEqual([0, 24, 2, 3]);
        expect(piece(x, "2026-10-17")).toEqual([0, 2, 3, 3]);
        expect(piece(x, "2026-10-18")).toBeNull();
    });

    it("counts an all-day span by its dates", () => {
        const x = span("2026-10-30", 0, "2026-11-02", 23 + 59 / 60, true);
        expect(piece(x, "2026-10-31")?.slice(2)).toEqual([2, 4]);
        expect(piece(x, "2026-11-02")?.slice(2)).toEqual([4, 4]);
    });

    it("leaves out the day a timed event ends at midnight", () => {
        const x = span("2026-10-15", 22, "2026-10-16", 0);
        expect(piece(x, "2026-10-15")).toEqual([22, 24, 1, 1]);
        expect(piece(x, "2026-10-16")).toBeNull();
    });

    it("counts days across a DST change", () => {
        const x = span("2026-10-24", 9, "2026-10-26", 10);
        expect(piece(x, "2026-10-26")).toEqual([0, 10, 3, 3]);
    });
});

describe("moved", () => {
    const at = (date: string, s: number, endDate: string, e: number, allDay = false) => ({
        ...ev("x", s, e),
        date,
        endDate,
        allDay,
    });

    it("moves a timed event by days, its start snapped to the quarter hour, its length kept", () => {
        expect(moved(at("2026-10-12", 9, "2026-10-12", 10), 2, 2.3)).toEqual({
            date: "2026-10-14",
            endDate: "2026-10-14",
            s: 11.25,
            e: 12.25,
        });
        // 10:10 dragged 20 minutes down lands on 10:30, not 10:25
        expect(moved(at("2026-10-12", 10 + 10 / 60, "2026-10-12", 11 + 10 / 60), 0, 1 / 3)).toEqual({
            date: "2026-10-12",
            endDate: "2026-10-12",
            s: 10.5,
            e: 11.5,
        });
    });

    it("keeps a one-day event within its day, ending at midnight at the latest", () => {
        expect(moved(at("2026-10-12", 10, "2026-10-12", 11), 0, 20)).toEqual({
            date: "2026-10-12",
            endDate: "2026-10-13",
            s: 23,
            e: 0,
        });
        expect(moved(at("2026-10-12", 10, "2026-10-12", 11), 0, -20)).toEqual({
            date: "2026-10-12",
            endDate: "2026-10-12",
            s: 0,
            e: 1,
        });
    });

    it("moves a multi-day timed event whole, running on past midnight", () => {
        expect(moved(at("2026-10-12", 9, "2026-10-14", 17), 1, 1)).toEqual({
            date: "2026-10-13",
            endDate: "2026-10-15",
            s: 10,
            e: 18,
        });
        expect(moved(at("2026-10-12", 22, "2026-10-13", 2), 0, 1.5)).toEqual({
            date: "2026-10-12",
            endDate: "2026-10-13",
            s: 23.5,
            e: 3.5,
        });
    });

    it("moves an all-day event by whole days only", () => {
        expect(moved(at("2026-10-12", 0, "2026-10-13", 23 + 59 / 60, true), 3, 5)).toEqual({
            date: "2026-10-15",
            endDate: "2026-10-16",
            s: 0,
            e: 23 + 59 / 60,
        });
    });
});

describe("resized", () => {
    const at = (date: string, s: number, endDate: string, e: number) => ({
        ...ev("x", s, e),
        date,
        endDate,
    });
    const day = "2026-10-12";

    it("moves the end, snapped to the quarter hour, keeping the start", () => {
        expect(resized(at(day, 9, day, 10), 1.3)).toEqual({ date: day, endDate: day, s: 9, e: 11.25 });
        expect(resized(at(day, 9, day, 10), -0.5)).toEqual({ date: day, endDate: day, s: 9, e: 9.5 });
    });

    it("keeps a quarter hour at least, and ends at midnight at the latest", () => {
        expect(resized(at(day, 9, day, 10), -5)).toEqual({ date: day, endDate: day, s: 9, e: 9.25 });
        expect(resized(at(day, 22, day, 23), 5)).toEqual({
            date: day,
            endDate: "2026-10-13",
            s: 22,
            e: 0,
        });
    });

    it("keeps a multi-day event's end on its last day", () => {
        expect(resized(at(day, 9, "2026-10-14", 17), 1)).toEqual({
            date: day,
            endDate: "2026-10-14",
            s: 9,
            e: 18,
        });
        expect(resized(at(day, 9, "2026-10-14", 17), -20)).toEqual({
            date: day,
            endDate: "2026-10-14",
            s: 9,
            e: 0.25,
        });
    });

    it("takes an event ending at midnight as ending on the day before", () => {
        expect(resized(at(day, 22, "2026-10-13", 0), -1)).toEqual({
            date: day,
            endDate: day,
            s: 22,
            e: 23,
        });
    });
});

describe("columnAt", () => {
    const cols = [0, 1, 2].map((i) => ({ left: i * 100, right: (i + 1) * 100 }));

    it("finds the column under x, and the nearest end one off the row", () => {
        expect([0, 150, 299].map((x) => columnAt(x, cols))).toEqual([0, 1, 2]);
        expect(columnAt(-40, cols)).toBe(0);
        expect(columnAt(300, cols)).toBe(2);
    });
});

describe("slotAt", () => {
    it("picks the half hour under a y offset into the day grid", () => {
        expect(slotAt(0)).toBe(0);
        expect(slotAt(14 * HOUR_PX)).toBe(14);
        expect(slotAt(14.25 * HOUR_PX)).toBe(14);
        expect(slotAt(14.5 * HOUR_PX)).toBe(14.5);
        expect(slotAt(14.99 * HOUR_PX)).toBe(14.5);
    });

    it("stays inside the grid's last start time", () => {
        expect(slotAt(-5)).toBe(0);
        expect(slotAt(24 * HOUR_PX)).toBe(23.5);
        expect(slotAt(30 * HOUR_PX)).toBe(23.5);
    });
});
