/** A calendar's uuid. */
export type CalendarId = string;

export type ViewName = "day"|"week"|"month"|"agenda";

export interface CalendarMeta {
    id: CalendarId;
    /** As stored: "" until the primary calendar is named (calendarName() shows it). */
    name: string;
    /** Base swatch / block accent. */
    color: string;
    /** Deep variant used for text on tinted fills. */
    deep: string;
    /** Set on the primary calendar, which takes new events and can't be deleted. */
    primary?: boolean;
}

/** Draft used by the create / edit calendar dialog. */
export interface CalendarForm {
    name: string;
    color: string;
}

export interface CalendarEvent {
    id: string;
    /** The day the event starts, as a local "YYYY-MM-DD" string. */
    date: string;
    /** The day it ends, never before `date`; equal to it for a one-day event. */
    endDate: string;
    /** Start time (on `date`) as a fractional hour (e.g. 9.5 = 9:30). Ignored when allDay. */
    s: number;
    /** End time (on `endDate`) as a fractional hour. */
    e: number;
    cal: CalendarId;
    title: string;
    allDay?: boolean;
    location?: string;
    desc?: string;
    attendees?: string[];
    /** Set when the event has a call; old events may have it without a `callUrl`. */
    call?: boolean;
    /** The video call link, an http(s) URL. */
    callUrl?: string;
    /** Set on an event that came in as a mailed invitation (stored status "tentative"). */
    invitation?: boolean;
    /** Who sent the invitation. */
    organizer?: string;
    /** The iCalendar SEQUENCE the guests were last mailed; raised for each update. */
    sequence?: number;
    /**
     * The IANA zone the event is scheduled in. `date`/`s`/`endDate`/`e` are always the
     * browser's wall clock; the store converts from and back to this zone.
     */
    tz?: string;
}

/** Draft used by the create / edit form. */
export interface EventForm {
    title: string;
    cal: CalendarId;
    date: string;
    /** The end date; defaults to `date`, and save refuses one before it. */
    endDate: string;
    /** Start/end as fractional hours; kept but ignored while `allDay` is set. */
    s: number;
    e: number;
    allDay: boolean;
    location: string;
    desc: string;
    /** One guest address per row; blank rows are dropped on save. */
    attendees: string[];
    /** "" or an http(s) URL. */
    callUrl: string;
}

/**
 * An event's part of one day: `s`/`e` clipped to that day (0 and 24 at the cut
 * edges), and which of the event's days it is.
 */
export interface DayPiece extends CalendarEvent {
    /** 1-based: the start day is 1. */
    day: number;
    /** How many days the event covers; 1 for a one-day event. */
    days: number;
}

/** An event after column-overlap layout, ready to position in the grid. */
export interface LaidOutEvent extends CalendarEvent {
    lane: number;
    lanes: number;
}
