import {
    Calendar,
    DeleteCalendarResponse,
    Event,
    GetCalendarsResponse,
    GetEventsResponse,
    PutEventResponse,
} from "$module/calendar/v1";
import type {
    Account,
    CalendarData,
    EventData,
    PutCalendarResponse,
    SendInviteResponse,
} from "$module/calendar/v1";
import * as msgpack from "@msgpack/msgpack";

const NAMESPACE = "https://sobamail.com/module/calendar/v1";

// Compact SMC reply: 0 namespace, 1 name, 2 error, 3 content.
type Response<T> = {
    "0": string,
    "1": string,
    "2"?: unknown,
    "3": T,
};

// msgpack.encode returns Uint8Array<ArrayBufferLike>; TS 5.7+ pinned the DOM's
// BodyInit to ArrayBuffer-backed views. The bytes are a valid fetch body at
// runtime, so we assert the type at this single boundary.
const mpBody = (o: unknown): BodyInit => msgpack.encode(o) as unknown as BodyInit;

/** Decode a reply; a response carrying an error throws instead of returning. */
function decode<T>(arrbuf: ArrayBuffer): Response<T> {
    const obj = msgpack.decode(new Uint8Array(arrbuf)) as Response<T>;
    const error = obj[2];
    if (error !== undefined && error !== null) {
        throw new Error(typeof error === "string" ? error : JSON.stringify(error));
    }
    return obj;
}

export async function read_events(
        from: string, to: string, filter: string, limit: number,
        offset: number): Promise<Event[]> {
    const resp = await fetch("/api/v2/object", {
        method : "POST",
        headers : {
            "Content-Type" : "application/msgpack",
        },
        body : mpBody({
            namespace : NAMESPACE,
            name : "GetEvents",
            content : {from, to, filter, limit, offset},
        }),
    });

    if (! resp.ok) {
        throw new Error(resp.statusText + " (" + resp.status + ")");
    }

    const arrbuf = await resp.arrayBuffer();
    if (arrbuf.byteLength === 0) {
        return [];
    }

    const obj = decode<GetEventsResponse>(arrbuf);

    return obj[3].data.map((o: Event) => new Event(o));
}

export async function put_event(event: EventData): Promise<PutEventResponse|undefined> {
    const resp = await fetch("/api/v2/object", {
        method : "POST",
        headers : {
            "Content-Type" : "application/msgpack",
        },
        body : mpBody({
            namespace : NAMESPACE,
            name : "PutEvent",
            content : event,
        }),
    });

    if (! resp.ok) {
        throw new Error(resp.statusText + "(" + resp.status + ")");
    }

    const arrbuf = await resp.arrayBuffer();
    if (arrbuf.byteLength === 0) {
        console.error("empty response");
        return;
    }

    const obj = decode<PutEventResponse>(arrbuf);

    return new PutEventResponse({uuid : obj[3].uuid});
}

export async function delete_event(uuid: string): Promise<boolean> {
    const resp = await fetch("/api/v2/object", {
        method : "POST",
        headers : {
            "Content-Type" : "application/msgpack",
        },
        body : mpBody({
            namespace : NAMESPACE,
            name : "DeleteEvent",
            content : {uuid},
        }),
    });

    if (! resp.ok) {
        throw new Error(resp.statusText + " (" + resp.status + ")");
    }

    // DeleteEvent responds with nothing on success; a non-empty body can only be an error
    const arrbuf = await resp.arrayBuffer();
    if (arrbuf.byteLength > 0) {
        decode<unknown>(arrbuf);
    }
    return true;
}

/** Send one request and return its response's content; every calendar request responds. */
async function request<T>(name: string, content: unknown): Promise<T> {
    const resp = await fetch("/api/v2/object", {
        method : "POST",
        headers : {
            "Content-Type" : "application/msgpack",
        },
        body : mpBody({namespace : NAMESPACE, name, content}),
    });

    if (! resp.ok) {
        throw new Error(resp.statusText + " (" + resp.status + ")");
    }

    const arrbuf = await resp.arrayBuffer();
    if (arrbuf.byteLength === 0) {
        throw new Error(`${name} responded nothing`);
    }
    return decode<T>(arrbuf)[3];
}

/** Every calendar: the primary one first (the backend creates it on first read), then by name. */
export async function read_calendars(): Promise<Calendar[]> {
    const resp = await request<GetCalendarsResponse>("GetCalendars", {});
    return resp.data.map((o) => new Calendar(o));
}

/** Create (no uuid) or update a calendar; returns its uuid. */
export async function put_calendar(calendar: Partial<CalendarData>): Promise<string> {
    return (await request<PutCalendarResponse>("PutCalendar", calendar)).uuid;
}

/** The account's address, the organizer of the invitations it sends. */
export async function read_account(): Promise<string> {
    return (await request<Account>("GetAccount", {})).address;
}

/** Mail `ics` (an invitation, METHOD:REQUEST) to `to`; returns the addresses it went to. */
export async function send_invite(
        invite: {uuid: string, to: string[], ics: string, subject: string, text: string}):
        Promise<string[]> {
    return (await request<SendInviteResponse>("SendInvite", invite)).to;
}

/** Delete a calendar; refused (`deleted` 0) for the primary one and while `events` events use it. */
export async function delete_calendar(uuid: string): Promise<DeleteCalendarResponse> {
    return new DeleteCalendarResponse(await request<DeleteCalendarResponse>("DeleteCalendar", {uuid}));
}
