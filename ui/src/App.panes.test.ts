// @vitest-environment jsdom

// App.svelte and its URL fragment (lib/fragment.ts), on the stand-in runtime
// (test/backend.ts): the pane/ panes of the mail client's side bar view, and
// the shown day and view kept in the fragment.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PutEvent, PutEventResponse } from "$module/calendar/v1";
import App from "./App.svelte";
import { isoAt, ymd, today } from "./lib/dates";
import { event_fragment, search_fragment } from "./lib/fragment";
import { install_backend, type Backend } from "./test/backend";

let backend: Backend;

beforeEach(async () => {
    backend = await install_backend();
    localStorage.clear();
    history.replaceState(null, "", "/");
});

const sidebar = () => document.querySelector("aside.sidebar");
const newEvent = () => screen.queryAllByRole("button", { name: /New event/ });
const TODAY = ymd(today());

describe("pane/ panes", () => {
    it("pane/left shows the sidebar alone, and keeps pane/ in the url", async () => {
        history.replaceState(null, "", "/#pane/left");
        render(App);

        expect(sidebar()).not.toBeNull();
        expect(screen.queryByRole("main")).toBeNull();
        await waitFor(() => expect(location.hash).toBe(`#pane/left/${TODAY}/week`));
    });

    it("follows a later pane/ fragment", async () => {
        history.replaceState(null, "", "/#pane/left");
        render(App);
        expect(screen.queryByRole("main")).toBeNull();

        location.hash = "#pane/right";
        await waitFor(() => expect(screen.queryByRole("main")).not.toBeNull());
        expect(sidebar()).toBeNull();
    });

    it("shows every pane without one", () => {
        render(App);
        expect(sidebar()).not.toBeNull();
        expect(screen.queryByRole("main")).not.toBeNull();
        expect(newEvent().length).toBeGreaterThan(0);
    });

    // the mini calendar's cells, the 1st of the shown month among them
    const firstOfMonth = () => {
        const d = today();
        return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
    };
    const cellOf = (day: string) =>
        [...document.querySelectorAll<HTMLButtonElement>("button.mini-cell")].find(
            (b) => b.textContent!.trim() === String(Number(day.slice(8))),
        )!;

    it("under pane/left a day opens the full app on that day, nothing moves here", async () => {
        const opened = vi.fn();
        window.open = opened;
        history.replaceState(null, "", "/#pane/left");
        render(App);
        await waitFor(() => expect(location.hash).toBe(`#pane/left/${TODAY}/week`));

        const day = firstOfMonth();
        await fireEvent.click(cellOf(day));
        expect(opened).toHaveBeenCalledWith(`#${day}/day`, "_blank");
        expect(location.hash).toBe(`#pane/left/${TODAY}/week`);
    });

    it("with every pane a day moves the view, and opens nothing", async () => {
        const opened = vi.fn();
        window.open = opened;
        render(App);
        await waitFor(() => expect(location.hash).toBe(`#${TODAY}/week`));

        const day = firstOfMonth();
        await fireEvent.click(cellOf(day));
        expect(opened).not.toHaveBeenCalled();
        if (day !== TODAY) {
            await waitFor(() => expect(location.hash.startsWith(`#${day}/`)).toBe(true));
        }
    });
});

describe("the day and view fragment", () => {
    it("completes an empty fragment in place", async () => {
        const length = history.length;
        render(App);
        await waitFor(() => expect(location.hash).toBe(`#${TODAY}/week`));
        expect(history.length).toBe(length);
    });

    it("opens on the day and view it names", async () => {
        history.replaceState(null, "", "/#2026-03-15/agenda");
        render(App);
        expect(screen.getByRole("button", { name: "Agenda" }).classList).toContain("active");
        expect(screen.getByText(/Mar 9/)).toBeTruthy();
        expect(location.hash).toBe("#2026-03-15/agenda");
    });

    it("writes each move as a history entry", async () => {
        history.replaceState(null, "", "/#2026-03-15/week");
        render(App);
        const length = history.length;

        await fireEvent.click(screen.getByRole("button", { name: "Month" }));
        await waitFor(() => expect(location.hash).toBe("#2026-03-15/month"));
        await fireEvent.click(screen.getByRole("button", { name: "Next" }));
        await waitFor(() => expect(location.hash).toBe("#2026-04-15/month"));
        expect(history.length).toBe(length + 2);
    });

    it("follows a later fragment", async () => {
        history.replaceState(null, "", "/#2026-03-15/week");
        render(App);

        location.hash = "#2026-07-01/day";
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Day" }).classList).toContain("active"));
        expect(location.hash).toBe("#2026-07-01/day");
    });

    it("keeps pane/ across a move", async () => {
        history.replaceState(null, "", "/#pane/left/2026-03-15/week");
        render(App);
        expect(screen.queryByRole("main")).toBeNull();

        location.hash = "#pane/left/2026-05-02/week";
        await waitFor(() => expect(screen.getByText(/May 2026/)).toBeTruthy());
    });
});

describe("the event fragment", () => {
    const put = (title: string) =>
        backend.soba.run<PutEventResponse>(
            new PutEvent({ title, start: isoAt(TODAY, 10), end: isoAt(TODAY, 11) }),
        )!.uuid;

    it("opens the event it names on its day, and drops it in place", async () => {
        put("Other");
        const uuid = put("Planning");
        const length = history.length;
        history.replaceState(null, "", "/#" + event_fragment(TODAY, uuid));
        render(App);

        await screen.findByRole("dialog", { name: "Planning" });
        expect(screen.getByRole("button", { name: "Day" }).classList).toContain("active");
        await waitFor(() => expect(location.hash).toBe(`#${TODAY}/day`));
        expect(history.length).toBe(length);
    });

    it("under pane/left an agenda event opens the full app on it", async () => {
        const uuid = put("Planning");
        const opened = vi.fn();
        window.open = opened;
        history.replaceState(null, "", "/#pane/left");
        render(App);

        const summary = within(screen.getByRole("region", { name: "Agenda summary" }));
        await fireEvent.click(await summary.findByRole("button", { name: /Planning/ }));
        expect(opened).toHaveBeenCalledWith("#" + event_fragment(TODAY, uuid), "_blank");
        expect(screen.queryByRole("dialog", { name: "Planning" })).toBeNull();
    });
});

// The mail client's "Show events" of a contact: the agenda, its search box holding the
// contact's address, so the events the contact is a guest of stand out.
describe("the search fragment", () => {
    const put = (title: string, attendees: string[] = []) =>
        backend.soba.run<PutEventResponse>(
            new PutEvent({ title, start: isoAt(TODAY, 10), end: isoAt(TODAY, 11), attendees }),
        )!.uuid;

    it("opens the agenda searching the text, and drops it in place", async () => {
        put("Lunch");
        put("Planning", ["ada@example.com"]);
        const length = history.length;
        history.replaceState(null, "", "/#" + search_fragment(TODAY, "ada@example.com"));
        render(App);

        expect(screen.getByRole("button", { name: "Agenda" }).classList).toContain("active");
        const field = screen.getByLabelText("Search events") as HTMLInputElement;
        expect(field.value).toBe("ada@example.com");
        await waitFor(() =>
            expect(screen.getByRole("status", { name: "Search results" }).textContent).toBe(
                "1 of 2 in view",
            ),
        );
        await waitFor(() => expect(location.hash).toBe(`#${TODAY}/agenda`));
        expect(history.length).toBe(length);
    });
});
