// Invitations in: read_invitations takes a delivered plain mail (the Mutator hands it
// over for metadata.type "message") and writes every VEVENT of a METHOD:REQUEST calendar
// in it as a tentative event, keyed by its UID. Delivery itself is UNVERIFIED (facts doc).

import { beforeEach, describe, expect, it } from "vitest";
import {
    Event,
    GetEvent,
    GetEvents,
    GetEventsResponse,
    PutCalendar,
    PutCalendarResponse,
    PutEvent,
    PutEventResponse,
    read_invitations,
} from "$module/calendar/v1";
import { ACCOUNT, ERRORS, PRIMARY, install_fake_soba, type FakeSoba } from "../test/soba";

const CRLF = String.fromCharCode(13, 10);

let soba: FakeSoba;
beforeEach(async () => {
    soba = await install_fake_soba();
});

const all = () => soba.run<GetEventsResponse>(new GetEvents({}))!.data;
const get = (uuid: string) => soba.run<Event>({ process: () => new GetEvent({ uuid }).process(ERRORS) })!;

const invite = (lines: string[], method = "REQUEST") =>
    ["BEGIN:VCALENDAR", "VERSION:2.0", `METHOD:${method}`, "BEGIN:VEVENT", ...lines, "END:VEVENT", "END:VCALENDAR", ""].join(
        CRLF,
    );

const PLANNING = [
    "UID:040000008200E00074C5B7101A82E008",
    "SUMMARY:Planning",
    "DTSTART:20261022T140000",
    "DTEND:20261022T153000",
    "LOCATION:Room 4",
    "DESCRIPTION:Quarterly planning.",
    "ORGANIZER;CN=Boss:mailto:boss@contoso.com",
    "ATTENDEE;RSVP=TRUE:mailto:me@example.com",
    "ATTENDEE:mailto:other@example.com",
    "URL:https://teams.microsoft.com/l/x",
    "SEQUENCE:0",
];

// a delivered mail as the base module's Message carries it
const mail = (init: { from?: string; ics?: string; type?: string; name?: string; bodyText?: string }) => ({
    from: [{ address: init.from ?? "boss@contoso.com" }],
    to: [{ address: ACCOUNT }],
    subject: "Invitation: Planning",
    bodyText: init.bodyText ?? "You are invited.",
    attachments:
        init.ics === undefined
            ? []
            : [
                  {
                      name: init.name ?? "invite.ics",
                      type: init.type ?? "text/calendar; method=REQUEST; charset=UTF-8",
                      blobs: [new TextEncoder().encode(init.ics).buffer],
                  },
              ],
});

