/**
 * The URL fragment: [pane/<pane>[,<pane>]/]<YYYY-MM-DD>[/<view>[/event/<id>]].
 *
 * pane/<pane>[,<pane>] is the launch fragment the mail client opens the app
 * with for its narrow side bar view (pane/left): the named panes alone. The
 * rest is the shown day and view, kept in step with the store, so a reload or
 * a link shows the same place. An unknown pane/ shows every pane and takes no
 * state; a malformed day or view is no state.
 *
 * event/<id> (the id percent-encoded) selects that event on top of the day and
 * view, opening its popover: what a click in the narrow view opens the full
 * app on (event_fragment). It is a launch item: the store's state carries no
 * event, so the fragment written back drops it. A malformed one is no state.
 *
 * search/<text> (percent-encoded) in the event's place fills the toolbar's
 * search box with the text, so the view shows what matches it: what the mail
 * client opens the agenda on for a contact's events, the text the contact's
 * address (search_fragment). A launch item like the event, dropped the same
 * way; an empty or malformed one is no state.
 */

import { parseYmd, ymd } from "./dates";
import type { ViewName } from "./types";

/** left: the sidebar; right: the toolbar and the shown view */
export type Pane = "left" | "right";
export const PANES: Pane[] = ["left", "right"];

export const VIEWS: ViewName[] = ["day", "week", "month", "agenda"];

export interface Fragment {
    /** the panes of pane/, in screen order; null without one */
    only: Pane[] | null;
    /** "YYYY-MM-DD"; null without one */
    date: string | null;
    /** null without one */
    view: ViewName | null;
    /** the event to select, decoded; null without one */
    event: string | null;
    /** the text to search for, decoded; null without one */
    search: string | null;
}

/** The panes an pane/ names, in screen order; null when it names none or an unknown one. */
function parse_panes(list: string): Pane[] | null {
    const names = list.split(",");
    if (names.some((n) => !(PANES as string[]).includes(n))) return null;
    const panes = PANES.filter((p) => names.includes(p));
    return panes.length > 0 ? panes : null;
}

/** A real day as "YYYY-MM-DD"; Feb 30 and the like are not one. */
function is_day(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(parseYmd(s)) === s;
}

export function parse_fragment(hash: string): Fragment {
    const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
    const none: Fragment = { only: null, date: null, view: null, event: null, search: null };
    let parts = fragment.split("/");

    let only: Pane[] | null = null;
    if (parts[0] === "pane") {
        only = parse_panes(parts[1] ?? "");
        if (only === null) return none;
        parts = parts.slice(2);
    }

    const [date, view, ...rest] = parts;
    if (!is_day(date ?? "")) return { ...none, only };
    if (view === undefined) return { ...none, only, date };
    if (!(VIEWS as string[]).includes(view)) return { ...none, only };
    if (rest.length === 0) return { ...none, only, date, view: view as ViewName };

    // one launch item after the view: the event to select, or the text to search for
    if (rest.length !== 2) return { ...none, only };
    const item = decode(rest[1]);
    if (!item) return { ...none, only };
    if (rest[0] === "event") return { only, date, view: view as ViewName, event: item, search: null };
    if (rest[0] === "search") return { only, date, view: view as ViewName, event: null, search: item };
    return { ...none, only };
}

/** A percent-encoded fragment item, null when it is malformed or empty. */
function decode(s: string): string | null {
    try {
        return decodeURIComponent(s) || null;
    } catch {
        return null;
    }
}

/** The fragment, without "#", that shows event `id` on `date` (a "YYYY-MM-DD") in day view. */
export function event_fragment(date: string, id: string): string {
    return `${date}/day/event/${encodeURIComponent(id)}`;
}

/**
 * The fragment, without "#", that opens the agenda at `date` (a "YYYY-MM-DD")
 * searching for `text`: what the mail client launches for a contact's events,
 * the text the contact's address (MsgMainWindow::calendar_search_fragment).
 */
export function search_fragment(date: string, text: string): string {
    return `${date}/agenda/search/${encodeURIComponent(text)}`;
}

/** The panes location.hash names, in screen order: every pane unless it has a valid pane/. */
export function shown_panes(hash: string): Pane[] {
    return parse_fragment(hash).only ?? [...PANES];
}

/**
 * Whether the page is the mail client's narrow view: no right pane, so a click
 * that would show something there opens the full app on it instead (open_full).
 */
export function narrow(hash: string = location.hash): boolean {
    return !shown_panes(hash).includes("right");
}

/**
 * Opens the full app on `fragment` (no "#", no pane/): the client takes a new
 * window on the app's own document to its tab of the app (amp-cef
 * app_open_request), launched on the fragment.
 */
export function open_full(fragment: string) {
    window.open(`#${fragment}`, "_blank");
}

/** The fragment, without "#", for `date` in `view`, keeping pane/ when there is one. */
export function format_fragment(only: Pane[] | null, date: Date, view: ViewName): string {
    const state = `${ymd(date)}/${view}`;
    return only ? `pane/${only.join(",")}/${state}` : state;
}
