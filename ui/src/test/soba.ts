// A stand-in for the soba runtime, enough to run the calendar module's request
// handlers in tests. soba.db.exec runs on an in-memory SQLite (sql.js) holding
// the tables Mutator.mjs declares; soba.data.* emulate the runtime's lww
// replacement and fk cascades on them. Inside run(), soba.db.exec reads a copy taken
// when the pass began, like the runtime's (contacts facts): what the pass writes or
// deletes doesn't show to it. Like the runtime, it throws on a boolean in a row or a
// response: one must never be persisted. Mutations, hashes and replication are not
// modelled. Ported from soba-contacts' file of the same path.

/// <reference types="node" />
// (the app's tsconfig leaves node's types out; this brings them into the type check,
// for the test helpers that read files)

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import initSqlJs, { type Database, type SqlValue } from "sql.js";

// handed over directly: under jsdom, sql.js would try to fetch its wasm like a browser
const WASM = readFileSync(createRequire(import.meta.url).resolve("sql.js/dist/sql-wasm.wasm"));

// Mirrors the soba.schema.table() calls in Mutator.mjs; keep the two in sync. Like the
// runtime's, every declared column has text affinity: a stored 1 reads back as "1".
const DDL = `
PRAGMA foreign_keys = ON;
CREATE TABLE event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE
);
CREATE TABLE event_attr_single (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL REFERENCES event (uuid) ON DELETE CASCADE,
    key TEXT NOT NULL CHECK (key != ''),
    value TEXT,
    UNIQUE (event, key)
);
CREATE TABLE event_attr_multi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL REFERENCES event (uuid) ON DELETE CASCADE,
    key TEXT NOT NULL CHECK (key != ''),
    UNIQUE (event, key)
);
CREATE TABLE event_attr_multi_value (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL REFERENCES event (uuid) ON DELETE CASCADE,
    key TEXT NOT NULL CHECK (key != ''),
    value TEXT,
    FOREIGN KEY (event, key) REFERENCES event_attr_multi (event, key)
        ON DELETE CASCADE
);
CREATE TABLE calendar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE
);
CREATE TABLE calendar_attr (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    calendar TEXT NOT NULL REFERENCES calendar (uuid) ON DELETE CASCADE,
    key TEXT NOT NULL CHECK (key != ''),
    value TEXT,
    UNIQUE (calendar, key)
);
`;

// the columns an insert takes from its object, and the lww key
const TABLES: Record<string, { columns: string[]; lww: string[] }> = {
    event: { columns: ["uuid"], lww: ["uuid"] },
    event_attr_single: { columns: ["event", "key", "value"], lww: ["event", "key"] },
    event_attr_multi: { columns: ["event", "key"], lww: ["event", "key"] },
    event_attr_multi_value: { columns: ["event", "key", "value"], lww: [] },
    calendar: { columns: ["uuid"], lww: ["uuid"] },
    calendar_attr: { columns: ["calendar", "key", "value"], lww: ["calendar", "key"] },
};

type Fields = Record<string, unknown>;

export type FakeSoba = {
    /** Runs a query on the instance database, for assertions. */
    sql(query: string, ...params: unknown[]): unknown[][];
    /** Processes a request object and returns what it responded, if anything. */
    run<T>(request: { process(): void }): T | undefined;
    /** The messages handed to soba.mail.send, in order. */
    sent: unknown[];
    /** The warnings logged with soba.log.warning, in order. */
    warnings: string[];
};

/** Stand-in for the base module's NotFoundError, which the Mutator hands to the module. */
export class NotFoundError extends Error {}
/** What the Mutator hands to the requests that can miss (`GetEvent`). */
export const ERRORS = { NotFoundError };

/** Stand-in for the base module's Message, as the mail-sending requests fill it. */
export class FakeMessage {
    uuid = "";
    from: unknown;
    to: unknown;
    subject = "";
    bodyText = "";
    attachments: FakeAttachment[] = [];
    genUuid() {
        this.uuid = "{generated}";
    }
}
/** Stand-in for the base module's MessageAttachment; keeps what it was built with. */
export class FakeAttachment {
    constructor(public init: { name: string; type: string; blobs: ArrayBuffer[] }) {}
}
/** What the Mutator hands to the mail-sending requests (`SendInvite`). */
export const MAIL = { Message: FakeMessage, MessageAttachment: FakeAttachment };

/**
 * Throws, as the runtime does, when `value` holds a boolean anywhere: a boolean must
 * never be persisted, and rows, responses and requests all are.
 */
export function refuse_booleans(value: unknown) {
    if (typeof value === "boolean") throw new Error("Boolean types are not supported");
    if (value && typeof value === "object" && !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value))
        for (const v of Object.values(value)) refuse_booleans(v);
}

