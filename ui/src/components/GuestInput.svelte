<script lang="ts">
    // A guest's address field that suggests from the contacts app as the user types; adapted
    // from soba-chat's ui/src/lib/AddressInput.svelte. exclude: the addresses not to suggest
    // (the event's other guests).
    import type { Contact, ContactDirectory } from "../lib/contacts.svelte";
    import { is_email } from "../lib/email";
    import Avatar from "./Avatar.svelte";

    let {
        value = $bindable(""),
        contacts,
        exclude = [],
        label,
        invalid = false,
    }: {
        value?: string;
        contacts: ContactDirectory;
        exclude?: string[];
        label: string;
        invalid?: boolean;
    } = $props();

    // a lookup per pause in the typing, not per keystroke
    const DEBOUNCE_MSEC = 150;
    const SHOWN = 8;

    // The list is laid out against the window (position: fixed), not inside the form's card,
    // which scrolls and would clip it: below the field, as wide, its height capped so its
    // bottom end stays EDGE px clear of the window's bottom edge. When less than ROOM is left
    // below and more is above, it opens above the field instead.
    const GAP = 4;
    const EDGE = 8;
    const ROOM = 160;
    const MAX_HEIGHT = 220;

    let input: HTMLInputElement | undefined = $state();
    let place = $state({ left: 0, width: 0, top: null as number | null, bottom: null as number | null, max: MAX_HEIGHT });

    function placeList() {
        if (!input) return;
        const r = input.getBoundingClientRect();
        const vh = window.innerHeight;
        const below = vh - r.bottom - GAP - EDGE;
        const above = r.top - GAP - EDGE;
        if (below >= ROOM || below >= above) {
            place = { left: r.left, width: r.width, top: r.bottom + GAP, bottom: null, max: Math.min(MAX_HEIGHT, below) };
        } else {
            place = { left: r.left, width: r.width, top: null, bottom: vh - r.top + GAP, max: Math.min(MAX_HEIGHT, above) };
        }
    }

    const listId = `guest-${Math.random().toString(36).slice(2, 10)}`;

    let found: Contact[] = $state([]);
    let open = $state(false);
    let active = $state(-1);
    let timer: ReturnType<typeof setTimeout> | undefined;

    const token = $derived(value.trim());
    const shown = $derived.by(() => {
        const skip = new Set(exclude.map((a) => a.trim().toLowerCase()));
        return found.filter((c) => !skip.has(c.email)).slice(0, SHOWN);
    });
    // the host's banner is up, asking the user to let us read the contacts
    const asking = $derived(open && contacts.access === "asking" && token.length > 0);
    const expanded = $derived((open && shown.length > 0) || asking);

    // while the list shows, it follows the field: the card scrolling (a scroll does not
    // bubble, so the window hears it in the capture phase) and the window resizing
    $effect(() => {
        if (!expanded) return;
        placeList();
        window.addEventListener("scroll", placeList, true);
        window.addEventListener("resize", placeList);
        return () => {
            window.removeEventListener("scroll", placeList, true);
            window.removeEventListener("resize", placeList);
        };
    });

    function close() {
        clearTimeout(timer);
        timer = undefined;
        open = false;
        active = -1;
    }

    function lookup() {
        clearTimeout(timer);
        const q = token;
        // a whole address is typed out: nothing to complete
        if (!q || is_email(q) || !contacts.available) {
            found = [];
            close();
            return;
        }
        open = true;
        timer = setTimeout(async () => {
            timer = undefined;
            const got = await contacts.find(q);
            if (got === null || q !== token) return;
            found = got;
            active = 0;
        }, DEBOUNCE_MSEC);
    }

    function pick(c: Contact) {
        value = c.email;
        found = [];
        close();
    }

    function onKey(e: KeyboardEvent) {
        if (expanded && shown.length > 0) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : -1;
                active = (active + step + shown.length) % shown.length;
                return;
            }
            if ((e.key === "Enter" || e.key === "Tab") && active >= 0 && active < shown.length) {
                e.preventDefault();
                e.stopPropagation();
                pick(shown[active]);
                return;
            }
        }
        if (expanded && e.key === "Escape") {
            // the list closes; the form around it stays
            e.stopPropagation();
            close();
        }
    }
</script>

<span class="complete">
    <input
        type="email"
        bind:this={input}
        bind:value
        placeholder="name@example.com"
        aria-label={label}
        aria-invalid={invalid}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 && active < shown.length
            ? `${listId}-${active}`
            : undefined}
        autocomplete="off"
        oninput={lookup}
        onkeydown={onKey}
        onblur={close}
    />
    {#if expanded}
        <ul
            class="list"
            id={listId}
            role="listbox"
            aria-label="Contacts"
            style:position="fixed"
            style:left="{place.left}px"
            style:width="{place.width}px"
            style:top={place.top === null ? null : `${place.top}px`}
            style:bottom={place.bottom === null ? null : `${place.bottom}px`}
            style:max-height="{place.max}px"
        >
            {#if asking}
                <li class="note">
                    Allow Calendar to read your contacts, in the bar above, to see suggestions.
                </li>
            {/if}
            {#each shown as c, i (c.email)}
                <li
                    id="{listId}-{i}"
                    class="option"
                    class:active={i === active}
                    role="option"
                    aria-selected={i === active}
                    onmousedown={(e) => {
                        // the input keeps the focus, so the list is there for the click
                        e.preventDefault();
                        pick(c);
                    }}
                    onmouseenter={() => (active = i)}
                >
                    <Avatar name={c.name || c.email} size={24} />
                    <span class="who">
                        {#if c.name}
                            <span class="name">{c.name}</span>
                        {/if}
                        <span class="addr">{c.email}</span>
                    </span>
                </li>
            {/each}
        </ul>
    {/if}
</span>

<style>
    .complete {
        position: relative;
        flex: 1;
        min-width: 0;
        display: flex;
    }
    input {
        width: 100%;
        border: 1.5px solid var(--border-default);
        border-radius: 5px;
        padding: 8px;
        font-family: var(--font-ui);
        font-size: 13px;
        background: #fff;
        color: var(--text-primary);
        box-sizing: border-box;
    }
    input:focus {
        outline: none;
        border-color: var(--border-strong);
        box-shadow: var(--focus-ring);
    }
    input[aria-invalid="true"] {
        border-color: var(--red-400);
    }
    .list {
        /* placed against the window by placeList(), above the form's overlay (z-index 51) */
        z-index: 52;
        box-sizing: border-box;
        margin: 0;
        padding: 4px;
        list-style: none;
        background: #fff;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        box-shadow: var(--shadow-pop);
        overflow-y: auto;
    }
    .option {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 6px;
        border-radius: 6px;
        cursor: pointer;
    }
    .option.active {
        background: var(--surface-hover);
    }
    .who {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
    }
    .name,
    .addr {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .name {
        font-size: 13px;
        color: var(--text-primary);
    }
    .addr {
        font-size: 11px;
        color: var(--text-secondary);
    }
    .note {
        font-size: 12px;
        color: var(--text-secondary);
        padding: 6px;
    }
</style>