describe("read_invitations", () => {
    it("writes a mailed invitation as a tentative event with its uid and organizer", () => {
        expect(read_invitations(mail({ ics: invite(PLANNING) }))).toBe(1);
        const events = all();
        expect(events).toHaveLength(1);
        expect(get(events[0].uuid)).toMatchObject({
            title: "Planning",
            cal: PRIMARY,
            start: "2026-10-22T14:00",
            end: "2026-10-22T15:30",
            allDay: 0,
            location: "Room 4",
            desc: "Quarterly planning.",
            callUrl: "https://teams.microsoft.com/l/x",
            attendees: ["me@example.com", "other@example.com"],
            uid: "040000008200E00074C5B7101A82E008",
            organizer: "boss@contoso.com",
            status: "tentative",
        });
    });

    describe("sent again", () => {
        const changed: Record<string, string> = {
            SUMMARY: "SUMMARY:Planning (moved)",
            DTSTART: "DTSTART:20261023T100000",
            DTEND: "DTEND:20261023T110000",
        };
        const moved = PLANNING.map((l) => changed[l.split(/[:;]/)[0]] ?? l);

        // the invitation, filed by the user under a calendar of their own; returns both uuids
        function filed() {
            read_invitations(mail({ ics: invite(PLANNING) }));
            const [first] = all();
            const cal = soba.run<PutCalendarResponse>(
                new PutCalendar({ name: "Work", color: "#4180ff" }),
            )!.uuid;
            soba.run(new PutEvent({ ...get(first.uuid), cal }));
            return { uuid: first.uuid, cal };
        }

        it("replaces the event of the same uid, keeping its calendar", () => {
            const { uuid, cal } = filed();
            expect(read_invitations(mail({ ics: invite(moved) }))).toBe(1);

            const events = all();
            expect(events).toHaveLength(1);
            expect(get(uuid)).toMatchObject({
                title: "Planning (moved)",
                cal,
                start: "2026-10-23T10:00",
                end: "2026-10-23T11:00",
                status: "tentative",
            });
        });

        it("moves it to the primary calendar when its calendar is gone", () => {
            const { uuid, cal } = filed();
            // as another replica's delete, concurrent with the filing, leaves it
            soba.sql("DELETE FROM calendar WHERE uuid = ?", cal);
            expect(read_invitations(mail({ ics: invite(moved) }))).toBe(1);
            expect(get(uuid)).toMatchObject({ title: "Planning (moved)", cal: PRIMARY });
        });
    });

    it("keeps a TZID'd invitation's times as written, in its zone", () => {
        const zoned = PLANNING.map((l) =>
            l.startsWith("DTSTART") ? "DTSTART;TZID=America/New_York:20261022T090000"
            : l.startsWith("DTEND") ? "DTEND;TZID=America/New_York:20261022T100000"
            : l,
        );
        read_invitations(mail({ ics: invite(zoned) }));
        expect(get(all()[0].uuid)).toMatchObject({
            start: "2026-10-22T09:00",
            end: "2026-10-22T10:00",
            tz: "America/New_York",
        });
    });

    it("ignores the account's own mail, such as the invitations it sent", () => {
        expect(read_invitations(mail({ from: ACCOUNT.toUpperCase(), ics: invite(PLANNING) }))).toBe(0);
        expect(all()).toEqual([]);
    });

    it("does nothing with a mail that carries no invitation", () => {
        expect(read_invitations(mail({}))).toBe(0);
        expect(read_invitations(mail({ ics: "hello", type: "text/plain", name: "notes.txt" }))).toBe(0);
        // a published calendar is not an invitation
        expect(read_invitations(mail({ ics: invite(PLANNING, "PUBLISH") }))).toBe(0);
        expect(all()).toEqual([]);
    });

    it("finds an invitation in the text body when nothing is attached", () => {
        expect(read_invitations(mail({ bodyText: invite(PLANNING) }))).toBe(1);
        expect(all().map((e) => e.title)).toEqual(["Planning"]);
    });

    it("titles an untitled invitation and skips one without a start", () => {
        const untitled = PLANNING.filter((l) => !l.startsWith("SUMMARY"));
        expect(read_invitations(mail({ ics: invite(untitled) }))).toBe(1);
        expect(all().map((e) => e.title)).toEqual(["Invitation"]);

        expect(read_invitations(mail({ ics: invite(["UID:nostart", "SUMMARY:x"]) }))).toBe(0);
    });
});

describe("PutEvent and the invitation attrs", () => {
    it("keeps uid, organizer and status when the UI saves without them", () => {
        read_invitations(mail({ ics: invite(PLANNING) }));
        const [ev] = all();
        const { uid, organizer, status, ...edited } = get(ev.uuid);
        soba.run<PutEventResponse>(new PutEvent({ ...edited, title: "Renamed" }));
        expect(get(ev.uuid)).toMatchObject({ title: "Renamed", uid, organizer, status });
    });

    it("reads an event stored without them as plain", () => {
        const uuid = soba.run<PutEventResponse>(
            new PutEvent({ title: "Mine", start: "2026-10-22T09:00", end: "2026-10-22T10:00" }),
        )!.uuid;
        expect(new Event(get(uuid))).toMatchObject({ uid: "", organizer: "", status: "" });
        expect(all()[0]).toMatchObject({ uid: "", organizer: "", status: "" });
    });
});
