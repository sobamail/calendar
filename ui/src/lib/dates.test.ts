// The date arithmetic of dates.ts. Everything is local time; the expectations are
// "YYYY-MM-DD" strings so they hold in any time zone the suite runs in.

import { afterEach, describe, expect, it } from "vitest";
import {
    addMonths,
    agendaRangeLabel,
    agendaSpan,
    convertZone,
    dateOf,
    localZone,
    setZone,
    hourOf,
    isoAt,
    loadWindow,
    monthMatrix,
    parseYmd,
    startOfWeek,
    weekRangeLabel,
    ymd,
} from "./dates";

const d = (s: string) => parseYmd(s);

describe("addMonths", () => {
    it("clamps to the target month's last day", () => {
        expect(ymd(addMonths(d("2026-01-31"), 1))).toBe("2026-02-28");
        expect(ymd(addMonths(d("2028-01-31"), 1))).toBe("2028-02-29");
        expect(ymd(addMonths(d("2026-03-31"), 1))).toBe("2026-04-30");
        expect(ymd(addMonths(d("2026-03-31"), -1))).toBe("2026-02-28");
    });

    it("crosses year ends both ways", () => {
        expect(ymd(addMonths(d("2026-12-15"), 1))).toBe("2027-01-15");
        expect(ymd(addMonths(d("2026-01-15"), -1))).toBe("2025-12-15");
        expect(ymd(addMonths(d("2026-05-31"), 12))).toBe("2027-05-31");
    });
});

describe("weeks", () => {
    it("start on Monday", () => {
        expect(ymd(startOfWeek(d("2026-10-15")))).toBe("2026-10-12"); // Thursday
        expect(ymd(startOfWeek(d("2026-10-12")))).toBe("2026-10-12"); // Monday
        expect(ymd(startOfWeek(d("2026-10-18")))).toBe("2026-10-12"); // Sunday
    });

    it("label a week across a month and a year end", () => {
        expect(weekRangeLabel(d("2026-07-08"))).toBe("Jul 6 – 12, 2026");
        expect(weekRangeLabel(d("2026-09-30"))).toBe("Sep 28 – Oct 4, 2026");
        expect(weekRangeLabel(d("2026-12-30"))).toBe("Dec 28, 2026 – Jan 3, 2027");
    });

    it("fill a 6x7 month grid from the Monday on or before the 1st", () => {
        const grid = monthMatrix(d("2026-02-14"));
        expect(grid).toHaveLength(6);
        expect(grid.every((w) => w.length === 7)).toBe(true);
        expect(ymd(grid[0][0])).toBe("2026-01-26");
        expect(ymd(grid[5][6])).toBe("2026-03-08");
    });
});

describe("the agenda span", () => {
    it("runs from the cursor's week start to the last loaded day", () => {
        expect(agendaSpan(d("2026-10-15"))).toEqual({ from: "2026-10-12", last: "2026-11-29" });
        expect(agendaSpan(d("2026-12-31"))).toEqual({ from: "2026-12-28", last: "2027-01-31" });
    });

    it("is labelled with both ends, collapsing a shared year", () => {
        expect(agendaRangeLabel(d("2026-10-15"))).toBe("Oct 12 → Nov 29, 2026");
        expect(agendaRangeLabel(d("2026-12-31"))).toBe("Dec 28, 2026 → Jan 31, 2027");
    });
});

describe("loadWindow", () => {
    it("spans the Monday before last month's 1st to the Monday before next-but-one's", () => {
        expect(loadWindow(d("2026-10-15"))).toEqual({ from: "2026-08-31", to: "2026-11-30" });
    });

    it("crosses year ends", () => {
        expect(loadWindow(d("2026-01-10"))).toEqual({ from: "2025-12-01", to: "2026-02-23" });
        expect(loadWindow(d("2026-12-31"))).toEqual({ from: "2026-10-26", to: "2027-02-01" });
    });

    it("covers the whole month grid of its cursor", () => {
        for (const cursor of ["2026-02-01", "2026-03-31", "2026-08-15", "2026-11-30"]) {
            const { from, to } = loadWindow(d(cursor));
            const grid = monthMatrix(d(cursor));
            expect(ymd(grid[0][0]) >= from).toBe(true);
            expect(ymd(grid[5][6]) < to).toBe(true);
        }
    });
});

describe("ISO datetime bridge", () => {
    it("round-trips every quarter hour", () => {
        for (let h = 0; h < 24; h += 0.25) {
            const iso = isoAt("2026-10-15", h);
            expect(iso).toMatch(/^2026-10-15T\d\d:\d\d$/);
            expect(dateOf(iso)).toBe("2026-10-15");
            expect(hourOf(iso)).toBeCloseTo(h, 9);
        }
    });

    it("pads and parses", () => {
        expect(isoAt("2026-10-15", 9.5)).toBe("2026-10-15T09:30");
        expect(isoAt("2026-10-15", 0)).toBe("2026-10-15T00:00");
        expect(hourOf("2026-10-15T13:45")).toBe(13.75);
        expect(hourOf("2026-10-15")).toBe(0);
    });
});

// An event's times are the wall clock of its zone (its `tz`); the UI shows them in the
// browser's. These pin named zones, so they hold wherever the suite runs.
describe("convertZone", () => {
    afterEach(() => setZone(null));

    it("moves a wall clock from one zone to another", () => {
        // 09:00 EDT (-4) is 13:00 UTC is 16:00 in Istanbul (+3)
        expect(convertZone("2026-10-21T09:00", "America/New_York", "Europe/Istanbul")).toBe(
            "2026-10-21T16:00",
        );
        expect(convertZone("2026-10-21T16:00", "Europe/Istanbul", "America/New_York")).toBe(
            "2026-10-21T09:00",
        );
    });

    it("crosses the day and follows each zone's DST", () => {
        expect(convertZone("2026-07-08T22:00", "Europe/Berlin", "Asia/Tokyo")).toBe("2026-07-09T05:00");
        // EST (-5) in January, EDT (-4) in July
        expect(convertZone("2026-01-15T09:00", "America/New_York", "UTC")).toBe("2026-01-15T14:00");
        expect(convertZone("2026-07-15T09:00", "America/New_York", "UTC")).toBe("2026-07-15T13:00");
        expect(convertZone("2026-01-01T02:30", "UTC", "America/Los_Angeles")).toBe("2025-12-31T18:30");
    });

    it("reads a blank zone as the browser's", () => {
        setZone("Asia/Tokyo");
        expect(localZone()).toBe("Asia/Tokyo");
        expect(convertZone("2026-07-08T09:00", "UTC", "")).toBe("2026-07-08T18:00");
        expect(convertZone("2026-07-08T18:00", "", "UTC")).toBe("2026-07-08T09:00");
    });

    it("leaves the time alone in the same zone or a zone it doesn't know", () => {
        expect(convertZone("2026-07-08T09:00", "Asia/Tokyo", "Asia/Tokyo")).toBe("2026-07-08T09:00");
        expect(convertZone("2026-07-08T09:00", "Pacific Standard Time", "UTC")).toBe("2026-07-08T09:00");
        expect(convertZone("2026-07-08T09:00", "UTC", "Nowhere/City")).toBe("2026-07-08T09:00");
    });

    it("knows the browser's zone", () => {
        expect(localZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    });
});
