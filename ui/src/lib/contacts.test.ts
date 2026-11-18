// The contacts lookup on a scripted host; ported from soba-chat's
// ui/src/model/contacts.test.ts, as contacts.svelte.ts is.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContactDirectory, contactsOf, GET_PEOPLE, NS_CONTACTS } from "./contacts.svelte";
import type { CrossAnswer, CrossTransport, Smc } from "./cross";

// a GetPeopleResponse of these people, as one handler instance answers
function answer(id: string, people: object[], instanceId = "I1"): CrossAnswer {
    return {
        id,
        appId: "contacts.app.sobamail.com",
        instanceId,
        object: { namespace: NS_CONTACTS, name: "GetPeopleResponse", content: { data: people } },
    };
}

const ANA = { firstName: "Ana", lastName: "Reyes", emails: ["a.reyes@x.com", "ANA@home.org"] };
const BO = { firstName: "Bo", lastName: "", emails: ["bo@x.com"] };

// the host, played by the test: what the grant answers, and the requests sent
class Host implements CrossTransport {
    grantStatus = 200;
    sendStatus = 202;
    grants: string[] = [];
    sent: { id: string; object: Smc }[] = [];
    // holds the grant's answer until the test lets it go, as the banner holds it for the user
    hold: Promise<void> | null = null;

    async grant(objectKey: string): Promise<number> {
        this.grants.push(objectKey);
        await this.hold;
        return this.grantStatus;
    }

    // holds a CrossRequest's reply until the test lets it go, as a slow host would
    sendHold: Promise<void> | null = null;

    async send(id: string, object: Smc): Promise<number> {
        this.sent.push({ id, object });
        const status = this.sendStatus;
        await this.sendHold;
        return status;
    }

    get last() {
        return this.sent[this.sent.length - 1];
    }
}

