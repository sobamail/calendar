// @vitest-environment jsdom

// App.svelte against the real module on the stand-in runtime (test/backend.ts): the
// event form's description, guests and call link, and the popover that shows them.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    DeleteEvent,
    GetEvent,
    PutCalendar,
    PutCalendarResponse,
    PutEvent,
    PutEventResponse,
    type Event,
    type EventData,
} from "$module/calendar/v1";
import App from "./App.svelte";
import { HOUR_PX } from "./lib/data";
import {
    addDays,
    agendaRangeLabel,
    agendaSpan,
    dayGroupLabel,
    isoAt,
    longDate,
    parseYmd,
    setZone,
    today,
    weekDays,
    ymd,
} from "./lib/dates";
import { install_backend, type Backend } from "./test/backend";
import { ACCOUNT, ERRORS, PRIMARY, type FakeMessage } from "./test/soba";

let backend: Backend;

beforeEach(async () => {
    backend = await install_backend();
    localStorage.clear();
});

const TODAY = ymd(today());
const put = (content: Partial<EventData>) =>
    backend.soba.run<PutEventResponse>(
        new PutEvent({ start: isoAt(TODAY, 10), end: isoAt(TODAY, 11), ...content }),
    )!.uuid;
const get = (uuid: string) =>
    backend.soba.run<Event>({ process: () => new GetEvent({ uuid }).process(ERRORS) })!;
const stored = () => backend.soba.sql("SELECT uuid FROM event").map((r) => r[0] as string);
const putCal = (name: string, color = "#8e44ad") =>
    backend.soba.run<PutCalendarResponse>(new PutCalendar({ name, color }))!.uuid;

const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const guestRows = () => screen.queryAllByLabelText(/^Guest \d+$/) as HTMLInputElement[];

async function openForm() {
    const user = userEvent.setup();
    render(App);
    await user.click(screen.getAllByRole("button", { name: /New event/ })[0]);
    await user.type(screen.getByLabelText("Title"), "Planning");
    return user;
}

async function addGuest(user: ReturnType<typeof userEvent.setup>, address: string) {
    await user.click(button("Add guest"));
    const rows = guestRows();
    await user.type(rows[rows.length - 1], address);
}

async function openEvent(user: ReturnType<typeof userEvent.setup>, title: string) {
    await user.click(await screen.findByRole("button", { name: new RegExp(title) }));
    return screen.findByRole("dialog", { name: title });
}

describe("the event form", () => {
    it("saves description, guests and call link, and the popover shows them", async () => {
        const user = await openForm();
        await user.type(screen.getByLabelText("Description"), "Q4 roadmap");
        await addGuest(user, "ann@example.com");
        await addGuest(user, "bob@example.com");
        await user.type(screen.getByLabelText("Video call link"), "https://meet.example.com/q4");
        await user.click(button("Add event"));

        await waitFor(() => expect(stored()).toHaveLength(1));
        expect(get(stored()[0])).toMatchObject({
            title: "Planning",
            desc: "Q4 roadmap",
            attendees: ["ann@example.com", "bob@example.com"],
            callUrl: "https://meet.example.com/q4",
            call: 1,
        });

        const dialog = await openEvent(user, "Planning");
        expect(dialog.textContent).toContain("Q4 roadmap");
        expect(dialog.textContent).toContain("ann@example.com");
        expect(dialog.textContent).toContain("bob@example.com");
        const join = screen.getByRole("link", { name: "Join video call" }) as HTMLAnchorElement;
        expect(join.href).toBe("https://meet.example.com/q4");
        expect(join.target).toBe("_blank");
        expect(join.rel).toContain("noopener");
    });

    it("keeps a new timed event timed, without a call", async () => {
        const user = await openForm();
        await user.click(button("Add event"));

        const block = await screen.findByRole("button", { name: /Planning/ });
        expect(block.classList.contains("event")).toBe(true);
        expect(block.classList.contains("all-day-chip")).toBe(false);
        const dialog = await openEvent(user, "Planning");
        expect(dialog.textContent).not.toContain("All day");
        expect(within(dialog).queryByRole("button", { name: "Join video call" })).toBeNull();
    });

    it("disables saving while a guest row is malformed, and drops blank rows", async () => {
        const user = await openForm();
        await addGuest(user, "ann@");
        expect(button("Add event").disabled).toBe(true);
        expect(guestRows()[0].getAttribute("aria-invalid")).toBe("true");

        await user.type(guestRows()[0], "example.com");
        await user.click(button("Add guest"));
        expect(button("Add event").disabled).toBe(false);
        await user.click(button("Add event"));

        await waitFor(() => expect(stored()).toHaveLength(1));
        expect(get(stored()[0]).attendees).toEqual(["ann@example.com"]);
    });

    it("removes a guest row", async () => {
        const user = await openForm();
        await addGuest(user, "ann@example.com");
        await addGuest(user, "bob@example.com");
        await user.click(button("Remove guest 1"));
        expect(guestRows().map((r) => r.value)).toEqual(["bob@example.com"]);
    });

    it("disables saving on a call link that is no http(s) URL", async () => {
        const user = await openForm();
        await user.type(screen.getByLabelText("Video call link"), "javascript:alert(1)");
        expect(button("Add event").disabled).toBe(true);
        await user.clear(screen.getByLabelText("Video call link"));
        expect(button("Add event").disabled).toBe(false);
    });

    it("edits a stored event's description, guests and link", async () => {
        const uuid = put({
            title: "Sync",
            desc: "old notes",
            attendees: ["ann@example.com"],
            callUrl: "https://meet.example.com/s",
        });
        const user = userEvent.setup();
        render(App);
        await openEvent(user, "Sync");
        await user.click(button("Edit"));

        expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe(
            "old notes",
        );
        expect(guestRows().map((r) => r.value)).toEqual(["ann@example.com"]);
        await user.clear(screen.getByLabelText("Video call link"));
        await user.click(button("Remove guest 1"));
        await user.click(button("Save changes"));

        await waitFor(() => expect(get(uuid)).toMatchObject({ callUrl: "", call: 0 }));
        expect(get(uuid)).toMatchObject({ desc: "old notes", attendees: [] });
        await openEvent(user, "Sync");
        expect(screen.queryByText("Join video call")).toBeNull();
    });
});

