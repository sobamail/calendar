// The test harness itself: the stand-in runtime keeps the runtime's rules that the
// module relies on, and the fetch stub answers model.ts in compact SMC.

import { decode, encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it } from "vitest";
import { Event, namespace } from "$module/calendar/v1";
import { put_event, read_events } from "$lib/model";
import { install_fake_soba, type FakeSoba } from "./soba";
import { install_backend } from "./backend";

type Data = {
    insert(table: string, object: object): { hash: unknown };
    find(table: string, key: object): { hash: unknown; deleted: boolean };
    delete(table: string, hash: unknown): void;
};
const data = () => (globalThis as unknown as { soba: { data: Data } }).soba.data;
const respond = (object: object) =>
    (globalThis as unknown as { soba: { task: { respond(o: object): void } } }).soba.task.respond(
        object,
    );
type Exec = (query: string, ...params: unknown[]) => { data: unknown[][] };
const exec: Exec = (query, ...params) =>
    (globalThis as unknown as { soba: { db: { exec: Exec } } }).soba.db.exec(query, ...params);

const EVENT = "{00000000-0000-4000-8000-0000000000aa}";

describe("stand-in runtime", () => {
    let soba: FakeSoba;
    beforeEach(async () => {
        soba = await install_fake_soba();
    });

    it("replaces a row on its lww key and ignores the same content", () => {
        data().insert("event", { uuid: EVENT });
        data().insert("event_attr_single", { event: EVENT, key: "title", value: "a" });
        data().insert("event_attr_single", { event: EVENT, key: "title", value: "b" });
        data().insert("event_attr_single", { event: EVENT, key: "title", value: "b" });
        expect(soba.sql("SELECT value FROM event_attr_single")).toEqual([["b"]]);
    });

    it("finds only by the full lww key, and throws on a miss", () => {
        data().insert("event", { uuid: EVENT });
        data().insert("event_attr_multi", { event: EVENT, key: "attendees" });
        expect(() => data().find("event_attr_multi", { event: EVENT })).toThrow(/needs exactly/);
        expect(() => data().find("event_attr_multi_value", { event: EVENT })).toThrow();
        expect(() => data().find("event", { uuid: "{nope}" })).toThrow(/no event row/);
        expect(data().find("event_attr_multi", { key: "attendees", event: EVENT }).deleted).toBe(
            false,
        );
    });

    it("cascades an event delete to its attrs and list values", () => {
        data().insert("event", { uuid: EVENT });
        data().insert("event_attr_single", { event: EVENT, key: "title", value: "a" });
        data().insert("event_attr_multi", { event: EVENT, key: "attendees" });
        data().insert("event_attr_multi_value", { event: EVENT, key: "attendees", value: "x" });
        data().delete("event", data().find("event", { uuid: EVENT }).hash);
        for (const table of [
            "event_attr_single",
            "event_attr_multi",
            "event_attr_multi_value",
        ]) {
            expect(soba.sql(`SELECT count(*) FROM ${table}`)).toEqual([[0]]);
        }
    });

    it("refuses a list value without its container", () => {
        data().insert("event", { uuid: EVENT });
        expect(() =>
            data().insert("event_attr_multi_value", { event: EVENT, key: "attendees", value: "x" }),
        ).toThrow(/FOREIGN KEY/);
    });

    it("reads the pass's start in soba.db.exec: a write shows to the next pass only", () => {
        const events = () => exec("SELECT count(*) FROM event").data[0][0];
        let seen: unknown;
        soba.run({
            process() {
                data().insert("event", { uuid: EVENT });
                seen = events();
            },
        });
        expect(seen).toBe(0);
        soba.run({
            process() {
                seen = events();
            },
        });
        expect(seen).toBe(1);
    });

    it("throws on a boolean in a row or a response, which must never be persisted", () => {
        data().insert("event", { uuid: EVENT });
        expect(() =>
            data().insert("event_attr_single", { event: EVENT, key: "allDay", value: true }),
        ).toThrow("Boolean types are not supported");
        expect(() => respond({ data: [{ uuid: EVENT, primary: false }] })).toThrow(
            "Boolean types are not supported",
        );
        expect(() => respond({ data: [{ uuid: EVENT, primary: 0 }] })).not.toThrow();
    });

    it("keeps foreign keys on after a pass", () => {
        soba.run({ process() {} });
        data().insert("event", { uuid: EVENT });
        expect(() =>
            data().insert("event_attr_multi_value", { event: EVENT, key: "attendees", value: "x" }),
        ).toThrow(/FOREIGN KEY/);
    });
});

describe("fetch stub", () => {
    it("serves model.ts from the module on the stand-in", async () => {
        const { fetch } = await install_backend();
        const put = await put_event(
            new Event({
                title: "Standup",
                start: "2026-10-15T09:00",
                end: "2026-10-15T09:15",
                attendees: ["a@example.com"],
            }),
        );
        expect(put?.uuid).toMatch(/^\{00000000-/);

        const window = await read_events("2026-10-01", "2026-11-01", "", 100, 0);
        expect(window).toMatchObject([
            { uuid: put!.uuid, title: "Standup", attendees: ["a@example.com"] },
        ]);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("refuses a request carrying a boolean", async () => {
        await install_backend();
        await expect(
            fetch("/api/v2/object", {
                method: "POST",
                body: encode({ namespace, name: "GetEvents", content: { filter: true } }) as never,
            }),
        ).rejects.toThrow("Boolean types are not supported");
    });

    it("answers a request that throws with the error key", async () => {
        await install_backend();
        const resp = await fetch("/api/v2/object", {
            method: "POST",
            body: encode({ namespace, name: "GetEvent", content: { uuid: "{nope}" } }) as never,
        });
        const reply = decode(new Uint8Array(await resp.arrayBuffer())) as Record<string, unknown>;
        expect(reply[2]).toBe("No event {nope}");
        expect(reply[3]).toBeUndefined();
    });
});