describe("ContactDirectory", () => {
    let host: Host;
    let dir: ContactDirectory;

    beforeEach(() => {
        vi.useFakeTimers();
        host = new Host();
        dir = new ContactDirectory(host);
    });

    afterEach(() => vi.useRealTimers());

    // lets the posts go out
    const flush = () => vi.advanceTimersByTimeAsync(0);

    it("asks for GetPeople once, then sends it with the filter", async () => {
        const found = dir.find(" ana ");
        await flush();
        expect(host.grants).toEqual([GET_PEOPLE]);
        expect(dir.access).toBe("granted");
        expect(host.last.object).toEqual({
            namespace: NS_CONTACTS,
            name: "GetPeople",
            content: { filter: "ana", limit: 8, offset: 0 },
        });

        dir.receive(answer(host.last.id, [ANA]));
        dir.receive({ id: host.last.id, eos: true });
        expect(await found).toEqual([
            { name: "Ana Reyes", email: "a.reyes@x.com" },
            { name: "Ana Reyes", email: "ana@home.org" },
        ]);

        const again = dir.find("bo");
        await flush();
        expect(host.grants).toHaveLength(1);
        dir.receive({ id: host.last.id, eos: true });
        expect(await again).toEqual([]);
    });

    it("merges every instance's answer, each address once, until the end of the stream", async () => {
        const found = dir.find("x");
        await flush();
        const id = host.last.id;
        dir.receive(answer(id, [ANA], "I1"));
        dir.receive(answer(id, [ANA, BO], "I2"));
        dir.receive({ id, eos: true });
        expect((await found)?.map((c) => c.email)).toEqual(["a.reyes@x.com", "ana@home.org", "bo@x.com"]);
    });

    it("drops the answers of a lookup a newer one took over", async () => {
        const first = dir.find("a");
        await flush();
        const old = host.last.id;
        const second = dir.find("an");
        await flush();
        expect(await first).toBeNull();

        // the host still runs the old one; the new one goes out after its end of stream
        dir.receive(answer(old, [BO]));
        dir.receive({ id: old, eos: true });
        await flush();
        expect(host.last.id).not.toBe(old);
        dir.receive(answer(host.last.id, [ANA]));
        dir.receive({ id: host.last.id, eos: true });
        expect((await second)?.map((c) => c.email)).toEqual(["a.reyes@x.com", "ana@home.org"]);
    });

    // The host runs an instance's requests one at a time and keeps five waiting; one more is
    // refused with 429 and dropped, and so is every one after it until a request of the
    // instance ends (amp-mgui doc/pub/ref/cross-requests.md).
    const filters = () => host.sent.map((s) => (s.object.content as { filter: string }).filter);

    it("keeps one request at the host, and sends only the newest of those typed meanwhile", async () => {
        const first = dir.find("a");
        await flush();
        dir.find("an");
        const third = dir.find("ana");
        await flush();
        expect(filters()).toEqual(["a"]);
        expect(await first).toBeNull();

        dir.receive({ id: host.sent[0].id, eos: true });
        await flush();
        expect(filters()).toEqual(["a", "ana"]);
        dir.receive(answer(host.last.id, [ANA]));
        dir.receive({ id: host.last.id, eos: true });
        expect((await third)?.map((c) => c.email)).toEqual(["a.reyes@x.com", "ana@home.org"]);
    });

    it("frees the host's slot when an end of stream never comes", async () => {
        dir.find("a");
        await flush();
        const second = dir.find("b");
        await flush();
        expect(filters()).toEqual(["a"]);

        await vi.advanceTimersByTimeAsync(5000);
        expect(filters()).toEqual(["a", "b"]);
        dir.receive({ id: host.last.id, eos: true });
        expect(await second).toEqual([]);
    });

    it("sends a lookup the host refused with 429 again once an end of stream comes", async () => {
        host.sendStatus = 429;
        const found = dir.find("bo");
        await flush();
        host.sendStatus = 202;
        await vi.advanceTimersByTimeAsync(2000);
        expect(filters()).toEqual(["bo"]);

        // another page's request of the instance ended
        dir.receive({ id: "other-page-7", eos: true });
        await flush();
        expect(filters()).toEqual(["bo", "bo"]);
        dir.receive(answer(host.last.id, [BO]));
        dir.receive({ id: host.last.id, eos: true });
        expect(await found).toEqual([{ name: "Bo", email: "bo@x.com" }]);
        expect(dir.access).toBe("granted");
    });

    it("tries a lookup refused with 429 again after a while when no end of stream comes", async () => {
        host.sendStatus = 429;
        dir.find("bo");
        await flush();
        host.sendStatus = 202;
        await vi.advanceTimersByTimeAsync(4900);
        expect(filters()).toEqual(["bo"]);
        await vi.advanceTimersByTimeAsync(100);
        expect(filters()).toEqual(["bo", "bo"]);
    });

    it("gives a lookup refused with 429 up after a few tries, with nothing found", async () => {
        host.sendStatus = 429;
        const found = dir.find("bo");
        for (let i = 0; i < 10; i++) {
            await flush();
            dir.receive({ id: `other-page-${i}`, eos: true });
        }
        expect(await found).toEqual([]);
        expect(host.sent).toHaveLength(4);
    });

    it("holds a lookup typed while the refused request was on its way", async () => {
        let reply!: () => void;
        host.sendHold = new Promise((r) => (reply = r));
        host.sendStatus = 429;
        dir.find("a");
        await flush();
        host.sendHold = null;
        host.sendStatus = 202;
        dir.find("ab");
        await flush();
        expect(filters()).toEqual(["a"]);

        reply();
        await flush();
        expect(filters()).toEqual(["a"]);
        dir.receive({ id: "other-page-1", eos: true });
        await flush();
        expect(filters()).toEqual(["a", "ab"]);
    });

    it("sends nothing while the host is full, then the newest lookup alone", async () => {
        host.sendStatus = 429;
        const first = dir.find("a");
        await flush();
        host.sendStatus = 202;
        dir.find("ab");
        const third = dir.find("abc");
        await flush();
        expect(await first).toBeNull();
        expect(filters()).toEqual(["a"]);

        dir.receive({ id: "other-page-1", eos: true });
        await flush();
        expect(filters()).toEqual(["a", "abc"]);
        dir.receive({ id: host.last.id, eos: true });
        expect(await third).toEqual([]);
    });

    it("finds nothing for a lookup the host failed", async () => {
        host.sendStatus = 500;
        expect(await dir.find("a")).toEqual([]);
        expect(dir.access).toBe("granted");
    });

    it("asks once for every lookup made while the banner is up, and sends only the newest", async () => {
        let allow!: () => void;
        host.hold = new Promise((r) => (allow = r));
        const first = dir.find("a");
        const second = dir.find("an");
        await flush();
        expect(dir.access).toBe("asking");
        expect(host.grants).toHaveLength(1);

        allow();
        await flush();
        expect(await first).toBeNull();
        expect(host.sent.map((s) => (s.object.content as { filter: string }).filter)).toEqual(["an"]);
        dir.receive({ id: host.last.id, eos: true });
        expect(await second).toEqual([]);
    });

    it("takes a denial for the page's life and asks no more", async () => {
        host.grantStatus = 401;
        expect(await dir.find("a")).toBeNull();
        expect(dir.access).toBe("denied");
        expect(dir.available).toBe(false);
        expect(await dir.find("b")).toBeNull();
        expect(host.grants).toHaveLength(1);
        expect(host.sent).toHaveLength(0);
    });

    it("offers nothing when the mailbox has no contacts app", async () => {
        host.grantStatus = 404;
        expect(await dir.find("a")).toBeNull();
        expect(dir.access).toBe("absent");
        expect(dir.available).toBe(false);
    });

    it("asks again after a failed grant, and after a request the host found no grant for", async () => {
        host.grantStatus = 500;
        expect(await dir.find("a")).toBeNull();
        expect(dir.access).toBe("unknown");

        host.grantStatus = 200;
        host.sendStatus = 401;
        expect(await dir.find("a")).toBeNull();
        expect(dir.access).toBe("unknown");
        expect(host.grants).toHaveLength(2);

        host.sendStatus = 202;
        const found = dir.find("a");
        await flush();
        expect(host.grants).toHaveLength(3);
        dir.receive({ id: host.last.id, eos: true });
        expect(await found).toEqual([]);
    });

    it("ends a lookup whose end of stream never comes with what it has", async () => {
        const found = dir.find("a");
        await flush();
        dir.receive(answer(host.last.id, [BO]));
        await vi.advanceTimersByTimeAsync(5000);
        expect(await found).toEqual([{ name: "Bo", email: "bo@x.com" }]);
    });

    it("looks nothing up for an empty query", async () => {
        expect(await dir.find("  ")).toEqual([]);
        expect(host.grants).toHaveLength(0);
    });
});

describe("contactsOf", () => {
    it("reads a GetPeopleResponse alone", () => {
        expect(contactsOf(answer("1", [BO]).object)).toEqual([{ name: "Bo", email: "bo@x.com" }]);
        expect(
            contactsOf({ namespace: NS_CONTACTS, name: "StructuredError", content: {}, error: "x" }),
        ).toEqual([]);
        expect(
            contactsOf({ namespace: "https://example.com/v1", name: "GetPeopleResponse", content: { data: [BO] } }),
        ).toEqual([]);
        expect(contactsOf(undefined)).toEqual([]);
    });

    it("skips people without addresses and blank addresses", () => {
        const people = [{ firstName: "No", emails: [] }, { emails: ["", " c@x.com "] }, null];
        expect(contactsOf(answer("1", people as object[]).object)).toEqual([{ name: "", email: "c@x.com" }]);
    });
});
