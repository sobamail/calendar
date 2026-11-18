// Copied from soba-chat's ui/src/model/contacts.svelte.ts.
import {type CrossAnswer, type CrossTransport, type Smc} from "./cross";

// The contacts app's people query, sent across to it as a cross request
export const NS_CONTACTS = "https://sobamail.com/module/contacts/v1";
export const GET_PEOPLE = `{${NS_CONTACTS}}GetPeople`;

// how many people one query asks for; each brings every address of theirs
const PEOPLE_LIMIT = 8;

// how long a query waits for its end of stream: an answer pushed while the stream was down
// is lost, and nothing else would end the wait
const ANSWER_MSEC = 5000;

// The host runs an instance's cross requests one at a time and keeps five waiting; one more
// is refused with 429 and dropped, and so is every request after it until one of the
// instance's requests ends, its end of stream pushed. A refused request is sent again on the
// next end of stream (or after ANSWER_MSEC, should that one be lost), and given up after
// MAX_TRIES sends.
const MAX_TRIES = 4;

// one address to suggest, with the name of the person it belongs to ("" when the card has none)
export type Contact = {
    name: string,
    email: string,
};

// unknown: not asked yet, or asking failed and may be tried again; asking: the host's banner
// is up; granted: allowed, for the page's life; denied: the user said no, which holds until
// the page is loaded again; absent: the mailbox has no contacts app
export type Access = "unknown"|"asking"|"granted"|"denied"|"absent";

type Pending = {
    found: Contact[],
    resolve: (found: Contact[]|null) => void,
};

// a lookup's request, waiting for the host to be free of ours
type Request = {
    id: string,
    object: Smc,
    tries: number,
};

// a person as the contacts module's load_people() gives it, of which we read the name and
// the addresses
type Person = {
    firstName?: unknown,
    lastName?: unknown,
    emails?: unknown,
};

function text(v: unknown): string { return typeof v == "string" ? v.trim() : ""; }

// the addresses of the people in a GetPeopleResponse, or none for anything else (an error,
// another app's answer)
export function contactsOf(object: CrossAnswer["object"]): Contact[] {
    if (! object || object.error != null || object.namespace != NS_CONTACTS
        || object.name != "GetPeopleResponse") {
        return [];
    }
    const data = (object.content as {data?: unknown} | null)?.data;
    if (! Array.isArray(data)) {
        return [];
    }
    const out: Contact[] = [];
    for (const p of data as Person[]) {
        if (! p || typeof p != "object" || ! Array.isArray(p.emails)) {
            continue;
        }
        const name = [ text(p.firstName), text(p.lastName) ].filter((s) => s).join(" ");
        for (const e of p.emails) {
            const email = text(e).toLowerCase();
            if (email) {
                out.push({name, email});
            }
        }
    }
    return out;
}

// The people of the mailbox's contacts app, looked up by what was typed. The page asks
// the user for the grant the first time a lookup is made, and remembers the answer; one
// lookup is live at a time, a newer one drops the answers of the one before.
//
// The host keeps one request of ours at a time: a dropped lookup's request still runs there,
// so the next one waits for its end of stream (or ANSWER_MSEC) and is then the newest lookup
// alone. After a 429 the host is full: nothing is sent until an end of stream comes, of any
// request of the instance, another page's too.
export class ContactDirectory {
    access = $state<Access>("unknown");

    private granting: Promise<boolean>|null = null;
    private pending = new Map<string, Pending>();
    // the lookups made, the newest one's number; an older one answers null
    private seq = 0;
    private readonly prefix = Math.random().toString(36).slice(2, 10);

    // the id of our request the host holds (answered 202, its end of stream not in yet), and
    // the timer that frees the slot should that end of stream never come
    private busy: string|null = null;
    private busyTimer: ReturnType<typeof setTimeout>|undefined;
    // the newest lookup's request, waiting for the slot
    private next: Request|null = null;
    // the host refused with 429: it takes nothing until an end of stream comes, or the timer
    // gives up waiting for one
    private full = false;
    private fullTimer: ReturnType<typeof setTimeout>|undefined;

    constructor(private transport: CrossTransport) {}

    // whether looking up is worth offering: not denied, and there is an app to ask
    get available(): boolean { return this.access != "denied" && this.access != "absent"; }

