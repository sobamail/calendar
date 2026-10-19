
/*
 * This is a Sobamail application.
 * See https://sobamail.com for more info
 */

import "soba://computer/R2";

import {
    DeleteRow,
    Message,
    MessageAttachment,
    NotFoundError,
} from "https://sobamail.com/module/base/v1?sha224=FT31A9Ojcmu_lm2HSbwlKpw5FDVqfP2ESNjmrg";
import {
    AddCalendar,
    AddEvent,
    AddEventAttr,
    AddEventAttrValue,
    DeleteCalendar,
    DeleteEvent,
    GetAccount,
    GetCalendars,
    GetEvent,
    GetEvents,
    MalformedObject,
    PutCalendar,
    PutEvent,
    read_invitations,
    SendInvite,
    SetCalendarAttr,
    SetEventAttr,
} from "https://sobamail.com/module/calendar/v1?sha224=QD6QRNNMURTQO44UTREG3B7TVGLS25J8CDCG7TA4AOQTA";

// what the module's requests that can miss need from the base module, which it can't import
const ERRORS = {NotFoundError};
// what the module's mail-sending requests need from the base module, likewise
const MAIL = {
    Message,
    MessageAttachment
};

export default class Application {
    static id = "calendar.app.sobamail.com";
    static name = "Calendar";
    static version = "1.0.1.1";
    static objects = new Map([
        // plain mail, for the invitations in it
        [ Message.KEY, false ],
        [ DeleteRow.KEY, false ],
        [ AddEvent.KEY, false ],
        [ SetEventAttr.KEY, false ],
        [ AddEventAttr.KEY, false ],
        [ AddEventAttrValue.KEY, false ],
        [ PutEvent.KEY, false ],
        [ DeleteEvent.KEY, false ],
        [ AddCalendar.KEY, false ],
        [ SetCalendarAttr.KEY, false ],
        [ PutCalendar.KEY, false ],
        [ DeleteCalendar.KEY, false ],

        [ GetEvent.KEY, false ],
        [ GetEvents.KEY, false ],
        [ GetCalendars.KEY, false ],
        [ SendInvite.KEY, false ],
        [ GetAccount.KEY, false ],
    ]);

    static handlers = new Map([
        [ AddEvent.KEY, (content) => (new AddEvent(content)).process() ],
        [ SetEventAttr.KEY, (content) => (new SetEventAttr(content)).process() ],
        [ AddEventAttr.KEY, (content) => (new AddEventAttr(content)).process() ],
        [ AddEventAttrValue.KEY, (content) => (new AddEventAttrValue(content)).process() ],
        [ PutEvent.KEY, (content) => (new PutEvent(content)).process() ],
        [ DeleteEvent.KEY, (content) => (new DeleteEvent(content)).process() ],
        [ AddCalendar.KEY, (content) => (new AddCalendar(content)).process() ],
        [ SetCalendarAttr.KEY, (content) => (new SetCalendarAttr(content)).process() ],
        [ PutCalendar.KEY, (content) => (new PutCalendar(content)).process() ],
        [ DeleteCalendar.KEY, (content) => (new DeleteCalendar(content)).process() ],

        [ GetEvent.KEY, (content) => (new GetEvent(content)).process(ERRORS) ],
        [ GetEvents.KEY, (content) => (new GetEvents(content)).process() ],
        [ GetCalendars.KEY, (content) => (new GetCalendars(content)).process() ],
        [ SendInvite.KEY, (content) => (new SendInvite(content)).process(MAIL) ],
        [ GetAccount.KEY, () => (new GetAccount()).process() ],
    ]);

