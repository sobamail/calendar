/**
 * The display locale: month and weekday names, the clock and the first day of the
 * week, all from `Intl` for `navigator.language`. Only what is shown changes —
 * storage keeps its "YYYY-MM-DD" / "YYYY-MM-DDTHH:MM" shape.
 */

type Formats = {
    lang: string;
    first: number; // 1 = Monday … 7 = Sunday, as Intl.Locale's weekInfo counts
    hour12: boolean;
    weekday: Record<"long"|"short"|"narrow", Intl.DateTimeFormat>;
    month: Intl.DateTimeFormat;
    long: Intl.DateTimeFormat;
    dayGroup: Intl.DateTimeFormat;
    short: Intl.DateTimeFormat;
    hour: Intl.DateTimeFormat;
    hourMinute: Intl.DateTimeFormat;
};

let F: Formats;

/** The locale's first day of the week; Monday when the engine doesn't say. */
function weekStart(lang: string): number {
    try {
        const loc = new Intl.Locale(lang) as Intl.Locale & {
            weekInfo?: {firstDay: number};
            getWeekInfo?: () => {firstDay: number};
        };
        // Chrome 117 has the weekInfo getter; newer engines replaced it with getWeekInfo().
        return (loc.getWeekInfo ? loc.getWeekInfo() : loc.weekInfo)?.firstDay ?? 1;
    }
    catch {
        return 1;
    }
}

/**
 * Build the formatters for `lang` (default: the browser's language). `first`
 * overrides the week start (1 = Monday … 7 = Sunday) — the test suite pins it.
 */
export function setLocale(lang?: string, first?: number): void {
    const want = lang ?? (typeof navigator !== "undefined" ? navigator.language : undefined);
    const base = new Intl.DateTimeFormat(want, {hour : "numeric"}).resolvedOptions();
    const l = base.locale;
    const hour12 = base.hourCycle === "h11" || base.hourCycle === "h12";
    const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(l, o);
    F = {
        lang : l,
        first : first ?? weekStart(l),
        hour12,
        weekday : {
            long : dtf({weekday : "long"}),
            short : dtf({weekday : "short"}),
            narrow : dtf({weekday : "narrow"}),
        },
        month : dtf({month : "long", year : "numeric"}),
        long : dtf({weekday : "long", month : "long", day : "numeric", year : "numeric"}),
        dayGroup : dtf({weekday : "long", month : "long", day : "numeric"}),
        short : dtf({month : "short", day : "numeric", year : "numeric"}),
        hour : dtf({hour : "numeric"}),
        hourMinute : dtf({hour : hour12 ? "numeric" : "2-digit", minute : "2-digit"}),
    };
}

setLocale();

// ICU puts narrow/thin spaces around AM/PM and range dashes; Chrome's ICU and
// Node's differ on that, so labels use plain spaces everywhere.
const plain = (s: string) => s.replace(/[  ]/g, " ");

/** The first day of the week: 1 = Monday … 7 = Sunday. */
export function firstDay(): number { return F.first; }

/** A weekday name in the given width. */
export function weekdayName(d: Date, width: "long"|"short"|"narrow"): string {
    return F.weekday[width].format(d);
}

/** "July 2026" */
export function monthYear(d: Date): string { return F.month.format(d); }

/** "Wednesday, July 8, 2026" */
export function longDay(d: Date): string { return F.long.format(d); }

/** "Wednesday, July 8" */
export function dayGroupDay(d: Date): string { return F.dayGroup.format(d); }

/**
 * Two short dates as a range, the shared year/month collapsed the locale's way;
 * `sep`, when given, replaces the locale's range separator.
 */
export function shortRange(a: Date, b: Date, sep?: string): string {
    const parts = F.short.formatRangeToParts(a, b);
    return plain(parts
                         .map((p, i) => sep !== undefined && p.source === "shared"
                                                && parts[i - 1]?.source === "startRange"
                                                && parts[i + 1]?.source === "endRange"
                                        ? sep
                                        : p.value)
                         .join(""));
}

/** A wall-clock time: "1:30 PM" / "13:30"; a 12-hour clock drops ":00". */
export function clock(h: number, m: number): string {
    const d = new Date(2000, 0, 1, h, m);
    return plain((m || ! F.hour12 ? F.hourMinute : F.hour).format(d));
}