/** soba.app.account() of the stand-in. */
export const ACCOUNT = "me@example.com";

/** soba.app.instanceId() of the stand-in: the uuid below in base32hex. */
export const INSTANCE_ID = "04HKAPS9LF6UU0938LJOJAUDTS";
/** The primary calendar's uuid: the instance id in the braced form. */
export const PRIMARY = "{01234567-89ab-cdef-0123-456789abcdef}";

export async function install_fake_soba(): Promise<FakeSoba> {
    const SQL = await initSqlJs({
        wasmBinary: WASM.buffer.slice(WASM.byteOffset, WASM.byteOffset + WASM.byteLength) as ArrayBuffer,
    });
    const db = new SQL.Database();
    db.exec(DDL);
    // what soba.db.exec reads during a run(): the database as the pass found it
    let snapshot: Database | null = null;

    const read = (database: Database, query: string, params: unknown[]) => {
        const stmt = database.prepare(query);
        try {
            stmt.bind(params as SqlValue[]);
            const rows: unknown[][] = [];
            while (stmt.step()) rows.push(stmt.get());
            return rows;
        } finally {
            stmt.free();
        }
    };
    const sql = (query: string, ...params: unknown[]) => read(db, query, params);
    const where = (columns: string[]) => columns.map((c) => `${c} = ?`).join(" AND ");

    let responses: unknown[] = [];
    let minted = 0;
    const sent: unknown[] = [];
    const warnings: string[] = [];

    (globalThis as unknown as { soba: unknown }).soba = {
        app: { account: () => ACCOUNT, instanceId: () => INSTANCE_ID },
        mail: { send: (message: unknown) => sent.push(message) },
        text: {
            encode: (s: string) => new TextEncoder().encode(s),
            decode: (b: ArrayBuffer) => new TextDecoder().decode(b),
        },
        db: {
            exec: (query: string, ...params: unknown[]) => ({
                code: 0,
                data: read(snapshot ?? db, query, params),
            }),
        },
        data: {
            insert(table: string, object: Fields) {
                const { columns, lww } = TABLES[table];
                const values = columns.map((c) => object[c] ?? null);
                refuse_booleans(values);
                if (lww.length > 0) {
                    const old = sql(
                        `SELECT id, ${columns.join(", ")} FROM ${table} WHERE ${where(lww)}`,
                        ...lww.map((c) => object[c]),
                    )[0];
                    if (old) {
                        // the same content is ignored, other content replaces the row; a
                        // number is stored as its text
                        const stored = (v: unknown) => (typeof v === "number" ? String(v) : v);
                        if (columns.every((_, i) => old[i + 1] === stored(values[i]))) {
                            return { hash: old[0] };
                        }
                        sql(`DELETE FROM ${table} WHERE id = ?`, old[0]);
                    }
                }
                sql(
                    `INSERT INTO ${table} (${columns.join(", ")})
                     VALUES (${columns.map(() => "?").join(", ")})`,
                    ...values,
                );
                return { hash: sql("SELECT last_insert_rowid()")[0][0] };
            },
            find(table: string, key: Fields) {
                // like the runtime: exactly the columns of the lww constraint
                const { lww } = TABLES[table];
                const columns = Object.keys(key);
                if (
                    lww.length === 0 ||
                    columns.length !== lww.length ||
                    !lww.every((c) => columns.includes(c))
                ) {
                    throw new Error(`find on ${table} needs exactly [${lww}], got [${columns}]`);
                }
                const row = sql(
                    `SELECT id FROM ${table} WHERE ${where(columns)}`,
                    ...columns.map((c) => key[c]),
                )[0];
                if (!row) throw new Error(`no ${table} row for ${JSON.stringify(key)}`);
                return { object: key, hash: row[0], deleted: false };
            },
            delete(table: string, hash: unknown) {
                sql(`DELETE FROM ${table} WHERE id = ?`, hash);
            },
        },
        type: {
            uuid: {
                v4: () => `{00000000-0000-4000-8000-${String(++minted).padStart(12, "0")}}`,
            },
        },
        task: {
            respond: (object: unknown) => {
                refuse_booleans(object);
                responses.push(object);
            },
            emit() {},
        },
        log: { debug() {}, info() {}, warning: (s: string) => warnings.push(s), error() {} },
    };

    return {
        sql,
        sent,
        warnings,
        run<T>(request: { process(): void }) {
            responses = [];
            snapshot = new SQL.Database(db.export());
            // export() reopens the database, which resets its pragmas
            db.exec("PRAGMA foreign_keys = ON");
            try {
                request.process();
            } finally {
                snapshot.close();
                snapshot = null;
            }
            return responses[0] as T | undefined;
        },
    };
}
