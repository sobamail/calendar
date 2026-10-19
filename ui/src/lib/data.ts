import type {CalendarMeta} from "./types";

/** Grid geometry — shared by the week/day time-grid and the form's time pickers. */
export const H0 = 0; // first hour shown
export const H1 = 24; // last hour shown (exclusive end of the grid)
export const HOUR_PX = 52; // pixels per hour row
/** The hour the time grid scrolls to when it opens. */
export const SCROLL_HOUR = 7;

/** What a calendar is shown as: its name, or a placeholder until the primary one is named. */
export function calendarName(meta: CalendarMeta): string {
    return meta.name || "(Calendar)";
}

/** The colors a calendar can take; the backend stores `color` only. */
export const PALETTE: {name: string, color: string, deep: string}[] = [
    {name : "Blue", color : "#4180ff", deep : "#244aa0"},
    {name : "Green", color : "#00c400", deep : "#0a7a12"},
    {name : "Orange", color : "#ffa923", deep : "#9a5b00"},
    {name : "Red", color : "#ff4d4d", deep : "#b3122e"},
    {name : "Purple", color : "#8e44ad", deep : "#5b2370"},
    {name : "Teal", color : "#16a085", deep : "#0b5e4e"},
    {name : "Pink", color : "#e84393", deep : "#9c1f5c"},
    {name : "Gray", color : "#8a94a6", deep : "#4a5263"},
];

/** The deep variant of a stored color; a color off the palette is its own. */
export function deepOf(color: string): string {
    return PALETTE.find((p) => p.color === color)?.deep ?? color;
}

/** Shown for an event whose calendar isn't stored (e.g. deleted elsewhere). */
export const UNKNOWN_CALENDAR = {name : "Unknown calendar", color : "#a0a7b4", deep : "#4a5263"};
