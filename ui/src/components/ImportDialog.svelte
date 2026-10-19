<script lang="ts">
    import { useStore } from "../lib/context";
    import { fmt } from "../lib/calendar";
    import { calendarName } from "../lib/data";
    import { longDate, parseYmd } from "../lib/dates";
    import { dialogFocus } from "../lib/dialog";
    import type { ImportedEvent } from "../lib/ics";

    const store = useStore();

    // "Wednesday, July 8, 2026 · 9:30 AM – 11 AM", the end's date only when it differs
    function when(ev: ImportedEvent): string {
        const start = longDate(parseYmd(ev.date));
        const end = ev.endDate !== ev.date ? `${longDate(parseYmd(ev.endDate))} ` : "";
        if (ev.allDay) return end ? `${start} – ${end.trim()} · All day` : `${start} · All day`;
        return end
            ? `${start} ${fmt(ev.s)} – ${end}${fmt(ev.e)}`
            : `${start} · ${fmt(ev.s)} – ${fmt(ev.e)}`;
    }

    function chooseAll(chosen: boolean) {
        for (const r of store.importRows) r.chosen = chosen;
    }

    const started = $derived(store.importTotal > 0);
    const n = $derived(store.importChosen);
    const skipped = $derived.by(() => {
        const k = store.importSkipped;
        return k ? `${k} cancelled or unreadable event${k === 1 ? "" : "s"} skipped` : "";
    });
</script>

<svelte:window
    onkeydown={(e) => {
        if (store.showImport && e.key === "Escape") store.closeImport();
    }}
/>

{#if store.showImport}
    <div
        class="overlay"
        onclick={(e) => {
            if (e.target === e.currentTarget) store.closeImport();
        }}
        role="presentation"
    >
        <div class="card" role="dialog" aria-label="Import events" tabindex="-1" use:dialogFocus>
            <div class="title">Import events</div>
            <div class="fields">
                {#if !started}
                    <div class="bulk">
                        <button class="link" onclick={() => chooseAll(true)}>Tick all</button>
                        <button class="link" onclick={() => chooseAll(false)}>Untick all</button>
                        {#if skipped}
                            <span class="note">{skipped}</span>
                        {/if}
                    </div>
                    <ul class="rows">
                        {#each store.importRows as row, i (i)}
                            <li>
                                <label>
                                    <input type="checkbox" bind:checked={row.chosen} />
                                    <span class="what">
                                        <span class="name">{row.event.title || "(No title)"}</span>
                                        <span class="when">{when(row.event)}</span>
                                    </span>
                                </label>
                            </li>
                        {/each}
                    </ul>
                    <label class="field">
                        <span>Into calendar</span>
                        <select bind:value={store.importCal} data-autofocus>
                            {#each store.calendars as meta (meta.id)}
                                <option value={meta.id}>{calendarName(meta)}</option>
                            {/each}
                        </select>
                    </label>
                {:else}
                    <progress
                        aria-label="Import progress"
                        max={store.importTotal}
                        value={store.importDone}
                    ></progress>
                    <div class="note" role="status">
                        {store.importStatus ||
                            `Importing ${store.importDone} of ${store.importTotal}…`}
                    </div>
                {/if}
            </div>
            <div class="footer">
                <span class="spacer"></span>
                {#if store.importRunning}
                    <button class="ghost" onclick={() => store.stopImport()}>Stop</button>
                {:else if started}
                    <button class="go" onclick={() => store.closeImport()}>Close</button>
                {:else}
                    <button class="ghost" onclick={() => store.closeImport()}>Cancel</button>
                    <button class="go" disabled={n === 0} onclick={() => store.runImport()}
                        >Import {n} event{n === 1 ? "" : "s"}</button
                    >
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    button {
        font-family: var(--font-ui);
        cursor: pointer;
    }
    .overlay {
        position: fixed;
        inset: 0;
        background: rgba(20, 40, 80, 0.28);
        z-index: 51;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .card {
        width: 440px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        background: #fff;
        border-radius: 12px;
        box-shadow: var(--shadow-pop);
    }
    .card:focus {
        outline: none;
    }
    .title {
        padding: 18px 22px 6px;
        font-size: 18px;
    }
    .fields {
        padding: 8px 22px 18px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 0;
    }
    .bulk {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .link {
        border: none;
        background: none;
        padding: 0;
        font-size: 12px;
        color: var(--blue-700);
    }
    .note {
        font-size: 12px;
        color: var(--text-secondary);
    }
    .rows {
        list-style: none;
        margin: 0;
        padding: 0;
        overflow-y: auto;
        max-height: 40vh;
        border: 1px solid var(--border-subtle);
        border-radius: 5px;
    }
    .rows li + li {
        border-top: 1px solid var(--border-subtle);
    }
    .rows label {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 7px 10px;
        cursor: pointer;
    }
    .what {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }
    .name {
        font-size: 13px;
    }
    .when {
        font-size: 11px;
        color: var(--text-secondary);
    }
    .field {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }
    .field > span {
        font-size: 11px;
        color: var(--text-secondary);
    }
    .field select {
        border: 1.5px solid var(--border-default);
        border-radius: 5px;
        padding: 7px;
        font-family: var(--font-ui);
        font-size: 13px;
    }
    progress {
        width: 100%;
    }
    .footer {
        padding: 12px 22px;
        border-top: 1px solid var(--border-subtle);
        display: flex;
        gap: 8px;
    }
    .spacer {
        flex: 1;
    }
    .ghost {
        border: none;
        background: none;
        color: var(--text-secondary);
        border-radius: 5px;
        padding: 9px 14px;
        font-size: 13px;
    }
    .ghost:hover {
        background: var(--surface-hover);
    }
    .go {
        border: none;
        background: var(--green-500);
        color: #fff;
        border-radius: 5px;
        padding: 9px 18px;
        font-size: 13px;
    }
    .go:hover {
        background: var(--green-600);
    }
    button:disabled {
        opacity: 0.6;
        cursor: default;
    }
</style>