describe("multi-day events", () => {
    const day = (n: number) => ymd(addDays(today(), n));
    const dateField = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
    const setDate = (label: string, value: string) =>
        fireEvent.input(dateField(label), { target: { value } });

    it("saves an end date after the start; it defaults to the start date", async () => {
        const user = await openForm();
        expect(dateField("End date").value).toBe(TODAY);
        await setDate("End date", day(2));
        await user.click(button("Add event"));

        await waitFor(() => expect(stored()).toHaveLength(1));
        expect(get(stored()[0])).toMatchObject({ start: isoAt(TODAY, 10), end: isoAt(day(2), 11) });
    });

    it("refuses an end date before the start", async () => {
        const user = await openForm();
        await setDate("End date", day(-1));
        await user.click(button("Add event"));
        expect(screen.getByRole("alert").textContent).toContain("can't end before it starts");
        expect(stored()).toHaveLength(0);
    });

    it("moves the end date along when the start date moves", async () => {
        await openForm();
        await setDate("End date", day(2));
        await setDate("Start date", day(1));
        expect(dateField("End date").value).toBe(day(3));
    });

    it("keeps a timed event that ends at or before its start hour on a later day", async () => {
        const user = await openForm();
        await setDate("End date", day(1));
        await user.selectOptions(screen.getByLabelText("Ends"), "9");
        await user.click(button("Add event"));

        await waitFor(() => expect(stored()).toHaveLength(1));
        expect(get(stored()[0]).end).toBe(isoAt(day(1), 9));
    });

    it("edits a stored multi-day event with its end date", async () => {
        put({ title: "Offsite", start: isoAt(TODAY, 9), end: isoAt(day(2), 17) });
        const user = userEvent.setup();
        render(App);
        await user.click((await screen.findAllByRole("button", { name: /Offsite/ }))[0]);
        await user.click(button("Edit"));
        expect(dateField("Start date").value).toBe(TODAY);
        expect(dateField("End date").value).toBe(day(2));
    });

    const putTrip = () =>
        put({ title: "Trip", allDay: 1, start: isoAt(TODAY, 0), end: isoAt(day(2), 23 + 59 / 60) });

    it("draws a chip on every month cell it covers, flat where it continues", async () => {
        putTrip();
        const user = userEvent.setup();
        const { container } = render(App);
        await user.click(button("Month"));
        await screen.findAllByRole("button", { name: /Trip/ });

        const chip = (n: number) => container.querySelector(`.cell[data-date="${day(n)}"] .chip`);
        expect([-1, 0, 1, 2, 3].map((n) => chip(n)?.textContent?.trim() ?? null)).toEqual([
            null,
            "Trip",
            "Trip",
            "Trip",
            null,
        ]);
        const edges = (n: number) => [
            chip(n)!.classList.contains("from-before"),
            chip(n)!.classList.contains("to-after"),
        ];
        expect([0, 1, 2].map(edges)).toEqual([
            [false, true],
            [true, true],
            [true, false],
        ]);
    });

    it("lists it in the agenda under each day, saying which day it is", async () => {
        putTrip();
        const user = userEvent.setup();
        render(App);
        await user.click(button("Agenda"));
        const rows = await screen.findAllByRole("button", { name: /Trip/ });
        expect(rows.map((r) => r.querySelector(".title")!.textContent!.trim())).toEqual([
            "Trip (day 1 of 3)",
            "Trip (day 2 of 3)",
            "Trip (day 3 of 3)",
        ]);
    });

    it("shows both ends in the popover", async () => {
        put({ title: "Offsite", start: isoAt(TODAY, 9), end: isoAt(day(2), 17) });
        const user = userEvent.setup();
        render(App);
        await user.click((await screen.findAllByRole("button", { name: /Offsite/ }))[0]);
        const dialog = screen.getByRole("dialog", { name: "Offsite" });
        expect(dialog.textContent).toContain(`${longDate(today())}, 9 AM – `);
        expect(dialog.textContent).toContain(`${longDate(addDays(today(), 2))}, 5 PM`);
    });
});

describe("the dialogs", () => {
    it("move focus into the form, close it on Escape and give focus back", async () => {
        const user = userEvent.setup();
        render(App);
        const opener = screen.getAllByRole("button", { name: /New event/ })[0];
        await user.click(opener);
        const form = screen.getByRole("dialog", { name: "Event form" });
        expect(form.contains(document.activeElement)).toBe(true);

        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog", { name: "Event form" })).toBeNull();
        expect(document.activeElement).toBe(opener);
    });

    it("move focus into the popover, close it on Escape and give focus back", async () => {
        put({ title: "Standup" });
        const user = userEvent.setup();
        render(App);
        const chip = await screen.findByRole("button", { name: /Standup/ });
        const dialog = await openEvent(user, "Standup");
        expect(dialog.contains(document.activeElement)).toBe(true);

        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog", { name: "Standup" })).toBeNull();
        expect(document.activeElement).toBe(chip);
    });

    it("close on a click on the overlay but not on one inside the card", async () => {
        put({ title: "Standup" });
        const user = userEvent.setup();
        render(App);
        const dialog = await openEvent(user, "Standup");
        await user.click(dialog.querySelector("h2")!);
        expect(screen.queryByRole("dialog", { name: "Standup" })).not.toBeNull();
        await user.click(dialog.parentElement!);
        expect(screen.queryByRole("dialog", { name: "Standup" })).toBeNull();
    });
});

describe("click to create", () => {
    const field = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;

    it("opens the form at the half hour clicked in a day column", async () => {
        const { container } = render(App);
        const col = container.querySelector(`.day-col[data-date="${TODAY}"]`)!;
        await fireEvent.click(col, { clientY: 14.6 * HOUR_PX });

        expect(screen.getByRole("dialog", { name: "Event form" })).not.toBeNull();
        expect(field("Start date")).toBe(TODAY);
        expect(field("Starts")).toBe("14.5");
        expect(field("Ends")).toBe("15.5");
        expect((screen.getByLabelText("All day") as HTMLInputElement).checked).toBe(false);
    });

    it("still selects an event clicked in a day column", async () => {
        put({ title: "Standup" });
        const user = userEvent.setup();
        render(App);
        await openEvent(user, "Standup");
        expect(screen.queryByRole("dialog", { name: "Event form" })).toBeNull();
    });

    it("opens the form on the day of a month cell, timed 10–11", async () => {
        const user = userEvent.setup();
        const { container } = render(App);
        await user.click(button("Month"));
        await user.click(container.querySelector(`.cell[data-date="${TODAY}"]`)!);

        expect(field("Start date")).toBe(TODAY);
        expect(field("Starts")).toBe("10");
        expect(field("Ends")).toBe("11");
    });

    it("opens the day from a month cell's +N more", async () => {
        for (const title of ["A", "B", "C", "D"]) put({ title });
        const user = userEvent.setup();
        const { container } = render(App);
        await user.click(button("Month"));
        await user.click(await screen.findByRole("button", { name: "+1 more" }));

        expect(screen.queryByRole("dialog", { name: "Event form" })).toBeNull();
        expect(container.querySelectorAll(".day-col")).toHaveLength(1);
        expect(container.querySelector(`.day-col[data-date="${TODAY}"]`)).not.toBeNull();
    });
});

