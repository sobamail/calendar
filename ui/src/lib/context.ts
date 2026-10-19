import {getContext, setContext} from "svelte";

import {CalendarStore} from "./store.svelte";

const KEY = Symbol("calendar-store");

export function provideStore(store: CalendarStore): void { setContext(KEY, store); }

export function useStore(): CalendarStore { return getContext(KEY) as CalendarStore; }
