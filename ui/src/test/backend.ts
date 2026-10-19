// The app's backend for component tests: fetch("/api/v2/object") is routed to the
// calendar module's request objects, which run on the stand-in runtime (soba.ts). So a
// component test drives the UI, model.ts and the module together; only the runtime and
// the host are stand-ins. Ported from soba-contacts' file of the same path.

import { decode, encode } from "@msgpack/msgpack";
import { vi } from "vitest";
import {
    DeleteCalendar,
    DeleteEvent,
    GetAccount,
    GetCalendars,
    GetEvent,
    GetEvents,
    PutCalendar,
    PutEvent,
    SendInvite,
    namespace,
} from "$module/calendar/v1";
import { ERRORS, MAIL, install_fake_soba, refuse_booleans, type FakeSoba } from "./soba";

// the requests the Mutator's handlers take from the UI
const REQUESTS: Record<string, new (content: never) => { process(given: never): void }> = {
    DeleteCalendar,
    DeleteEvent,
    GetAccount,
    GetCalendars,
    GetEvent,
    GetEvents,
    PutCalendar,
    PutEvent,
    SendInvite,
};
// what the Mutator hands in: each request takes the part it needs
const GIVEN = { ...ERRORS, ...MAIL } as never;

export type Backend = { soba: FakeSoba; fetch: ReturnType<typeof vi.fn> };

/** Installs the stand-in runtime and a fetch that serves /api/v2/object from it. */
export async function install_backend(): Promise<Backend> {
    const soba = await install_fake_soba();
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
        const request = decode(init.body as Uint8Array) as {
            name: string;
            content: never;
        };
        const Request = REQUESTS[request.name];
        if (!Request) return new Response(null, { status: 404 });

        // the request is persisted too
        refuse_booleans(request.content);
        const object = new Request(request.content);
        let response: object | undefined;
        try {
            response = soba.run<object>({ process: () => object.process(GIVEN) });
        } catch (e) {
            // assumed, not measured: the runtime answers a throwing request with key 2
            const body = encode({ 0: namespace, 1: request.name, 2: (e as Error).message });
            return new Response(body as unknown as BodyInit);
        }
        if (!response) return new Response(null);
        // the compact SMC the runtime answers with: 0 namespace, 1 name, 3 content
        const body = encode({ 0: namespace, 1: response.constructor.name, 3: { ...response } });
        return new Response(body as unknown as BodyInit);
    });
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    return { soba, fetch };
}
