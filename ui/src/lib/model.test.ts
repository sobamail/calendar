// model.ts against a stubbed fetch: the compact reply's error key throws, an
// empty body means "nothing".

import { encode } from "@msgpack/msgpack";
import { afterEach, describe, expect, it, vi } from "vitest";
import { delete_event, put_event, read_events } from "./model";
import { Event } from "$module/calendar/v1";

const NS = "https://sobamail.com/module/calendar/v1";

const reply = (body: BodyInit | null, status = 200) => {
    globalThis.fetch = vi.fn(async () => new Response(body, { status })) as never;
};
const smc = (o: object) => encode(o) as unknown as BodyInit;

afterEach(() => {
    vi.restoreAllMocks();
});

describe("model", () => {
    it("throws the error key of a reply", async () => {
        reply(smc({ 0: NS, 1: "GetEventsResponse", 2: "boom" }));
        await expect(read_events("a", "b", "", 1, 0)).rejects.toThrow("boom");
        reply(smc({ 0: NS, 1: "PutEventResponse", 2: { code: 7 } }));
        await expect(put_event(new Event())).rejects.toThrow('{"code":7}');
        reply(smc({ 0: NS, 1: "DeleteEvent", 2: "gone" }));
        await expect(delete_event("x")).rejects.toThrow("gone");
    });

    it("reads an empty body as nothing", async () => {
        reply(null);
        expect(await read_events("a", "b", "", 1, 0)).toEqual([]);
        reply(null);
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect(await put_event(new Event())).toBeUndefined();
        reply(null);
        expect(await delete_event("x")).toBe(true);
    });

    it("throws on an HTTP error", async () => {
        reply(null, 500);
        await expect(read_events("a", "b", "", 1, 0)).rejects.toThrow("(500)");
        reply(null, 404);
        await expect(delete_event("x")).rejects.toThrow("(404)");
    });

    it("decodes the content key into Events", async () => {
        reply(smc({ 0: NS, 1: "GetEventsResponse", 3: { data: [{ uuid: "u", title: "t" }] } }));
        const [e] = await read_events("a", "b", "", 1, 0);
        expect(e).toBeInstanceOf(Event);
        expect(e).toMatchObject({ uuid: "u", title: "t", cal: "", attendees: [] });
    });
});
