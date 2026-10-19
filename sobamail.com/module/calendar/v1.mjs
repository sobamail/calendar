export const namespace = "https://sobamail.com/module/calendar/v1";

// Thrown by a constructor on content no retry can fix; the Mutator logs and drops it.
export class MalformedObject extends Error {}

// A boolean must never be persisted: the runtime throws on one ("Boolean types are not
// supported") in a row, and it stores responses and requests too. Booleans are fine in
// code; every flag this module writes or responds is 1 or 0.

// A local-naive ISO datetime, the shape every start and end is stored in.
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// A call link: an http(s) URL with a host and no blanks. Anything else (javascript:,
// data:, ...) is refused, since the UI opens it.
const CALL_URL = /^https?:\/\/[^\s/?#]+[^\s]*$/i;

// The shape of an IANA zone name ("UTC", "Europe/Istanbul", "America/Argentina/Salta",
// "Etc/GMT+3"). Only the shape is checked: whether the zone exists is the UI's business,
// which shows a zone it doesn't know as the browser's.
const ZONE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

// A calendar's color, "#rrggbb".
const COLOR = /^#[0-9a-f]{6}$/;

// The primary calendar's color when it is created: the first of the UI's palette, blue.
const PRIMARY_COLOR = "#4180ff";

// An instance id: a uuid in base32hex, without padding.
const INSTANCE_ID = /^[0-9a-v]{26}$/;

// Read-only SQL from a non-replicated handler; a failed query is an error, not an
// empty result.
function query(sql, ...params) {
    const ret = soba.db.exec(sql, ...params);
    if (ret.code !== 0) {
        throw new Error(`Query failed with code ${ret.code}: ${sql}`);
    }
    return ret.data;
}

// Delete a row by its lww key. The row must have been inserted at some point
// (soba.data.find throws otherwise); an already-deleted row is left alone.
function delete_row(table, key) {
    const row = soba.data.find(table, key);
    if (! row.deleted) {
        soba.data.delete(table, row.hash);
    }
}

// The instance id in the braced form soba.type.uuid.v4() mints. The id is base32hex: five
// bits a digit, so its 26 digits hold the uuid's 128 bits and 2 bits of padding.
function instance_uuid() {
    const id = String(soba.app.instanceId()).toLowerCase();
    if (! INSTANCE_ID.test(id)) {
        throw new Error(`Malformed instance id '${id}'`);
    }

    let bits = "";
    for (const c of id) {
        bits += parseInt(c, 32).toString(2).padStart(5, "0");
    }
    let hex = "";
    for (let i = 0; i < 128; i += 4) {
        hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${
            hex.slice(20)}}`;
}

// The primary calendar: the one every instance has, which new events and invitations go
// to and which can't be deleted. Its uuid is the instance id, random yet the same on every
// replica, so replicas that create it before they first sync write the same mutations
// rather than a calendar each. Created when first needed, with no name (the UI shows a
// placeholder) and PRIMARY_COLOR. For non-replicated handlers; returns its uuid.
function primary_calendar() {
    const uuid = instance_uuid();
    if (query("SELECT 1 FROM calendar WHERE uuid = ?", uuid).length === 0) {
        (new AddCalendar({uuid})).process();
        (new SetCalendarAttr({calendar : uuid, key : "color", value : PRIMARY_COLOR})).process();
    }
    return uuid;
}

// case and accent insensitive form for search, so "ŞAHİN", "şahin" and "sahin" all become
// "sahin": decompose, drop the combining diacritical marks (U+0300 to U+036F), lowercase.
// dotless ı has no decomposition, so it is mapped by hand. Copied from Contacts.
function fold(s) {
    let ret = "";
    for (const c of String(s).normalize("NFKD")) {
        const cp = c.codePointAt(0);
        if (cp < 0x300 || cp > 0x36f) {
            ret += c;
        }
    }
    return ret.toLowerCase().replace(/ı/g, "i");
}

function same_values(a, b) {
    return a.length === b.length && a.every((v) => b.includes(v));
}

// An event's flag attrs. Every column has text affinity, so a stored 1/0 reads back as
// "1"/"0" (truthy both): they are turned back into numbers.
const FLAGS = [ "allDay", "call" ];

// An attr value as read by the pivot queries: a list's JSON array parsed, a flag as 1/0,
// the sequence as a number, for the same reason.
function read_attr(key, value, is_json_array) {
    if (is_json_array) {
        return JSON.parse(value);
    }
    if (FLAGS.includes(key)) {
        return Number(value) ? 1 : 0;
    }
    if (key === "sequence") {
        return Number(value) || 0;
    }
    return value;
}

export class AddEvent {
    static KEY = `{${namespace}}${this.name}`;
    constructor({uuid} = {}) {
        if (! uuid) {
            throw new MalformedObject("Missing Event.uuid");
        }
        this.uuid = uuid;
    }

    process() { soba.data.insert("event", this); }

    asText(locale) { return `Add event ${this.uuid}`; }
    toString() { return `AddEvent(${this.uuid})`; }
}

export class SetEventAttr {
    static KEY = `{${namespace}}${this.name}`;
    constructor({event, key, value} = {}) {
        if (! event) {
            throw new MalformedObject("Missing EventAttr.event");
        }
        if (! key) {
            throw new MalformedObject("Missing EventAttr.key");
        }

        this.event = event;
        this.key = key;
        this.value = value;
    }

    process() { soba.data.insert("event_attr_single", this); }

    asText(locale) { return `Set ${this.key} of event ${this.event} to '${this.value}'`; }
    toString() { return `SetEventAttr(${this.event}, '${this.key}', '${this.value}')`; }
}

export class AddEventAttr {
    static KEY = `{${namespace}}${this.name}`;
    constructor({event, key} = {}) {
        if (! event) {
            throw new MalformedObject("Missing EventAttr.event");
        }
        if (! key) {
            throw new MalformedObject("Missing EventAttr.key");
        }

        this.event = event;
        this.key = key;
    }

    process() { soba.data.insert("event_attr_multi", this); }

    asText(locale) { return `Start the ${this.key} list of event ${this.event}`; }
    toString() { return `AddEventAttr(${this.event}, '${this.key}')`; }
}

export class AddEventAttrValue {
    static KEY = `{${namespace}}${this.name}`;
    constructor({event, key, value} = {}) {
        if (! event) {
            throw new MalformedObject("Missing EventAttrValue.event");
        }
        if (! key) {
            throw new MalformedObject("Missing EventAttrValue.key");
        }

        this.event = event;
        this.key = key;
        this.value = value;
    }

    process() { soba.data.insert("event_attr_multi_value", this); }

    asText(locale) { return `Add '${this.value}' to the ${this.key} of event ${this.event}`; }
    toString() { return `AddEventAttrValue(${this.event}, '${this.key}', '${this.value}')`; }
}

export class PutEventResponse {
    static KEY = `{${namespace}}${this.name}`;
    constructor({uuid} = {}) { this.uuid = uuid; }
}

export class PutEvent {
    static KEY = `{${namespace}}${this.name}`;
    constructor({
        uuid = "",
        title = "",
        cal = "",
        start = "",
        end = "",
        allDay = false,
        location = "",
        desc = "",
        callUrl = "",
        attendees = [],
        uid,
        organizer,
        status,
        tz,
        sequence,
    } = {}) {
        title = typeof title === "string" ? title.trim() : "";
        if (! title) {
            throw new MalformedObject("Missing PutEvent.title");
        }
        if (sequence !== undefined && ! (Number.isInteger(sequence) && sequence >= 0)) {
            throw new MalformedObject(`Malformed PutEvent.sequence '${sequence}'`);
        }
        // "" is the primary calendar; write() checks that any other is stored
        if (typeof cal !== "string") {
            throw new MalformedObject("Malformed PutEvent.cal");
        }
        // ISO datetimes of one shape order as plain strings
        if (! LOCAL_DATETIME.test(start)) {
            throw new MalformedObject(`Malformed PutEvent.start '${start}'`);
        }
        if (! LOCAL_DATETIME.test(end)) {
            throw new MalformedObject(`Malformed PutEvent.end '${end}'`);
        }
        if (end < start) {
            throw new MalformedObject(`PutEvent.end '${end}' is before its start '${start}'`);
        }
        if (typeof callUrl !== "string") {
            throw new MalformedObject("Malformed PutEvent.callUrl");
        }
        callUrl = callUrl.trim();
        if (callUrl && ! CALL_URL.test(callUrl)) {
            throw new MalformedObject(`Malformed PutEvent.callUrl '${callUrl}'`);
        }
        if (tz !== undefined && tz !== "" && ! (typeof tz === "string" && ZONE.test(tz))) {
            throw new MalformedObject(`Malformed PutEvent.tz '${tz}'`);
        }

        this.uuid = uuid;
        this.title = title;
        this.cal = cal;
        this.start = start;
        this.end = end;
        // flags are kept as they are stored, 1/0 (a boolean must never be persisted)
        this.allDay = allDay ? 1 : 0;
        this.location = location;
        this.desc = desc;
        this.callUrl = callUrl;
        // derived: a sent `call` flag is ignored. Rows stored before callUrl existed
        // keep their call=1 until they are saved again.
        this.call = callUrl !== "" ? 1 : 0;
        this.attendees = attendees;
        // what an invitation came with. Written only when sent, so the UI's saves (which
        // don't send them) keep them
        this.uid = uid;
        this.organizer = organizer;
        this.status = status;
        // the IANA zone start and end are the wall clock of; "" (and a row stored before
        // zones) is the browser's. Written only when sent, like the invitation attrs
        this.tz = tz;
        // the iCalendar SEQUENCE of the invitation the guests were last mailed, raised for
        // each update mailed to them. Written only when sent, like the invitation attrs
        this.sequence = sequence;
    }

    process() {
        // respond with the created/updated event
        soba.task.respond(new PutEventResponse({
            uuid : this.write(),
        }));
    }

    // Writes the event and returns its uuid, minted when it has none. Throws
    // MalformedObject, writing nothing, when `cal` names no stored calendar.
    write() {
        if (! this.cal) {
            this.cal = primary_calendar();
        }
        else if (query("SELECT 1 FROM calendar WHERE uuid = ?", this.cal).length === 0) {
            throw new MalformedObject(`PutEvent.cal '${this.cal}' names no calendar`);
        }

        if (! this.uuid) {
            this.uuid = soba.type.uuid.v4();
        }

        // ensure event row exists
        (new AddEvent({uuid : this.uuid})).process();

        // single-value attributes. Scalars (times, flags, enums) are written
        // unconditionally so clearing a field on edit actually persists; flags are
        // already 1/0.
        const setSingle = (key, value) => {
            (new SetEventAttr({event : this.uuid, key, value})).process();
        };

        setSingle("title", this.title);
        setSingle("cal", this.cal);
        setSingle("start", this.start);
        setSingle("end", this.end);
        setSingle("allDay", this.allDay);
        setSingle("location", this.location);
        setSingle("desc", this.desc);
        setSingle("callUrl", this.callUrl);
        setSingle("call", this.call);
        for (const key of [ "uid", "organizer", "status", "tz" ]) {
            if (this[key] !== undefined) {
                setSingle(key, String(this[key]));
            }
        }
        if (this.sequence !== undefined) {
            setSingle("sequence", this.sequence);
        }

        // multi-value attribute. Values have no key of their own, so a changed list
        // drops its container (which cascades to the values) and starts a new one;
        // the new values depend on that delete, so they are fresh mutations even
        // when they were there before. An unchanged list is left untouched.
        const target = Array.isArray(this.attendees) ? this.attendees.map(String) : [];
        const current = query(
                             "SELECT value FROM event_attr_multi_value WHERE event = ? AND key = ?",
                             this.uuid,
                             "attendees")
                                .map((r) => r[0]);
        if (! same_values(target, current)) {
            if (current.length > 0) {
                delete_row("event_attr_multi", {event : this.uuid, key : "attendees"});
            }
            if (target.length > 0) {
                (new AddEventAttr({event : this.uuid, key : "attendees"})).process();
                for (const v of target) {
                    (new AddEventAttrValue({event : this.uuid, key : "attendees", value : v}))
                            .process();
                }
            }
        }

        return this.uuid;
    }
}

export class GetEvents {
    static KEY = `{${namespace}}${this.name}`;
    constructor({from, to, filter, limit, offset} = {}) {
        this.from = from;
        this.to = to;
        this.filter = filter;
        this.limit = limit;
        this.offset = offset;
    }

    process() {
        // Pivot single- and multi-value attrs into (event, key, value, is_array) rows.
        const pivot = `SELECT * FROM (
SELECT event,
    key,
    value,
    0
FROM event_attr_single
UNION
SELECT pamv.event,
    pamv.key,
    json_group_array(pamv.value),
    1
FROM event_attr_multi pam
    JOIN event_attr_multi_value pamv ON (
        pam.event = pamv.event
        AND pam.key = pamv.key
    )
GROUP BY pamv.event,
    pamv.key
) AS a`;

        // Select which events to return: those overlapping [from, to), so a multi-day
        // event that started before the window still shows. ISO-8601 values sort
        // chronologically as plain strings, so string comparison is a correct
        // time-window filter — evaluated server-side.
        let uuids = ((this.from && this.to)
                             ? query(`SELECT s.event
FROM event_attr_single s
    JOIN event_attr_single e ON (e.event = s.event AND e.key = 'end')
WHERE s.key = 'start'
    AND s.value < ?
    AND e.value >= ?
ORDER BY s.value, s.event`,
                                     this.to,
                                     this.from)
                             : query("SELECT uuid FROM event ORDER BY uuid"))
                            .map((r) => r[0]);

        // Search: keep only events where one free-text value contains `filter`. sqlite's
        // LIKE folds only ascii and treats % and _ as wildcards, so matching happens in js.
        if (this.filter) {
            const needle = fold(this.filter);
            const hits = new Set();
            for (const [event, value] of query(`SELECT event, value
FROM event_attr_single
WHERE key IN ('title', 'location', 'desc')
    AND event IN (SELECT value FROM json_each(?))
UNION ALL
SELECT event, value
FROM event_attr_multi_value
WHERE key = 'attendees'
    AND event IN (SELECT value FROM json_each(?))`,
                                                   JSON.stringify(uuids),
                                                   JSON.stringify(uuids))) {
                if (fold(value ?? "").includes(needle)) {
                    hits.add(event);
                }
            }
            uuids = uuids.filter((u) => hits.has(u));
        }

        const offset = this.offset ?? 0;
        const page = uuids.slice(offset, this.limit == null ? undefined : offset + this.limit);

        // every attribute of the page's events, so each comes back whole
        const rows = query(`${pivot}
WHERE a.event IN (SELECT value FROM json_each(?))`,
                           JSON.stringify(page));

        let events = new Map();
        for (const pattr of rows) {
            // read columns
            const u = pattr[0];
            const k = pattr[1];
            const v = pattr[2];
            const is_json_array = pattr[3];

            // get event instance
            let event = events.get(u);
            if (! event) {
                event = new Event({uuid : u});
                events.set(u, event);
            }

            event[k] = read_attr(k, v, is_json_array);
        }

        soba.task.respond(new GetEventsResponse({
            data : page.map((u) => events.get(u)).filter(Boolean),
        }));
    }
}

export class GetEvent {
    static KEY = `{${namespace}}${this.name}`;
    constructor({uuid} = {}) { this.uuid = uuid; }

    // process() takes the base module's NotFoundError from the Mutator, because this
    // module can't import the base module: the UI bundles it too.
    process({NotFoundError}) {
        if (! this.uuid) {
            return;
        }
        if (query("SELECT 1 FROM event WHERE uuid = ?", this.uuid).length === 0) {
            throw new NotFoundError(`No event ${this.uuid}`);
        }

        const rows = query(`SELECT *
FROM (
        SELECT event,
            key,
            value,
            0
        FROM event_attr_single
        UNION
        SELECT pamv.event,
            pamv.key,
            json_group_array(pamv.value),
            1
        FROM event_attr_multi pam
            JOIN event_attr_multi_value pamv ON (
                pam.event = pamv.event
                AND pam.key = pamv.key
            )
        GROUP BY pamv.event,
            pamv.key
    )
WHERE event = ?`,
                this.uuid);

        let event = new Event();
        for (const pattr of rows) {
            const k = pattr[1];
            const v = pattr[2];
            const is_json_array = pattr[3];
            event[k] = read_attr(k, v, is_json_array);
        }
        event.uuid = this.uuid;
        soba.task.respond(event);
    }
}

export class DeleteEvent {
    static KEY = `{${namespace}}${this.name}`;
    constructor({uuid} = {}) {
        if (! uuid) {
            throw new MalformedObject("Missing Event.uuid");
        }
        this.uuid = uuid;
    }

    process() {
        // a find on a uuid that was never inserted throws, and a throw asks the
        // runtime to retry; an unknown event is nothing to retry, so look first
        if (query("SELECT 1 FROM event WHERE uuid = ?", this.uuid).length === 0) {
            soba.log.warning(`No event ${this.uuid} to delete`);
            return;
        }
        delete_row("event", {uuid : this.uuid});
    }
}

// a trimmed string, or "" for anything that isn't one
function clean_text(s) { return typeof s === "string" ? s.trim() : ""; }

export class SendInviteResponse {
    static KEY = `{${namespace}}${this.name}`;
    constructor({uuid = "", to = []} = {}) {
        this.uuid = uuid;
        this.to = to;
    }
}

// Mails an invitation the UI wrote (an iCalendar file with METHOD:REQUEST), as an
// attachment, from the account to the guests the UI gives. Like Contacts' SendVCard, the
// backend makes nothing here, and process() takes the base module's Message and
// MessageAttachment from the Mutator, because this module can't import the base module.
export class SendInvite {
    static KEY = `{${namespace}}${this.name}`;
    constructor({uuid = "", to = [], ics = "", subject = "", text = ""} = {}) {
        if (! clean_text(uuid)) {
            throw new MalformedObject("Missing SendInvite.uuid");
        }
        const recipients = (Array.isArray(to) ? to : [ to ]).map(clean_text).filter(Boolean);
        if (recipients.length === 0) {
            throw new MalformedObject("Missing SendInvite.to");
        }
        if (! clean_text(ics)) {
            throw new MalformedObject("Missing SendInvite.ics");
        }

        this.uuid = clean_text(uuid);
        this.to = recipients;
        this.ics = String(ics);
        this.subject = clean_text(subject) || "Invitation";
        this.text = clean_text(text) || "Attached: invite.ics";
    }

    process({Message, MessageAttachment}) {
        const message = new Message();
        message.genUuid();
        message.from = [ {address : soba.app.account()} ];
        message.to = this.to.map((address) => ({address}));
        message.subject = this.subject;
        message.bodyText = this.text;
        // unlike the text body, an attachment's string isn't encoded for us
        message.attachments = [ new MessageAttachment({
            name : "invite.ics",
            type : "text/calendar; method=REQUEST",
            blobs : [ soba.text.encode(this.ics).buffer ],
        }) ];
        soba.mail.send(message);

        soba.task.respond(new SendInviteResponse({uuid : this.uuid, to : this.to}));
    }
}

export class Account {
    static KEY = `{${namespace}}${this.name}`;
    constructor({address = ""} = {}) { this.address = address; }
}

// The account's address, which the UI writes into an invitation as its ORGANIZER.
export class GetAccount {
    static KEY = `{${namespace}}${this.name}`;
    constructor() {}

    process() { soba.task.respond(new Account({address : soba.app.account()})); }
}

export class Event {
    static KEY = `{${namespace}}${this.name}`;
    constructor({
        uuid = "",
        title = "",
        cal = "",
        start = "",
        end = "",
        allDay = 0,
        location = "",
        desc = "",
        call = 0,
        callUrl = "",
        attendees = [],
        uid = "",
        organizer = "",
        status = "",
        tz = "",
        sequence = 0,
    } = {}) {
        this.uuid = uuid;
        this.title = title;
        this.cal = cal;
        this.start = start;
        this.end = end;
        this.allDay = allDay;
        this.location = location;
        this.desc = desc;
        this.call = call;
        this.callUrl = callUrl;
        this.attendees = attendees;
        this.uid = uid;
        this.organizer = organizer;
        this.status = status;
        this.tz = tz;
        this.sequence = sequence;
    }
}

export class GetEventsResponse {
    static KEY = `{${namespace}}${this.name}`;
    constructor({data = []} = {}) { this.data = data; }
}

export class AddCalendar {
    static KEY = `{${namespace}}${this.name}`;
    constructor({uuid} = {}) {
        if (! uuid) {
            throw new MalformedObject("Missing Calendar.uuid");
        }
        this.uuid = uuid;
    }

    process() { soba.data.insert("calendar", this); }

    asText(locale) { return `Add calendar ${this.uuid}`; }
    toString() { return `AddCalendar(${this.uuid})`; }
}

export class SetCalendarAttr {
    static KEY = `{${namespace}}${this.name}`;
    constructor({calendar, key, value} = {}) {
        if (! calendar) {
            throw new MalformedObject("Missing CalendarAttr.calendar");
        }
        if (! key) {
            throw new MalformedObject("Missing CalendarAttr.key");
        }

        this.calendar = calendar;
        this.key = key;
        this.value = value;
    }

    process() { soba.data.insert("calendar_attr", this); }

    asText(locale) { return `Set ${this.key} of calendar ${this.calendar} to '${this.value}'`; }
    toString() { return `SetCalendarAttr(${this.calendar}, '${this.key}', '${this.value}')`; }
}

export class Calendar {
    static KEY = `{${namespace}}${this.name}`;
    constructor({uuid = "", name = "", color = "", primary = 0} = {}) {
        this.uuid = uuid;
        this.name = name;
        this.color = color;
        this.primary = primary;
    }
}

export class PutCalendarResponse {
    static KEY = `{${namespace}}${this.name}`;
    constructor({uuid} = {}) { this.uuid = uuid; }
}

export class PutCalendar {
    static KEY = `{${namespace}}${this.name}`;
    constructor({uuid = "", name = "", color = ""} = {}) {
        name = typeof name === "string" ? name.trim() : "";
        if (! name) {
            throw new MalformedObject("Missing PutCalendar.name");
        }
        color = typeof color === "string" ? color.toLowerCase() : "";
        if (! COLOR.test(color)) {
            throw new MalformedObject(`Malformed PutCalendar.color '${color}'`);
        }

        this.uuid = uuid;
        this.name = name;
        this.color = color;
    }

    process() {
        if (! this.uuid) {
            this.uuid = soba.type.uuid.v4();
        }

        (new AddCalendar({uuid : this.uuid})).process();
        (new SetCalendarAttr({calendar : this.uuid, key : "name", value : this.name})).process();
        (new SetCalendarAttr({calendar : this.uuid, key : "color", value : this.color})).process();

        soba.task.respond(new PutCalendarResponse({uuid : this.uuid}));
    }
}

export class GetCalendarsResponse {
    static KEY = `{${namespace}}${this.name}`;
    constructor({data = []} = {}) { this.data = data; }
}

// Every calendar: the primary one first, created here when it doesn't exist yet, then the
// others by name.
export class GetCalendars {
    static KEY = `{${namespace}}${this.name}`;
    constructor() {}

    process() {
        // listed as created: soba.db.exec reads a snapshot, which doesn't show the rows
        // primary_calendar() has just written
        const primary = primary_calendar();
        const calendars = new Map([ [
            primary, new Calendar({uuid : primary, color : PRIMARY_COLOR, primary : 1})
        ] ]);
        for (const [uuid, key, value] of query(`SELECT c.uuid, a.key, a.value
FROM calendar c
    LEFT JOIN calendar_attr a ON a.calendar = c.uuid`)) {
            let calendar = calendars.get(uuid);
            if (! calendar) {
                calendar = new Calendar({uuid, primary : uuid === primary ? 1 : 0});
                calendars.set(uuid, calendar);
            }
            if (key !== null) {
                calendar[key] = value;
            }
        }

        const data = [...calendars.values() ];
        const sort_key = (c) => fold(c.name);
        data.sort((a, b) => b.primary - a.primary ||
                            sort_key(a).localeCompare(sort_key(b)) || a.uuid.localeCompare(b.uuid));
        soba.task.respond(new GetCalendarsResponse({data}));
    }
}

export class DeleteCalendarResponse {
    static KEY = `{${namespace}}${this.name}`;
    constructor({deleted = 0, events = 0} = {}) {
        this.deleted = deleted;
        this.events = events;
    }
}

// Refused for the primary calendar, and while an event names the calendar: `events` says
// how many do. An event that names a deleted calendar anyway (another replica's concurrent
// save) shows as unknown.
export class DeleteCalendar {
    static KEY = `{${namespace}}${this.name}`;
    constructor({uuid} = {}) {
        if (! uuid) {
            throw new MalformedObject("Missing Calendar.uuid");
        }
        this.uuid = uuid;
    }

    process() {
        if (this.uuid === instance_uuid()) {
            soba.log.warning("The primary calendar can't be deleted");
            soba.task.respond(new DeleteCalendarResponse());
            return;
        }

        // a find on a never-inserted uuid throws, which would be retried: look first
        if (query("SELECT 1 FROM calendar WHERE uuid = ?", this.uuid).length === 0) {
            soba.log.warning(`No calendar ${this.uuid} to delete`);
            soba.task.respond(new DeleteCalendarResponse());
            return;
        }

        const events =
                query("SELECT count(*) FROM event_attr_single WHERE key = 'cal' AND value = ?",
                      this.uuid)[0][0];
        if (events > 0) {
            soba.task.respond(new DeleteCalendarResponse({events}));
            return;
        }

        delete_row("calendar", {uuid : this.uuid});
        soba.task.respond(new DeleteCalendarResponse({deleted : 1}));
    }
}

// ---- iCalendar (RFC 5545) parsing ---------------------------------------------------
//
// Here rather than in the UI because the backend reads mailed invitations with it; the UI
// imports it (ui/src/lib/ics.ts) and turns the times into its dates and hours. Alarms, time
// zone definitions, to-dos and recurrence rules are not read: a recurring event comes in as
// its first occurrence.

// A light check for typos in an address, the same as the UI's email.ts.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

// the logical lines of a file: a line starting with a blank or a tab continues the
// previous one, and only that first character goes
function ics_logical_lines(s) {
    const lines = [];
    for (const raw of String(s).split(/\r\n|\r|\n/)) {
        if (lines.length && (raw.startsWith(" ") || raw.startsWith("\t"))) {
            lines[lines.length - 1] += raw.slice(1);
        }
        else {
            lines.push(raw);
        }
    }
    return lines;
}

// NAME[;PARAM=value...]:value, with quoted parameter values, as {name, params, value}
function ics_property(l) {
    let quoted = false;
    let colon = -1;
    for (let i = 0; i < l.length; i++) {
        if (l[i] === "\"") {
            quoted = ! quoted;
        }
        else if (l[i] === ":" && ! quoted) {
            colon = i;
            break;
        }
    }
    if (colon < 0) {
        return null;
    }

    const head = [ "" ];
    quoted = false;
    for (const c of l.slice(0, colon)) {
        if (c === "\"") {
            quoted = ! quoted;
        }
        if (c === ";" && ! quoted) {
            head.push("");
        }
        else {
            head[head.length - 1] += c;
        }
    }
    const params = new Map();
    for (const p of head.slice(1)) {
        const eq = p.indexOf("=");
        if (eq >= 0) {
            params.set(p.slice(0, eq).trim().toUpperCase(),
                       p.slice(eq + 1).trim().replace(/^"|"$/g, ""));
        }
    }
    return {name : head[0].trim().toUpperCase(), params, value : l.slice(colon + 1)};
}

function ics_unescape(s) {
    return s.replace(/\\([\\,;:nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

// A wall-clock time is carried as a "naive" number: its fields read as UTC milliseconds,
// so day and hour arithmetic never meets a DST change.

// how far `tz`'s wall clock is ahead of UTC at the instant `ms`; throws on an unknown zone
function zone_offset(tz, ms) {
    const parts = new Intl.DateTimeFormat("en-US", {
                      timeZone : tz,
                      hourCycle : "h23",
                      year : "numeric",
                      month : "numeric",
                      day : "numeric",
                      hour : "numeric",
                      minute : "numeric",
                      second : "numeric",
                  }).formatToParts(new Date(ms));
    const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const wall = Date.UTC(get("year"),
                          get("month") - 1,
                          get("day"),
                          get("hour") % 24,
                          get("minute"),
                          get("second"));
    return wall - Math.floor(ms / 1000) * 1000;
}

// the instant at which `tz`'s wall clock shows the naive `wall`
function instant_in_zone(wall, tz) {
    const guess = wall - zone_offset(tz, wall);
    return wall - zone_offset(tz, guess);
}

const ICS_DATE = /^(\d{4})(\d{2})(\d{2})$/;
const ICS_DATE_TIME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i;

// DTSTART / DTEND as {naive, allDay, tz}, the wall clock always as written: a date
// (all-day, no zone), a UTC time (zone "UTC"), a time with an IANA TZID (that zone), or a
// floating time or a TZID that is no IANA name (Outlook's Windows zone names), in no zone
// (the browser's). Nothing depends on the zone the runtime runs in.
function ics_when(p) {
    const v = p.value.trim();
    let m = ICS_DATE.exec(v);
    if (m) {
        return {naive : Date.UTC(+m[1], +m[2] - 1, +m[3]), allDay : true, tz : ""};
    }
    m = ICS_DATE_TIME.exec(v);
    if (! m) {
        return null;
    }
    const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    if (m[7]) {
        return {naive : wall, allDay : false, tz : "UTC"};
    }
    const tz = (p.params.get("TZID") ?? "").replace(/^\//, "");
    return {naive : wall, allDay : false, tz : ZONE.test(tz) ? tz : ""};
}

// `when`'s wall clock in the zone `tz`; as written when either zone is none or unknown
function ics_in_zone(when, tz) {
    if (when.allDay || ! when.tz || ! tz || when.tz === tz) {
        return when.naive;
    }
    try {
        const ms = instant_in_zone(when.naive, when.tz);
        return ms + zone_offset(tz, ms);
    }
    catch {
        return when.naive;
    }
}

const ICS_DURATION = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i;

function ics_duration(v) {
    const m = ICS_DURATION.exec(v.trim());
    if (! m) {
        return null;
    }
    const [w, d, h, min, s] = m.slice(2).map((x) => Number(x ?? 0));
    const ms = ((((w * 7 + d) * 24 + h) * 60 + min) * 60 + s) * 1000;
    return m[1] === "-" ? -ms : ms;
}

const DAY = 86400000;

// "YYYY-MM-DD" and "YYYY-MM-DDTHH:MM" of a naive time
const naive_date = (naive) => new Date(naive).toISOString().slice(0, 10);
const naive_iso = (naive) => new Date(naive).toISOString().slice(0, 16);

// an address out of a mailto: value, or "" when it isn't one
function ics_address(v) {
    const a = ics_unescape(v).trim().replace(/^mailto:/i, "");
    return EMAIL.test(a) ? a : "";
}

// the properties a call link may come in, in order of preference
const ICS_CALL_PROPS = [ "URL", "X-GOOGLE-CONFERENCE", "X-MICROSOFT-SKYPETEAMSMEETINGURL" ];

function ics_event(props) {
    const first = (name) => props.find((p) => p.name === name);
    const str = (name) => {
        const p = first(name);
        return p ? ics_unescape(p.value).trim() : "";
    };

    const status = str("STATUS").toUpperCase();
    const dtstart = first("DTSTART");
    const start = dtstart && ics_when(dtstart);
    if (! start || status === "CANCELLED") {
        return null;
    }

    // the end: DTEND, else DTSTART + DURATION, else the start (a date: that one day)
    const dtend = first("DTEND");
    let end = dtend && ics_when(dtend);
    if (! end) {
        const dur = ics_duration(first("DURATION")?.value ?? "");
        if (dur !== null) {
            end = {naive : start.naive + dur, allDay : start.allDay, tz : start.tz};
        }
    }
    // the end in the start's zone, the one the event is stored in
    let endNaive = end ? ics_in_zone(end, start.tz) : start.naive + (start.allDay ? DAY : 0);
    // a date-only end is exclusive
    if (start.allDay) {
        endNaive -= DAY;
    }
    endNaive = Math.max(endNaive, start.naive);

    // an all-day event, and a timed one ending at midnight, end at the last minute of
    // their last day, where the UI stores them
    let endIso = naive_iso(endNaive);
    if (start.allDay) {
        endIso = `${naive_date(endNaive)}T23:59`;
    }
    else if (endIso.endsWith("T00:00") && naive_date(endNaive) > naive_date(start.naive)) {
        endIso = `${naive_date(endNaive - DAY)}T23:59`;
    }

    const attendees = [];
    for (const p of props.filter((p) => p.name === "ATTENDEE")) {
        const a = ics_address(p.value);
        if (a && ! attendees.some((x) => x.toLowerCase() === a.toLowerCase())) {
            attendees.push(a);
        }
    }

    const calls = ICS_CALL_PROPS.map(str).filter((u) => u && CALL_URL.test(u));
    return {
        uid : str("UID"),
        title : str("SUMMARY"),
        start : naive_iso(start.naive),
        end : endIso,
        allDay : start.allDay,
        location : str("LOCATION"),
        desc : str("DESCRIPTION"),
        attendees,
        callUrl : calls[0] ?? "",
        organizer : ics_address(first("ORGANIZER")?.value ?? ""),
        status,
        sequence : parseInt(str("SEQUENCE"), 10) || 0,
        tz : start.tz,
    };
}

// The events in an iCalendar text, how many VEVENTs had no usable start or were cancelled,
// and the calendar's METHOD ("" when none).
export function parse_ics(s) {
    const events = [];
    let skipped = 0;
    let method = "";
    const stack = [];
    let props = [];

    for (const l of ics_logical_lines(s)) {
        const p = ics_property(l);
        if (! p) {
            continue;
        }
        const top = stack[stack.length - 1];
        if (p.name === "BEGIN") {
            stack.push(p.value.trim().toUpperCase());
            if (stack[stack.length - 1] === "VEVENT") {
                props = [];
            }
        }
        else if (p.name === "END") {
            if (stack.pop() === "VEVENT" && stack[stack.length - 1] === "VCALENDAR") {
                const ev = ics_event(props);
                if (ev) {
                    events.push(ev);
                }
                else {
                    skipped++;
                }
            }
        }
        else if (top === "VEVENT") {
            props.push(p);
        }
        else if (top === "VCALENDAR" && p.name === "METHOD") {
            method = p.value.trim().toUpperCase();
        }
    }
    return {events, skipped, method};
}

// ---- invitations in -----------------------------------------------------------------

// the text of an attachment's blobs: strings as they are, bytes as UTF-8
function blobs_text(blobs) {
    let ret = "";
    for (const b of Array.isArray(blobs) ? blobs : [ blobs ]) {
        if (typeof b === "string") {
            ret += b;
        }
        else if (b instanceof ArrayBuffer) {
            ret += soba.text.decode(b);
        }
        else if (ArrayBuffer.isView(b)) {
            ret += soba.text.decode(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
        }
    }
    return ret;
}

// the iCalendar texts a mail carries: its calendar attachments, else a calendar in its
// text body
function ics_texts(message) {
    const texts = [];
    for (const a of message.attachments ?? []) {
        const type = String(a?.type ?? "").toLowerCase();
        const name = String(a?.name ?? "").toLowerCase();
        if (type.startsWith("text/calendar") || type.startsWith("application/ics") ||
            name.endsWith(".ics")) {
            texts.push(blobs_text(a.blobs));
        }
    }
    if (texts.length === 0 && /^BEGIN:VCALENDAR/im.test(message.bodyText ?? "")) {
        texts.push(message.bodyText);
    }
    return texts;
}

// Reads the invitations in a delivered plain mail (the Mutator hands over metadata.type
// "message" deliveries, never a structured object): every VEVENT of a METHOD:REQUEST
// calendar is written as a tentative event in the primary calendar. The event of the same
// UID is updated in place, keeping the calendar the user filed it under (unless that one
// is gone), so a re-sent invitation replaces rather than duplicates. The account's own
// mail (the invitations it sent) is ignored. Runs in a non-replicated handler (it queries
// and may mint uuids). Returns how many events it wrote.
export function read_invitations(message) {
    const account = String(soba.app.account() ?? "").toLowerCase();
    const from = (message.from ?? []).map((a) => String(a?.address ?? "").toLowerCase());
    if (from.includes(account)) {
        return 0;
    }

    let written = 0;
    for (const text of ics_texts(message)) {
        const {events, method} = parse_ics(text);
        if (method !== "REQUEST") {
            continue;
        }
        for (const ev of events) {
            // "" is the primary calendar
            let uuid = "";
            let cal = "";
            if (ev.uid) {
                const row = query(`SELECT u.event, k.uuid
FROM event_attr_single u
    LEFT JOIN event_attr_single c ON (c.event = u.event AND c.key = 'cal')
    LEFT JOIN calendar k ON k.uuid = c.value
WHERE u.key = 'uid'
    AND u.value = ?`,
                                  ev.uid)[0];
                if (row) {
                    uuid = row[0];
                    cal = row[1] ?? cal;
                }
            }

            try {
                (new PutEvent({
                    uuid,
                    title : ev.title || "Invitation",
                    cal,
                    start : ev.start,
                    end : ev.end,
                    allDay : ev.allDay,
                    location : ev.location,
                    desc : ev.desc,
                    callUrl : ev.callUrl,
                    attendees : ev.attendees,
                    uid : ev.uid,
                    organizer : ev.organizer,
                    status : "tentative",
                    tz : ev.tz,
                })).write();
                written++;
            }
            catch (e) {
                if (! (e instanceof MalformedObject)) {
                    throw e;
                }
                soba.log.warning(`Dropped invitation '${ev.uid}': ${e.message}`);
            }
        }
    }
    return written;
}