    // the contacts matching `query`, every handler instance's merged, each address once; null
    // when a newer lookup took over or the grant is not there; none when the host failed it
    async find(query: string): Promise<Contact[]|null> {
        const seq = ++this.seq;
        const filter = query.trim();
        this.drop();
        if (! filter) {
            return [];
        }
        if (! await this.grant() || seq != this.seq) {
            return null;
        }

        const id = `${this.prefix}-${seq}`;
        const object: Smc = {
            namespace : NS_CONTACTS,
            name : "GetPeople",
            content : {filter, limit : PEOPLE_LIMIT, offset : 0},
        };
        const found = new Promise<Contact[]|null>(
                (resolve) => { this.pending.set(id, {found : [], resolve}); });
        this.next = {id, object, tries : 0};
        void this.pump();
        return found;
    }

    // one CrossResponse event's content, from the event stream
    receive(answer: CrossAnswer) {
        if (! answer) {
            return;
        }
        if (answer.eos) {
            // a request of the instance ended: the host has room again
            this.unfull();
            if (answer.id == this.busy) {
                this.release();
            }
        }
        const p = this.pending.get(answer.id);
        if (! p) {
            return;
        }
        if (answer.eos) {
            this.finish(answer.id);
            return;
        }
        for (const c of contactsOf(answer.object)) {
            if (! p.found.some((f) => f.email == c.email)) {
                p.found.push(c);
            }
        }
    }

    // asks once; a lookup made while the banner is up waits for the same answer
    private grant(): Promise<boolean> {
        if (this.access == "granted") {
            return Promise.resolve(true);
        }
        if (! this.available) {
            return Promise.resolve(false);
        }
        this.granting ??= this.ask().finally(() => { this.granting = null; });
        return this.granting;
    }

    private async ask(): Promise<boolean> {
        this.access = "asking";
        let status = 0;
        try {
            status = await this.transport.grant(GET_PEOPLE);
        }
        catch (e) {
            console.error("GrantRequest failed:", e);
        }
        this.access = status == 200 ? "granted"
                : status == 401     ? "denied"
                : status == 404     ? "absent"
                                    : "unknown";
        return status == 200;
    }

    // sends the waiting request once the host holds none of ours
    private async pump() {
        const req = this.next;
        if (this.busy !== null || this.full || ! req) {
            return;
        }
        this.next = null;
        if (! this.pending.has(req.id)) {
            // a newer lookup took over while it waited
            return;
        }
        req.tries += 1;
        this.busy = req.id;
        // an end of stream pushed while the stream was down is lost: the slot frees itself,
        // and the lookup ends with what came
        this.busyTimer = setTimeout(() => {
            this.finish(req.id);
            this.release();
        }, ANSWER_MSEC);

        let status = 0;
        try {
            status = await this.transport.send(req.id, req.object);
        }
        catch (e) {
            console.error("CrossRequest failed:", e);
        }
        if (status == 202) {
            return;
        }
        const retry = status == 429 && req.tries < MAX_TRIES;
        if (status == 429) {
            // full before the slot frees, so that nothing waiting goes out into a full host
            this.full = true;
            clearTimeout(this.fullTimer);
            this.fullTimer = setTimeout(() => this.unfull(), ANSWER_MSEC);
        }
        // the host keeps no refused request: no end of stream comes for it
        if (this.busy == req.id) {
            this.release();
        }
        if (retry) {
            // it waits for room, unless a newer lookup is waiting already
            this.next ??= req;
            return;
        }
        if (status == 401) {
            // the grant is gone: ask again on the next lookup
            this.access = "unknown";
            this.finish(req.id, null);
            return;
        }
        this.finish(req.id, []);
    }

    // the host has room again: the waiting request goes
    private unfull() {
        if (! this.full) {
            return;
        }
        clearTimeout(this.fullTimer);
        this.fullTimer = undefined;
        this.full = false;
        void this.pump();
    }

    // the host is done with our request: the waiting one goes
    private release() {
        clearTimeout(this.busyTimer);
        this.busyTimer = undefined;
        this.busy = null;
        void this.pump();
    }

    private finish(id: string, found?: Contact[]|null) {
        const p = this.pending.get(id);
        if (! p) {
            return;
        }
        this.pending.delete(id);
        p.resolve(found === undefined ? p.found : found);
    }

    // the lookups in flight are given up: their answers are no longer wanted
    private drop() {
        for (const id of [...this.pending.keys()]) {
            this.finish(id, null);
        }
    }
}
