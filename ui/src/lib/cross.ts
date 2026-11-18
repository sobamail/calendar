// Copied from soba-chat's ui/src/api/cross.ts.
// Cross requests: the page sends an object its own backend does not list to the apps of
// the mailbox that do (amp-mgui doc/pub/ref/cross-requests.md). The host answers the two
// posts itself; neither reaches the Mutator. Their replies carry no body, only a status,
// and the handlers' answers arrive on the event stream as CrossResponse events.
import * as msgpack from "@msgpack/msgpack";

export const NS_BASE = "https://sobamail.com/module/base/v1";
export const CROSS_RESPONSE = `{${NS_BASE}}CrossResponse`;

export type Smc = {
    namespace: string,
    name: string,
    content: object,
};

// one CrossResponse event's content: an answer of one handler instance, or the end of the
// request (`eos`), which carries the id alone
export type CrossAnswer = {
    id: string,
    eos?: boolean,
    appId?: string,
    instanceId?: string,
    object?: Smc&{error?: unknown},
};

export interface CrossTransport {
    // GrantRequest: 200 granted, 401 denied, 404 no app lists the key, 400/500 otherwise
    grant(objectKey: string): Promise<number>;
    // CrossRequest: 202 on its way, 401 no grant, 400/500 otherwise. The answers go out on
    // the event stream, which the store hands over.
    send(id: string, object: Smc): Promise<number>;
}

async function post(name: string, content: object): Promise<number> {
    const response = await fetch("/api/v2/object", {
        method : "POST",
        headers : {"Content-Type" : "application/msgpack"},
        body : msgpack.encode({namespace : NS_BASE, name, content}) as unknown as BodyInit,
    });
    return response.status;
}

export const crossTransport: CrossTransport = {
    grant(objectKey: string): Promise<number> { return post("GrantRequest", {objectKey}); },
    send(id: string, object: Smc): Promise<number> { return post("CrossRequest", {id, object}); },
};
