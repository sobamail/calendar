// Names, clock and week start follow the locale. The suite runs pinned to en-US with
// a Monday start (src/test/setup.ts); these cases switch locales and put it back.

import { afterEach, describe, expect, it } from "vitest";
import { fmt } from "./calendar";
import {
    dayGroupLabel,
    longDate,
    monthLabel,
    monthMatrix,
    parseYmd,
    startOfWeek,
    weekdayHeaders,
    weekdayShort,
    weekRangeLabel,
    ymd,
} from "./dates";
import { firstDay, setLocale } from "./locale";

const d = (s: string) => parseYmd(s);

afterEach(() => setLocale("en-US", 1));

describe("tr-TR", () => {
    it("names days and months in Turkish", () => {
        setLocale("tr-TR");
        expect(weekdayShort(d("2026-10-12"))).toBe("Pzt");
        expect(monthLabel(d("2026-10-15"))).toBe("Ekim 2026");
        expect(longDate(d("2026-10-15"))).toBe("15 Ekim 2026 Perşembe");
        expect(dayGroupLabel(d("2026-10-15"))).toBe("15 Ekim Perşembe");
    });

    it("keeps a 24-hour clock", () => {
        setLocale("tr-TR");
        expect(fmt(9)).toBe("09:00");
        expect(fmt(13.5)).toBe("13:30");
        expect(fmt(24)).toBe("00:00");
    });

    it("starts the week on Monday", () => {
        setLocale("tr-TR");
        expect(firstDay()).toBe(1);
        expect(ymd(startOfWeek(d("2026-10-18")))).toBe("2026-10-12");
        expect(weekdayHeaders("short")[0]).toBe("Pzt");
    });

    it("collapses a week range in its own order", () => {
        setLocale("tr-TR");
        expect(weekRangeLabel(d("2026-07-08"))).toBe("6–12 Tem 2026");
    });
});

describe("en-US", () => {
    it("keeps a 12-hour clock", () => {
        setLocale("en-US");
        expect(fmt(0)).toBe("12 AM");
        expect(fmt(13.5)).toBe("1:30 PM");
    });

    it("starts the week on Sunday", () => {
        setLocale("en-US");
        expect(firstDay()).toBe(7);
        expect(ymd(startOfWeek(d("2026-10-15")))).toBe("2026-10-11");
        expect(ymd(startOfWeek(d("2026-10-11")))).toBe("2026-10-11");
        expect(ymd(monthMatrix(d("2026-02-14"))[0][0])).toBe("2026-02-01");
        expect(weekdayHeaders("short")).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
        expect(weekdayHeaders("narrow")).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
        expect(weekRangeLabel(d("2026-07-08"))).toBe("Jul 5 – 11, 2026");
    });
});

describe("the suite's pinned locale", () => {
    it("is en-US with a Monday start", () => {
        expect(firstDay()).toBe(1);
        expect(weekdayHeaders("short")[0]).toBe("Mon");
        expect(longDate(d("2026-07-08"))).toBe("Wednesday, July 8, 2026");
    });
});
