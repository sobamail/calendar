// The URL fragment of fragment.ts: pane/ panes, the shown day and view, the event to select or
// the text to search for.

import { describe, expect, it } from "vitest";
import {
    event_fragment,
    format_fragment,
    parse_fragment,
    search_fragment,
    shown_panes,
} from "./fragment";

const none = { only: null, date: null, view: null, event: null, search: null };

describe("shown_panes", () => {
    it("names the panes of pane/, in screen order", () => {
        expect(shown_panes("#pane/left")).toEqual(["left"]);
        expect(shown_panes("#pane/right")).toEqual(["right"]);
        expect(shown_panes("#pane/right,left")).toEqual(["left", "right"]);
        expect(shown_panes("#pane/left/2026-10-28/agenda")).toEqual(["left"]);
    });

    it("shows every pane without a valid pane/", () => {
        for (const hash of ["", "#", "#pane/", "#pane", "#pane/middle", "#pane/left,top", "#x",
                            "#2026-10-28/week"]) {
            expect(shown_panes(hash), hash).toEqual(["left", "right"]);
        }
    });
});

describe("parse_fragment", () => {
    it("reads the day and the view", () => {
        expect(parse_fragment("#2026-10-28/agenda")).toEqual(
            { ...none, date: "2026-10-28", view: "agenda" });
        expect(parse_fragment("#2026-10-28")).toEqual({ ...none, date: "2026-10-28" });
        expect(parse_fragment("#pane/left/2026-02-28/month")).toEqual(
            { ...none, only: ["left"], date: "2026-02-28", view: "month" });
    });

    it("reads the event to select, decoded", () => {
        expect(parse_fragment("#2026-10-28/day/event/%7Babc-1%7D")).toEqual(
            { ...none, date: "2026-10-28", view: "day", event: "{abc-1}" });
        expect(parse_fragment("#2026-10-28/day/event/{abc-1}")).toEqual(
            { ...none, date: "2026-10-28", view: "day", event: "{abc-1}" });
        expect(parse_fragment("#pane/left/2026-10-28/week/event/e1")).toEqual(
            { ...none, only: ["left"], date: "2026-10-28", view: "week", event: "e1" });
    });

    it("reads the text to search for, decoded", () => {
        expect(parse_fragment("#2026-10-28/agenda/search/ada%40example.com")).toEqual(
            { ...none, date: "2026-10-28", view: "agenda", search: "ada@example.com" });
        expect(parse_fragment("#2026-10-28/week/search/a%20b%2Fc")).toEqual(
            { ...none, date: "2026-10-28", view: "week", search: "a b/c" });
    });

    it("takes no state from a malformed day, view, event or search", () => {
        for (const hash of ["", "#agenda", "#2026-02-30/week", "#2026-1-5/week", "#2026-10-28/year",
                            "#2026-10-28/week/x", "#pane/top/2026-10-28/week",
                            "#2026-10-28/day/event", "#2026-10-28/day/event/",
                            "#2026-10-28/day/event/%E0%A4%A", "#2026-10-28/day/event/a/b",
                            "#2026-10-28/day/x/a", "#2026-10-28/agenda/search",
                            "#2026-10-28/agenda/search/", "#2026-10-28/agenda/search/%E0%A4%A",
                            "#2026-10-28/agenda/search/a/b", "#2026-10-28/search/a"]) {
            expect(parse_fragment(hash), hash).toEqual(none);
        }
        expect(parse_fragment("#pane/left/2026-10-28/year")).toEqual({ ...none, only: ["left"] });
    });
});

describe("event_fragment", () => {
    it("names the event on its day, in day view, and reads back", () => {
        expect(event_fragment("2026-10-28", "{a b}")).toBe("2026-10-28/day/event/%7Ba%20b%7D");
        expect(parse_fragment("#" + event_fragment("2026-10-28", "{a b}"))).toEqual(
            { ...none, date: "2026-10-28", view: "day", event: "{a b}" });
    });
});

describe("search_fragment", () => {
    it("opens the agenda on the day searching the text, and reads back", () => {
        expect(search_fragment("2026-10-28", "ada@example.com")).toBe(
            "2026-10-28/agenda/search/ada%40example.com");
        expect(parse_fragment("#" + search_fragment("2026-10-28", "a b/c"))).toEqual(
            { ...none, date: "2026-10-28", view: "agenda", search: "a b/c" });
    });
});

describe("format_fragment", () => {
    it("writes the day and the view, after pane/ when there is one", () => {
        const d = new Date(2026, 9, 28);
        expect(format_fragment(null, d, "agenda")).toBe("2026-10-28/agenda");
        expect(format_fragment(["left"], d, "week")).toBe("pane/left/2026-10-28/week");
    });

    it("reads back what it writes", () => {
        const f = format_fragment(["left", "right"], new Date(2026, 0, 5), "day");
        expect(parse_fragment(f)).toEqual(
            { ...none, only: ["left", "right"], date: "2026-01-05", view: "day" });
    });
});