    constructor() {
        soba.schema.table({
            name : "event",
            insertEvent : AddEvent,
            deleteEvent : DeleteRow,
            columns : [
                {
                    name : "uuid",
                    checks : [
                        {op : "!=", value : null},
                        {op : "typeof", value : "text"},
                        {op : "lww", value : true},
                        {op : "regexp", value : soba.type.uuid.pattern},
                    ],
                },
            ],
        });

        soba.schema.table({
            name : "event_attr_single",
            insertEvent : SetEventAttr,
            deleteEvent : DeleteRow,
            columns : [
                {
                    name : "event",
                    checks : [
                        {op : "!=", value : null},
                        {op : "fk", table : "event", column : "uuid"},
                    ],
                },
                {
                    name : "key",
                    checks : [
                        {op : "!=", value : null},
                        {op : "!=", value : ""},
                        {op : "typeof", value : "text"},
                    ],
                },
                {
                    name : "value",
                    checks : [],
                },
            ],
            checks : [
                {
                    columns : [ "event", "key" ],
                    op : "lww",
                    value : true,
                },
            ],
        });

        soba.schema.table({
            name : "event_attr_multi",
            insertEvent : AddEventAttr,
            deleteEvent : DeleteRow,
            columns : [
                {
                    name : "event",
                    checks : [
                        {op : "!=", value : null},
                        {op : "fk", table : "event", column : "uuid"},
                    ],
                },
                {
                    name : "key",
                    checks : [
                        {op : "!=", value : null},
                        {op : "!=", value : ""},
                        {op : "typeof", value : "text"},
                    ],
                },
            ],
            checks : [
                {
                    columns : [ "event", "key" ],
                    op : "lww",
                    value : true,
                },
            ],
        });

        soba.schema.table({
            name : "event_attr_multi_value",
            insertEvent : AddEventAttrValue,
            deleteEvent : DeleteRow,
            columns : [
                {
                    name : "event",
                    checks : [
                        {op : "!=", value : null},
                        {op : "fk", table : "event", column : "uuid"},
                    ],
                },
                {
                    name : "key",
                    checks : [
                        {op : "!=", value : null},
                        {op : "!=", value : ""},
                        {op : "typeof", value : "text"},
                    ],
                },
                {
                    name : "value",
                    checks : [],
                },
            ],
            checks : [
                {
                    columns : {event : "event", key : "key"},
                    op : "fk",
                    table : "event_attr_multi",
                },
            ],
        });

        // every calendar; the primary one's uuid is the instance id (the module's
        // primary_calendar())
        soba.schema.table({
            name : "calendar",
            insertEvent : AddCalendar,
            deleteEvent : DeleteRow,
            columns : [
                {
                    name : "uuid",
                    checks : [
                        {op : "!=", value : null},
                        {op : "typeof", value : "text"},
                        {op : "lww", value : true},
                        {op : "regexp", value : soba.type.uuid.pattern},
                    ],
                },
            ],
        });

        soba.schema.table({
            name : "calendar_attr",
            insertEvent : SetCalendarAttr,
            deleteEvent : DeleteRow,
            columns : [
                {
                    name : "calendar",
                    checks : [
                        {op : "!=", value : null},
                        {op : "fk", table : "calendar", column : "uuid"},
                    ],
                },
                {
                    name : "key",
                    checks : [
                        {op : "!=", value : null},
                        {op : "!=", value : ""},
                        {op : "typeof", value : "text"},
                    ],
                },
                {
                    name : "value",
                    checks : [],
                },
            ],
            checks : [
                {
                    columns : [ "calendar", "key" ],
                    op : "lww",
                    value : true,
                },
            ],
        });
    }

    process(message, metadata) {
        // mail is read for invitations only: a structured object that arrives by mail is
        // refused, so nobody can write to the calendar by mailing it one
        if (metadata.type === "message") {
            if (metadata.location === "limbo") {
                return;
            }
            if (Message.extractObject(message, metadata)) {
                soba.log.warning("Rejected a structured object delivered by mail");
                return;
            }
            const written = read_invitations(message);
            if (written > 0) {
                soba.log.info(`Wrote ${written} event(s) from mailed invitations`);
            }
            return;
        }

        // otherwise only local deliveries (ui requests, tasks and their replays) may touch
        // the calendar
        if (metadata.type !== "task" && metadata.type !== "task-replay") {
            soba.log.warning(`Rejected non-local delivery of type '${metadata.type}'`);
            return;
        }

        const object = Message.extractObject(message, metadata);
        if (! object) {
            soba.log.debug("Unrecognized content");
            return;
        }

        const key = `{${object.namespace}}${object.name}`;
        const handler = Application.handlers.get(key);
        if (! handler) {
            soba.log.warning(`No handler found for objkey='${key}', ignored`);
            return;
        }

        try {
            handler(object.content);
        }
        catch (e) {
            // a retry can't fix a malformed object; anything else may be fixed by replication
            if (e instanceof MalformedObject) {
                soba.log.error(`Dropped malformed objkey='${key}': ${e.message}`);
                return;
            }
            throw e;
        }
    }
}