describe("dragging in the week view", () => {
    const week = weekDays(today()).map(ymd);
    // jsdom lays nothing out: the week's columns are 100px wide from x 0, their top at y 0
    function layOut(container: HTMLElement) {
        for (const lane of [".day-col", ".all-day-col"]) {
            container.querySelectorAll(lane).forEach((col, i) => {
                col.getBoundingClientRect = () =>
                    ({ left: i * 100, right: (i + 1) * 100, top: 0, bottom: 24 * HOUR_PX }) as DOMRect;
            });
        }
    }
    const block = (container: HTMLElement, date: string) =>
        container.querySelector(`.day-col[data-date="${date}"] .event`);

    async function grabStandup(extra: Partial<EventData> = {}) {
        const uuid = put({
            title: "Standup",
            start: isoAt(week[0], 9),
            end: isoAt(week[0], 10),
            ...extra,
        });
        const { container } = render(App);
        const standup = await screen.findByRole("button", { name: /Standup/ });
        layOut(container);
        await fireEvent.pointerDown(standup, { button: 0, clientX: 50, clientY: 9.1 * HOUR_PX });
        return { uuid, container, standup };
    }

    describe("an event with guests", () => {
        const GUESTS = { attendees: ["ann@example.com", "bob@example.com"] };
        const sent = () => backend.soba.sent as FakeMessage[];
        const ask = () => screen.queryByRole("dialog", { name: "Tell the guests" });

        // grabbed, dragged two columns over and 2.3 hours down (to 11:15), and dropped
        async function dropStandup(extra: Partial<EventData> = GUESTS) {
            const dragged = await grabStandup(extra);
            await fireEvent.pointerMove(document, { buttons: 1, clientX: 250, clientY: 11.4 * HOUR_PX });
            await fireEvent.pointerUp(document);
            // the click the release makes, which the grid swallows
            await fireEvent.click(block(dragged.container, week[2])!);
            return dragged;
        }

        it("asks first, showing it where it was dropped, saving nothing yet", async () => {
            const { uuid, container } = await dropStandup();
            const dialog = await screen.findByRole("dialog", { name: "Tell the guests" });
            expect(dialog.textContent).toContain("Standup moves to");
            expect(dialog.textContent).toContain("11:15 AM – 12:15 PM");
            expect(dialog.textContent).toContain("Send its 2 guests the new time?");
            expect(block(container, week[2])).not.toBeNull();
            expect(get(uuid).start).toBe(isoAt(week[0], 9));
        });

        it("puts it back on no, saving and sending nothing", async () => {
            const { uuid, container } = await dropStandup();
            await fireEvent.click(await screen.findByRole("button", { name: "Put it back" }));
            expect(ask()).toBeNull();
            expect(block(container, week[0])).not.toBeNull();
            expect(block(container, week[2])).toBeNull();
            expect(get(uuid).start).toBe(isoAt(week[0], 9));
            expect(sent()).toEqual([]);
        });

        it("puts it back on Escape too", async () => {
            const { uuid, container } = await dropStandup();
            await screen.findByRole("dialog", { name: "Tell the guests" });
            await fireEvent.keyDown(window, { key: "Escape" });
            expect(ask()).toBeNull();
            expect(block(container, week[0])).not.toBeNull();
            expect(get(uuid).start).toBe(isoAt(week[0], 9));
        });

        it("saves it on yes and mails the guests an update with a raised sequence", async () => {
            const { uuid } = await dropStandup();
            await fireEvent.click(await screen.findByRole("button", { name: "Send update" }));
            await waitFor(() => expect(sent()).toHaveLength(1));
            expect(get(uuid)).toMatchObject({
                start: isoAt(week[2], 11.25),
                end: isoAt(week[2], 12.25),
                sequence: 1,
            });

            const m = sent()[0];
            expect(m.to).toEqual([{ address: "ann@example.com" }, { address: "bob@example.com" }]);
            expect(m.subject).toBe("Updated invitation: Standup");
            expect(m.bodyText).toContain("Standup has a new time.");
            const ics = new TextDecoder().decode(m.attachments[0].init.blobs[0]);
            expect(ics).toContain("METHOD:REQUEST");
            expect(ics).toContain("SEQUENCE:1");
            expect(ics).toMatch(new RegExp(`DTSTART(;TZID=[^:]+)?:${week[2].replace(/-/g, "")}T111500`));

            const popover = await screen.findByRole("dialog", { name: "Standup" });
            expect(within(popover).getByRole("status").textContent).toContain(
                "Update sent to 2 guests.",
            );
        });

    });

    describe("an event organized by someone else", () => {
        const INVITED = {
            attendees: [ACCOUNT, "other@example.com"],
            uid: "abc@contoso.com",
            organizer: "boss@contoso.com",
            status: "tentative",
        };

        it("can't be moved: it stays put and nothing is saved", async () => {
            const { uuid, container } = await grabStandup(INVITED);
            await fireEvent.pointerMove(document, { buttons: 1, clientX: 250, clientY: 11.4 * HOUR_PX });
            expect(block(container, week[0])).not.toBeNull();
            expect(block(container, week[2])).toBeNull();
            await fireEvent.pointerUp(document);
            expect(block(container, week[0])).not.toBeNull();
            expect(screen.queryByRole("dialog", { name: "Tell the guests" })).toBeNull();
            expect(get(uuid).start).toBe(isoAt(week[0], 9));
        });

        it("has no resize handle, and a press on it still opens it", async () => {
            const { container, standup } = await grabStandup(INVITED);
            expect(block(container, week[0])!.querySelector(".resize")).toBeNull();
            await fireEvent.pointerUp(document);
            await fireEvent.click(standup);
            expect(screen.getByRole("dialog", { name: "Standup" })).not.toBeNull();
        });
    });

    it("moves a timed event by whole days and quarter hours, saving it on release", async () => {
        const { uuid, container } = await grabStandup();
        // two columns over, 2.3 hours down: 9:00 + 2:18 snaps to 11:15
        await fireEvent.pointerMove(document, { buttons: 1, clientX: 250, clientY: 11.4 * HOUR_PX });
        expect(block(container, week[0])).toBeNull();
        expect(block(container, week[2])?.textContent).toContain("11:15 AM – 12:15 PM");
        expect(get(uuid).start).toBe(isoAt(week[0], 9));

        await fireEvent.pointerUp(document);
        // the click the release makes opens nothing
        await fireEvent.click(block(container, week[2])!);
        await waitFor(() =>
            expect(get(uuid)).toMatchObject({
                start: isoAt(week[2], 11.25),
                end: isoAt(week[2], 12.25),
            }),
        );
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(block(container, week[2])?.textContent).toContain("11:15 AM – 12:15 PM");
    });

    it("puts the event back on Escape, saving nothing", async () => {
        const { uuid, container } = await grabStandup();
        await fireEvent.pointerMove(document, { buttons: 1, clientX: 250, clientY: 11.4 * HOUR_PX });
        await fireEvent.keyDown(window, { key: "Escape" });
        expect(block(container, week[0])).not.toBeNull();
        expect(block(container, week[2])).toBeNull();
        await fireEvent.pointerUp(document);
        expect(get(uuid).start).toBe(isoAt(week[0], 9));
    });

    it("puts the event back when the button came up out of sight, saving nothing", async () => {
        const { uuid, container } = await grabStandup();
        await fireEvent.pointerMove(document, { buttons: 1, clientX: 250, clientY: 11.4 * HOUR_PX });
        expect(block(container, week[2])).not.toBeNull();
        // released outside the window, then moved back in with no button down
        await fireEvent.pointerMove(document, { buttons: 0, clientX: 1000, clientY: 15 });
        expect(block(container, week[0])).not.toBeNull();
        expect(block(container, week[6])).toBeNull();
        await fireEvent.pointerUp(document);
        expect(block(container, week[0])).not.toBeNull();
        expect(get(uuid).start).toBe(isoAt(week[0], 9));
    });

    it("takes a press that hardly moves as a click", async () => {
        const { uuid, standup } = await grabStandup();
        await fireEvent.pointerMove(document, { buttons: 1, clientX: 52, clientY: 9.1 * HOUR_PX + 2 });
        await fireEvent.pointerUp(document);
        await fireEvent.click(standup);
        expect(screen.getByRole("dialog", { name: "Standup" })).not.toBeNull();
        expect(get(uuid).start).toBe(isoAt(week[0], 9));
    });

    it("moves the end by quarter hours from the bottom edge, keeping the start", async () => {
        const uuid = put({ title: "Standup", start: isoAt(week[0], 9), end: isoAt(week[0], 10) });
        const { container } = render(App);
        await screen.findByRole("button", { name: /Standup/ });
        layOut(container);
        const handle = block(container, week[0])!.querySelector(".resize")!;
        await fireEvent.pointerDown(handle, { button: 0, clientX: 50, clientY: 10 * HOUR_PX });
        // sideways travel doesn't move it to another day: 10:00 + 1:18 snaps to 11:15
        await fireEvent.pointerMove(document, { buttons: 1, clientX: 250, clientY: 11.3 * HOUR_PX });
        expect(block(container, week[0])?.textContent).toContain("9 AM – 11:15 AM");
        await fireEvent.pointerUp(document);
        await waitFor(() =>
            expect(get(uuid)).toMatchObject({
                start: isoAt(week[0], 9),
                end: isoAt(week[0], 11.25),
            }),
        );
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("moves an all-day event by whole days in its lane", async () => {
        const uuid = put({
            title: "Trip",
            allDay: 1,
            start: isoAt(week[1], 0),
            end: isoAt(week[2], 23 + 59 / 60),
        });
        const { container } = render(App);
        const [chip] = await screen.findAllByRole("button", { name: /Trip/ });
        layOut(container);
        await fireEvent.pointerDown(chip, { button: 0, clientX: 150, clientY: 10 });
        await fireEvent.pointerMove(document, { buttons: 1, clientX: 450, clientY: 300 });
        await fireEvent.pointerUp(document);
        await waitFor(() =>
            expect(get(uuid)).toMatchObject({
                start: isoAt(week[4], 0),
                end: isoAt(week[5], 23 + 59 / 60),
                allDay: 1,
            }),
        );
    });
});

describe("deleting", () => {
    it("asks first; Cancel keeps the event", async () => {
        put({ title: "Standup" });
        const user = userEvent.setup();
        render(App);
        await openEvent(user, "Standup");
        await user.click(button("Delete"));
        expect(screen.getByText("Delete 'Standup'?")).not.toBeNull();
        expect(stored()).toHaveLength(1);

        await user.click(button("Cancel"));
        expect(screen.queryByText("Delete 'Standup'?")).toBeNull();
        expect(stored()).toHaveLength(1);
    });

    it("takes the question back on Escape, keeping the popover", async () => {
        put({ title: "Standup" });
        const user = userEvent.setup();
        render(App);
        await openEvent(user, "Standup");
        await user.click(button("Delete"));
        await user.keyboard("{Escape}");
        expect(screen.queryByText("Delete 'Standup'?")).toBeNull();
        expect(screen.queryByRole("dialog", { name: "Standup" })).not.toBeNull();
        expect(stored()).toHaveLength(1);
    });

    it("deletes on Confirm", async () => {
        put({ title: "Standup" });
        const user = userEvent.setup();
        render(App);
        await openEvent(user, "Standup");
        await user.click(button("Delete"));
        await user.click(button("Confirm"));
        await waitFor(() => expect(stored()).toHaveLength(0));
        expect(screen.queryByRole("dialog", { name: "Standup" })).toBeNull();
    });

    it("deletes on Enter once asked", async () => {
        put({ title: "Standup" });
        const user = userEvent.setup();
        render(App);
        await openEvent(user, "Standup");
        await user.click(button("Delete"));
        await user.keyboard("{Enter}");
        await waitFor(() => expect(stored()).toHaveLength(0));
    });
});

describe("search", () => {
    const field = () => screen.getByLabelText("Search events") as HTMLInputElement;
    const status = () => screen.queryByRole("status", { name: "Search results" });

    beforeEach(() => {
        put({ title: "Dentist", location: "Şişli" });
        put({ title: "Lunch" });
    });

    it("counts the hits among the shown events, folding accents", async () => {
        const user = userEvent.setup();
        render(App);
        await screen.findByRole("button", { name: /Dentist/ });
        expect(status()).toBeNull();

        await user.type(field(), "sisli");
        await waitFor(() => expect(status()?.textContent).toBe("1 of 2 in view"));
    });

    it("says so when nothing in the shown months matches", async () => {
        const user = userEvent.setup();
        render(App);
        await screen.findByRole("button", { name: /Dentist/ });
        await user.type(field(), "zzz");
        await waitFor(() =>
            expect(status()?.textContent).toBe("no matches in the shown months"),
        );
    });

    it("clears with the clear button and with Escape", async () => {
        const user = userEvent.setup();
        render(App);
        await screen.findByRole("button", { name: /Dentist/ });
        await user.type(field(), "lunch");
        await waitFor(() => expect(status()).not.toBeNull());

        await user.click(button("Clear search"));
        expect(field().value).toBe("");
        expect(status()).toBeNull();
        expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();

        await user.type(field(), "lunch");
        await waitFor(() => expect(status()).not.toBeNull());
        await user.keyboard("{Escape}");
        expect(field().value).toBe("");
        expect(status()).toBeNull();
    });
});

describe("calendars", () => {
    // the named calendars: the primary one only once it is renamed
    const storedCals = () =>
        backend.soba.sql(
            "SELECT c.uuid, n.value, k.value FROM calendar c" +
                " JOIN calendar_attr n ON n.calendar = c.uuid AND n.key = 'name'" +
                " JOIN calendar_attr k ON k.calendar = c.uuid AND k.key = 'color'",
        );
    const calForm = () => screen.getByRole("dialog", { name: "Calendar form" });
    const options = () =>
        [...(screen.getByLabelText("Calendar") as HTMLSelectElement).options].map((o) => o.text);

    it("creates one from the sidebar; it is listed there and in the event form", async () => {
        const user = userEvent.setup();
        render(App);
        await user.click(button("Add calendar"));
        expect(calForm().contains(document.activeElement)).toBe(true);
        await user.type(screen.getByLabelText("Name"), "Book club");
        await user.click(screen.getByRole("radio", { name: "Teal" }));
        await user.click(button("Create calendar"));

        await waitFor(() => expect(storedCals()).toHaveLength(1));
        expect(storedCals()[0].slice(1)).toEqual(["Book club", "#16a085"]);
        expect(screen.queryByRole("dialog", { name: "Calendar form" })).toBeNull();
        expect(await screen.findByRole("button", { name: "Book club" })).not.toBeNull();

        await user.click(screen.getAllByRole("button", { name: /New event/ })[0]);
        expect(options()).toEqual(["(Calendar)", "Book club"]);
    });

    it("lists the unnamed primary calendar as (Calendar); a new event goes to it", async () => {
        const user = userEvent.setup();
        render(App);
        expect(await screen.findByRole("button", { name: "(Calendar)" })).not.toBeNull();
        await user.click(screen.getAllByRole("button", { name: /New event/ })[0]);
        await user.type(screen.getByLabelText("Title"), "Planning");
        expect(options()).toEqual(["(Calendar)"]);
        expect((screen.getByLabelText("Calendar") as HTMLSelectElement).value).toBe(PRIMARY);
        await user.click(button("Add event"));

        await waitFor(() => expect(stored()).toHaveLength(1));
        expect(get(stored()[0]).cal).toBe(PRIMARY);
    });

    it("renames the primary calendar, offering no Delete", async () => {
        const user = userEvent.setup();
        render(App);
        await user.click(await screen.findByRole("button", { name: "Edit (Calendar)" }));
        expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
        expect(screen.queryByRole("button", { name: "Delete calendar" })).toBeNull();
        await user.type(screen.getByLabelText("Name"), "Home");
        await user.click(button("Save calendar"));

        await waitFor(() => expect(storedCals()).toEqual([[PRIMARY, "Home", "#4180ff"]]));
        expect(await screen.findByRole("button", { name: "Home" })).not.toBeNull();
        expect(screen.queryByRole("button", { name: "(Calendar)" })).toBeNull();
    });

    it("files an event under a created calendar", async () => {
        const uuid = putCal("Book club");
        const user = await openForm();
        await screen.findByRole("option", { name: "Book club" });
        await user.selectOptions(screen.getByLabelText("Calendar"), "Book club");
        await user.click(button("Add event"));
        await waitFor(() => expect(stored()).toHaveLength(1));
        expect(get(stored()[0]).cal).toBe(uuid);
    });

    it("renames and recolors one", async () => {
        const uuid = putCal("Book club");
        const user = userEvent.setup();
        render(App);
        await user.click(await screen.findByRole("button", { name: "Edit Book club" }));
        expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Book club");
        expect(screen.getByRole("radio", { name: "Purple" }).getAttribute("aria-checked")).toBe(
            "true",
        );
        await user.clear(screen.getByLabelText("Name"));
        await user.type(screen.getByLabelText("Name"), "Reading");
        await user.click(screen.getByRole("radio", { name: "Pink" }));
        await user.click(button("Save calendar"));

        await waitFor(() => expect(storedCals()).toEqual([[uuid, "Reading", "#e84393"]]));
        expect(await screen.findByRole("button", { name: "Reading" })).not.toBeNull();
    });

    it("won't create one without a name", async () => {
        const user = userEvent.setup();
        render(App);
        await user.click(button("Add calendar"));
        expect(button("Create calendar").disabled).toBe(true);
        await user.type(screen.getByLabelText("Name"), "  ");
        expect(button("Create calendar").disabled).toBe(true);
    });

    it("deletes an unused one", async () => {
        putCal("Book club");
        const user = userEvent.setup();
        render(App);
        await user.click(await screen.findByRole("button", { name: "Edit Book club" }));
        await user.click(button("Delete calendar"));
        await waitFor(() => expect(storedCals()).toHaveLength(0));
        expect(screen.queryByRole("dialog", { name: "Calendar form" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Book club" })).toBeNull();
    });

    it("refuses to delete one events use, and says why", async () => {
        const cal = putCal("Book club");
        put({ title: "Chapter 1", cal });
        put({ title: "Chapter 2", cal });
        const user = userEvent.setup();
        render(App);
        await user.click(await screen.findByRole("button", { name: "Edit Book club" }));
        await user.click(button("Delete calendar"));
        expect((await screen.findByRole("alert")).textContent).toBe(
            "2 events use this calendar; move or delete them first.",
        );
        expect(storedCals()).toHaveLength(1);
        expect(calForm()).not.toBeNull();
    });

    it("shows an event on an unknown calendar in gray, and asks for another on save", async () => {
        const cal = putCal("Book club");
        put({ title: "Orphan", cal });
        // as another replica's delete, concurrent with the save, leaves it
        backend.soba.sql("DELETE FROM calendar WHERE uuid = ?", cal);
        const user = userEvent.setup();
        render(App);
        const dialog = await openEvent(user, "Orphan");
        expect(dialog.textContent).toContain("Unknown calendar");

        await user.click(button("Edit"));
        expect(options()).toEqual(["(Calendar)", "Unknown calendar"]);
        await user.click(button("Save changes"));
        expect(screen.getByRole("alert").textContent).toContain("Pick a calendar.");
        await user.selectOptions(screen.getByLabelText("Calendar"), "(Calendar)");
        await user.click(button("Save changes"));
        await waitFor(() => expect(get(stored()[0]).cal).toBe(PRIMARY));
    });

    it("remembers which calendars are hidden", async () => {
        put({ title: "Standup" });
        const user = userEvent.setup();
        const first = render(App);
        await screen.findByRole("button", { name: /Standup/ });
        await user.click(await screen.findByRole("button", { name: "(Calendar)" }));
        expect(button("(Calendar)").getAttribute("aria-pressed")).toBe("false");
        expect(screen.queryByRole("button", { name: /Standup/ })).toBeNull();
        first.unmount();

        render(App);
        await screen.findByRole("button", { name: "(Calendar)" });
        expect(button("(Calendar)").getAttribute("aria-pressed")).toBe("false");
        await waitFor(() => expect(backend.fetch).toHaveBeenCalled());
        expect(screen.queryByRole("button", { name: /Standup/ })).toBeNull();
    });

    it("starts with every calendar shown when the stored visibility is unreadable", async () => {
        localStorage.setItem("calendar.visible", "{not json");
        put({ title: "Standup" });
        render(App);
        expect(await screen.findByRole("button", { name: /Standup/ })).not.toBeNull();
    });
});

describe("the popover", () => {
    it("shows a stored call without a link as a disabled Join", async () => {
        put({ title: "Legacy" });
        backend.soba.sql("UPDATE event_attr_single SET value = 1 WHERE key = 'call'");
        backend.soba.sql("DELETE FROM event_attr_single WHERE key = 'callUrl'");
        const user = userEvent.setup();
        render(App);
        await openEvent(user, "Legacy");

        expect(screen.queryByRole("link", { name: "Join video call" })).toBeNull();
        expect(button("Join video call").disabled).toBe(true);
    });
});

describe("invitations", () => {
    const sent = () => backend.soba.sent as FakeMessage[];
    const ics = (m: FakeMessage) => new TextDecoder().decode(m.attachments[0].init.blobs[0]);

    it("mails the guests an invitation from the popover, organized by the account", async () => {
        put({ title: "Planning", location: "Room 4", attendees: ["ann@example.com", "bo@example.com"] });
        const user = userEvent.setup();
        render(App);
        const dialog = await openEvent(user, "Planning");

        await user.click(within(dialog).getByRole("button", { name: "Send invitations" }));
        expect((await within(dialog).findByRole("status")).textContent).toContain(
            "Invitations sent to 2 guests.",
        );
        expect(sent()).toHaveLength(1);
        const m = sent()[0];
        expect(m.to).toEqual([{ address: "ann@example.com" }, { address: "bo@example.com" }]);
        expect(m.subject).toBe("Invitation: Planning");
        expect(m.bodyText).toContain(longDate(today()));
        expect(m.bodyText).toContain("Room 4");
        expect(m.attachments[0].init.type).toBe("text/calendar; method=REQUEST");
        const text = ics(m);
        expect(text).toContain("METHOD:REQUEST");
        expect(text).toContain(`ORGANIZER:mailto:${ACCOUNT}`);
        expect(text).toContain("ATTENDEE:mailto:bo@example.com");
        expect(text).toContain("SUMMARY:Planning");
    });

    it("offers no invitations for an event without guests", async () => {
        put({ title: "Alone" });
        const user = userEvent.setup();
        render(App);
        const dialog = await openEvent(user, "Alone");
        expect(within(dialog).queryByRole("button", { name: "Send invitations" })).toBeNull();
    });

    it("offers them right after saving an event with guests", async () => {
        const user = await openForm();
        await addGuest(user, "ann@example.com");
        await user.click(button("Add event"));

        const dialog = await screen.findByRole("dialog", { name: "Planning" });
        expect(dialog.textContent).toContain("Saved. The guests haven't been told yet.");
        await user.click(within(dialog).getByRole("button", { name: "Send invitations" }));
        expect((await within(dialog).findByRole("status")).textContent).toContain(
            "Invitation sent to 1 guest.",
        );
        expect(sent()[0].to).toEqual([{ address: "ann@example.com" }]);
        expect(dialog.textContent).not.toContain("haven't been told");
    });

    it("just closes the form after saving an event without guests", async () => {
        const user = await openForm();
        await user.click(button("Add event"));
        await screen.findByRole("button", { name: /Planning/ });
        expect(screen.queryByRole("dialog", { name: "Planning" })).toBeNull();
    });

    describe("received", () => {
        const INVITED = {
            uid: "abc@contoso.com",
            organizer: "boss@contoso.com",
            status: "tentative",
            attendees: [ACCOUNT, "other@example.com"],
        };

        it("marks a mailed invitation dashed and labelled in the grid", async () => {
            put({ title: "Review", ...INVITED });
            put({ title: "Mine" });
            render(App);
            const block = await screen.findByRole("button", { name: /Review/ });
            expect(block.classList.contains("invitation")).toBe(true);
            expect(block.textContent).toContain("Invitation");
            const mine = screen.getByRole("button", { name: /Mine/ });
            expect(mine.classList.contains("invitation")).toBe(false);
            expect(mine.textContent).not.toContain("Invitation");
        });

        it("marks its month chip and its agenda row too", async () => {
            put({ title: "Review", ...INVITED });
            const user = userEvent.setup();
            render(App);
            await user.click(screen.getByRole("button", { name: "Month" }));
            const chip = await screen.findByRole("button", { name: /Review/ });
            expect(chip.classList.contains("invitation")).toBe(true);

            await user.click(screen.getByRole("button", { name: "Agenda" }));
            const row = await screen.findByRole("button", { name: /Review/ });
            expect(row.classList.contains("invitation")).toBe(true);
            expect(row.textContent).toContain("Invitation");
        });

        it("names the organizer in the popover and offers no invitations of its own", async () => {
            put({ title: "Review", ...INVITED });
            const user = userEvent.setup();
            render(App);
            const dialog = await openEvent(user, "Review");
            expect(dialog.textContent).toContain("Invitation from boss@contoso.com");
            expect(within(dialog).queryByRole("button", { name: "Send invitations" })).toBeNull();
        });
    });
});

describe("export and import", () => {
    // the files the app handed to the browser as downloads
    function downloads() {
        const files: { name: string; blob: Blob }[] = [];
        URL.createObjectURL = vi.fn((blob: Blob) => {
            files.push({ name: "", blob });
            return "blob:test";
        });
        URL.revokeObjectURL = vi.fn();
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            files[files.length - 1].name = this.download;
        });
        return files;
    }

    afterEach(() => vi.restoreAllMocks());

    it("exports the shown events as one iCalendar file", async () => {
        put({ title: "Standup" });
        put({ title: "Gym", cal: putCal("Health"), start: isoAt(TODAY, 18), end: isoAt(TODAY, 19) });
        const files = downloads();
        const user = userEvent.setup();
        render(App);
        await screen.findByRole("button", { name: /Gym/ });

        await user.click(button("Export"));
        expect(files.map((f) => f.name)).toEqual(["calendar.ics"]);
        expect(files[0].blob.type).toBe("text/calendar");
        const text = await files[0].blob.text();
        expect(text).toContain("SUMMARY:Standup");
        expect(text).toContain("SUMMARY:Gym");
        // in the browser's zone, whichever the suite runs in (the zone tests pin one)
        expect(text).toMatch(new RegExp(`DTSTART(;TZID=[^:]+)?:${TODAY.replace(/-/g, "")}T180000`));
    });

    it("exports one event from its popover", async () => {
        put({ title: "Standup" });
        put({ title: "Gym" });
        const files = downloads();
        const user = userEvent.setup();
        render(App);
        const dialog = await openEvent(user, "Standup");

        await user.click(within(dialog).getByRole("button", { name: "Export" }));
        expect(files.map((f) => f.name)).toEqual(["Standup.ics"]);
        const text = await files[0].blob.text();
        expect(text).toContain("SUMMARY:Standup");
        expect(text).not.toContain("SUMMARY:Gym");
    });

    it("imports the ticked events of a file into the chosen calendar", async () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "BEGIN:VEVENT",
            "UID:one@example.com",
            "SUMMARY:Planning",
            "DTSTART:20260708T093000",
            "DTEND:20260708T110000",
            "LOCATION:Room 4",
            "ATTENDEE:mailto:ann@example.com",
            "URL:https://meet.example.com/q4",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "SUMMARY:Not this",
            "DTSTART:20260709T090000",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "DTSTART;VALUE=DATE:20260710",
            "DTEND;VALUE=DATE:20260712",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "SUMMARY:Called off",
            "STATUS:CANCELLED",
            "DTSTART:20260709T090000",
            "END:VEVENT",
            "END:VCALENDAR",
            "",
        ].join("\r\n");
        const cal = putCal("Book club");
        const user = userEvent.setup();
        render(App);
        await screen.findByRole("button", { name: "Book club" });
        await user.upload(
            screen.getByLabelText("iCalendar file to import"),
            new File([ics], "events.ics", { type: "text/calendar" }),
        );

        const dialog = await screen.findByRole("dialog", { name: "Import events" });
        expect(dialog.textContent).toContain("1 cancelled or unreadable event skipped");
        const boxes = within(dialog).getAllByRole("checkbox") as HTMLInputElement[];
        expect(boxes.map((b) => b.checked)).toEqual([true, true, true]);
        await user.click(boxes[1]);
        // the primary calendar is offered first
        expect((within(dialog).getByLabelText("Into calendar") as HTMLSelectElement).value).toBe(
            PRIMARY,
        );
        await user.selectOptions(within(dialog).getByLabelText("Into calendar"), "Book club");

        await user.click(within(dialog).getByRole("button", { name: "Import 2 events" }));
        await within(dialog).findByText("Imported 2 of 2.");
        expect(
            (within(dialog).getByLabelText("Import progress") as HTMLProgressElement).value,
        ).toBe(2);

        const events = stored().map(get);
        expect(events).toHaveLength(2);
        expect(events.find((e) => e.title === "Planning")).toMatchObject({
            cal,
            start: "2026-07-08T09:30",
            end: "2026-07-08T11:00",
            location: "Room 4",
            attendees: ["ann@example.com"],
            callUrl: "https://meet.example.com/q4",
        });
        expect(events.find((e) => e.title === "(No title)")).toMatchObject({
            cal,
            start: "2026-07-10T00:00",
            end: "2026-07-11T23:59",
            allDay: 1,
        });

        await user.click(within(dialog).getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog", { name: "Import events" })).toBeNull();
    });

    it("says so when a file holds no events", async () => {
        const user = userEvent.setup();
        render(App);
        await user.upload(
            screen.getByLabelText("iCalendar file to import"),
            new File(["BEGIN:VCARD\r\nEND:VCARD\r\n"], "card.ics", { type: "text/calendar" }),
        );
        expect((await screen.findByRole("alert")).textContent).toContain(
            "No events found in card.ics",
        );
        expect(screen.queryByRole("dialog", { name: "Import events" })).toBeNull();
    });
});

// The browser's zone is pinned with setZone: conversion goes between named zones only,
// so the expectations hold wherever the suite runs.
describe("time zones", () => {
    beforeEach(() => setZone("UTC"));
    afterEach(() => setZone(null));

    // 18:00–19:00 in Tokyo (+9) is 09:00–10:00 UTC, the same day
    const TOKYO = { tz: "Asia/Tokyo", start: isoAt(TODAY, 18), end: isoAt(TODAY, 19) };

    it("shows an event of another zone at the browser's time, naming its zone", async () => {
        put({ title: "Tokyo call", ...TOKYO });
        const user = userEvent.setup();
        render(App);
        const dialog = await openEvent(user, "Tokyo call");
        expect(dialog.textContent).toContain("9 AM – 10 AM");
        expect(dialog.textContent).toContain("Scheduled in Asia/Tokyo");
    });

    it("names no zone for an event in the browser's, or one stored without a zone", async () => {
        put({ title: "Here", tz: "UTC" });
        put({ title: "Old" });
        const user = userEvent.setup();
        render(App);
        expect((await openEvent(user, "Here")).textContent).not.toContain("Scheduled in");
        await user.keyboard("{Escape}");
        const old = await openEvent(user, "Old");
        expect(old.textContent).toContain("10 AM – 11 AM");
        expect(old.textContent).not.toContain("Scheduled in");
    });

    it("saves an edit back in the event's own zone", async () => {
        const uuid = put({ title: "Tokyo call", ...TOKYO });
        const user = userEvent.setup();
        render(App);
        await openEvent(user, "Tokyo call");
        await user.click(button("Edit"));
        await user.type(screen.getByLabelText("Title"), " (moved)");
        await user.click(button("Save changes"));

        await waitFor(() => expect(get(uuid).title).toBe("Tokyo call (moved)"));
        expect(get(uuid)).toMatchObject(TOKYO);
    });

    it("creates an event in the browser's zone", async () => {
        setZone("Europe/Istanbul");
        const user = await openForm();
        await user.click(button("Add event"));
        await waitFor(() => expect(stored()).toHaveLength(1));
        expect(get(stored()[0]).tz).toBe("Europe/Istanbul");
    });

    it("exports an event with its zone as the TZID", async () => {
        put({ title: "Tokyo call", ...TOKYO });
        put({ title: "Here", start: isoAt(TODAY, 18), end: isoAt(TODAY, 19) });
        const URLs = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
        let blob: Blob | null = null;
        URL.createObjectURL = vi.fn((b: Blob) => ((blob = b), "blob:test"));
        URL.revokeObjectURL = vi.fn();
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
        try {
            const user = userEvent.setup();
            render(App);
            await screen.findByRole("button", { name: /Tokyo call/ });
            await user.click(button("Export"));
            const text = await blob!.text();
            const day = TODAY.replace(/-/g, "");
            expect(text).toContain(`DTSTART;TZID=Asia/Tokyo:${day}T180000`);
            // stored without a zone: the browser's, here UTC
            expect(text).toContain(`DTSTART:${day}T180000Z`);
        } finally {
            click.mockRestore();
            URL.createObjectURL = URLs.create;
            URL.revokeObjectURL = URLs.revoke;
        }
    });
});

describe("views and chrome", () => {
    const { from, last } = agendaSpan(today());
    const lastDay = parseYmd(last);
    const range = () => document.querySelector(".toolbar .range")!.textContent;
    const notice = () => screen.queryByRole("status", { name: "Event limit" });

    it("labels the agenda with the span it lists", async () => {
        const user = userEvent.setup();
        render(App);
        await user.click(button("Agenda"));
        expect(range()).toBe(agendaRangeLabel(today()));
    });

    it("ends the agenda on its last loaded day, saying so", async () => {
        put({
            title: "Crossing",
            start: isoAt(ymd(addDays(lastDay, -1)), 9),
            end: isoAt(ymd(addDays(lastDay, 2)), 17),
        });
        const user = userEvent.setup();
        render(App);
        await user.click(button("Agenda"));
        const rows = await screen.findAllByRole("button", { name: /Crossing/ });
        expect(rows).toHaveLength(2);
        const labels = [...document.querySelectorAll(".agenda .glabel")].map((g) => g.textContent);
        expect(labels[labels.length - 1]).toBe(dayGroupLabel(lastDay));
        expect(screen.getByRole("note", { name: "Agenda edge" }).textContent!.trim()).toBe(
            `Nothing before ${dayGroupLabel(parseYmd(from))} or after ` +
                `${dayGroupLabel(lastDay)} is listed: move the week with ‹ and ›.`,
        );
    });

    it("says when the loaded window holds more events than one read brings", async () => {
        // a day of last month: inside the window, outside the week view
        const day = ymd(new Date(today().getFullYear(), today().getMonth() - 1, 10));
        for (let i = 0; i < 1000; i++)
            put({ title: `E${i}`, start: isoAt(day, 9), end: isoAt(day, 10) });
        render(App);
        await waitFor(() =>
            expect(notice()?.textContent?.trim()).toBe(
                "Showing the first 1000 events of the shown months; some are left out.",
            ),
        );
    });

    it("says nothing below the limit", async () => {
        put({ title: "Solo" });
        render(App);
        await screen.findByRole("button", { name: /Solo/ });
        expect(notice()).toBeNull();
    });

    it("has no title bar, fake window controls or sync status", async () => {
        put({ title: "Solo" });
        render(App);
        await screen.findByRole("button", { name: /Solo/ });
        expect(document.querySelector(".lights")).toBeNull();
        expect(screen.queryByText(/Synced/)).toBeNull();
        expect(document.querySelector(".titlebar")).toBeNull();
        expect(screen.queryByText("Sobamail — Calendar")).toBeNull();
    });
});

describe("realtime updates", () => {
    // the browser's EventSource on /api/v2/event, which jsdom lacks; announce() is what
    // the runtime does on a mutation: one event named after its object key
    class FakeEventSource extends EventTarget {
        static last: FakeEventSource | null = null;
        constructor(readonly url: string) {
            super();
            FakeEventSource.last = this;
        }
        close() {}
    }
    const announce = (key: string) =>
        FakeEventSource.last!.dispatchEvent(
            new MessageEvent(key, { data: JSON.stringify({ db: "main", replica: "{r}" }) }),
        );
    const NS = "{https://sobamail.com/module/calendar/v1}";

    beforeEach(() => vi.stubGlobal("EventSource", FakeEventSource));
    afterEach(() => {
        vi.unstubAllGlobals();
        FakeEventSource.last = null;
    });

    it("listens on the app event stream", () => {
        render(App);
        expect(FakeEventSource.last?.url).toBe("/api/v2/event");
    });

    it("shows an event written elsewhere once the stream announces it", async () => {
        render(App);
        await waitFor(() => expect(backend.fetch).toHaveBeenCalled());
        put({ title: "From the phone" });
        await new Promise((r) => setTimeout(r, 100));
        expect(screen.queryByRole("button", { name: /From the phone/ })).toBeNull();

        announce(`${NS}AddEvent`);
        await screen.findByRole("button", { name: /From the phone/ });
    });

    it("drops an event deleted elsewhere, closing its popover", async () => {
        const uuid = put({ title: "Standup" });
        const user = userEvent.setup();
        render(App);
        await openEvent(user, "Standup");
        backend.soba.run(new DeleteEvent({ uuid }));

        announce("{https://sobamail.com/module/base/v1}DeleteRow");
        await waitFor(() => expect(screen.queryByRole("button", { name: /Standup/ })).toBeNull());
        expect(screen.queryByRole("dialog", { name: "Standup" })).toBeNull();
    });

    it("shows a calendar added elsewhere", async () => {
        render(App);
        await waitFor(() => expect(backend.fetch).toHaveBeenCalled());
        putCal("Shared work");

        announce(`${NS}AddCalendar`);
        await screen.findByText("Shared work");
    });

    it("rereads a burst of announcements once", async () => {
        render(App);
        await waitFor(() => expect(backend.fetch).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 100));
        backend.fetch.mockClear();

        for (const name of ["AddEvent", "SetEventAttr", "AddEventAttr", "AddEventAttrValue"])
            announce(`${NS}${name}`);
        await waitFor(() => expect(backend.fetch).toHaveBeenCalledTimes(1));
        await new Promise((r) => setTimeout(r, 100));
        expect(backend.fetch).toHaveBeenCalledTimes(1);
    });
});
