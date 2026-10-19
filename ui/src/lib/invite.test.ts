// SendInvite: the backend mails the iCalendar invitation the UI wrote, from the
// account; GetAccount tells the UI that address, for the ORGANIZER line.

import { beforeEach, describe, expect, it } from "vitest";
import {
    Account,
    GetAccount,
    MalformedObject,
    SendInvite,
    SendInviteResponse,
} from "$module/calendar/v1";
import {
    ACCOUNT,
    MAIL,
    install_fake_soba,
    type FakeMessage as Message,
    type FakeSoba,
} from "../test/soba";

const UUID = "{00000000-0000-4000-8000-000000000001}";
const ICS = "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nSUMMARY:Gölbaşı\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

let soba: FakeSoba;
beforeEach(async () => {
    soba = await install_fake_soba();
});

const send = (content: ConstructorParameters<typeof SendInvite>[0]) => {
    const request = new SendInvite(content);
    return soba.run<SendInviteResponse>({ process: () => request.process(MAIL) });
};

describe("SendInvite", () => {
    it("mails the UI's invitation as a text/calendar attachment to every guest", () => {
        const response = send({
            uuid: UUID,
            to: ["a@example.com", " b@example.com ", ""],
            ics: ICS,
            subject: "Invitation: Gölbaşı",
            text: "You are invited.",
        });

        expect(response).toBeInstanceOf(SendInviteResponse);
        expect(response?.uuid).toBe(UUID);
        expect(response?.to).toEqual(["a@example.com", "b@example.com"]);
        expect(soba.sent).toHaveLength(1);
        const m = soba.sent[0] as Message;
        expect(m.uuid).toBe("{generated}");
        expect(m.from).toEqual([{ address: ACCOUNT }]);
        expect(m.to).toEqual([{ address: "a@example.com" }, { address: "b@example.com" }]);
        expect(m.subject).toBe("Invitation: Gölbaşı");
        expect(m.bodyText).toBe("You are invited.");

        expect(m.attachments).toHaveLength(1);
        const { name, type, blobs } = m.attachments[0].init;
        expect(name).toBe("invite.ics");
        expect(type).toBe("text/calendar; method=REQUEST");
        expect(blobs[0]).toBeInstanceOf(ArrayBuffer);
        expect(new TextDecoder().decode(blobs[0])).toBe(ICS);
    });

    it("fills in a subject and a text the UI left out", () => {
        send({ uuid: UUID, to: "a@example.com", ics: ICS });
        const m = soba.sent[0] as Message;
        expect(m.subject).toBe("Invitation");
        expect(m.bodyText).toBe("Attached: invite.ics");
    });

    it("refuses a request without a guest, an invitation or an event", () => {
        expect(() => new SendInvite({ uuid: UUID, to: [" "], ics: ICS })).toThrow(
            /^Missing SendInvite\.to$/,
        );
        expect(() => new SendInvite({ uuid: UUID, to: ["a@example.com"], ics: " " })).toThrow(
            /^Missing SendInvite\.ics$/,
        );
        expect(() => new SendInvite({ to: ["a@example.com"], ics: ICS })).toThrow(
            MalformedObject,
        );
        expect(soba.sent).toHaveLength(0);
    });
});

describe("GetAccount", () => {
    it("answers the account's address", () => {
        const response = soba.run<Account>(new GetAccount());
        expect(response).toBeInstanceOf(Account);
        expect(response?.address).toBe(ACCOUNT);
    });
});
