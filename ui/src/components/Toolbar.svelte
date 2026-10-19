<script lang="ts">
    import { useStore } from "../lib/context";
    import {
        agendaRangeLabel,
        longDate,
        monthLabel,
        weekRangeLabel,
    } from "../lib/dates";
    import type { ViewName } from "../lib/types";

    const store = useStore();

    const tabs: { key: ViewName; label: string }[] = [
        { key: "day", label: "Day" },
        { key: "week", label: "Week" },
        { key: "month", label: "Month" },
        { key: "agenda", label: "Agenda" },
    ];

    const rangeLabel = $derived.by(() => {
        if (store.view === "day") return longDate(store.cursor);
        if (store.view === "month") return monthLabel(store.cursor);
        if (store.view === "agenda") return agendaRangeLabel(store.cursor);
        return weekRangeLabel(store.cursor);
    });

    let fileInput = $state<HTMLInputElement>();

    async function onImportFile(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = ""; // so that choosing the same file again is a change too
        if (file) store.openImport(await file.text(), file.name);
    }
</script>

<div class="toolbar">
    <button class="icon-btn new" onclick={() => store.openCreate()}>
        <img src="/icons/toolbar/new.svg" width="26" height="26" alt="" />
        <span>New event</span>
    </button>
    <button
        class="icon-btn"
        title="Download the events of the shown months as an iCalendar file"
        onclick={() => store.exportIcs()}>Export</button
    >
    <button class="icon-btn" onclick={() => fileInput?.click()}>Import</button>
    <input
        bind:this={fileInput}
        class="file"
        type="file"
        accept=".ics,text/calendar"
        aria-label="iCalendar file to import"
        onchange={onImportFile}
    />

    <span class="sep"></span>

    <button class="today" onclick={() => store.goToday()}>Today</button>
    <div class="nav">
        <button aria-label="Previous" onclick={() => store.goPrev()}>‹</button>
        <button aria-label="Next" onclick={() => store.goNext()}>›</button>
    </div>
    <span class="range">{rangeLabel}</span>

    <div class="spacer"></div>

    <div class="tabs">
        {#each tabs as t (t.key)}
            <button
                class:active={store.view === t.key}
                onclick={() => (store.view = t.key)}
            >
                {t.label}
            </button>
        {/each}
    </div>

    <div class="search">
        <img src="/icons/toolbar/search.svg" width="15" height="15" alt="" />
        <input
            value={store.query}
            placeholder="Search events"
            aria-label="Search events"
            title="Searches the shown months"
            oninput={(e) => store.setQuery(e.currentTarget.value)}
            onkeydown={(e) => {
                if (e.key === "Escape") store.setQuery("");
            }}
        />
        {#if store.query}
            <button
                class="clear"
                aria-label="Clear search"
                onclick={() => store.setQuery("")}>×</button
            >
        {/if}
    </div>
    {#if store.matchCount !== null}
        <span class="count" role="status" aria-label="Search results"
            >{store.matchCount > 0
                ? `${store.matchCount} of ${store.visible.length} in view`
                : "no matches in the shown months"}</span
        >
    {/if}
</div>

<style>
    .toolbar {
        height: var(--toolbar-h);
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        background: var(--surface-panel);
        border-bottom: 1px solid var(--border-default);
        flex: none;
    }
    .sep {
        width: 1px;
        height: 26px;
        background: var(--border-default);
        margin: 0 2px;
    }
    button {
        font-family: var(--font-ui);
        cursor: pointer;
    }
    .icon-btn {
        display: flex;
        align-items: center;
        gap: 7px;
        border: none;
        background: none;
        padding: 4px 6px;
        border-radius: var(--radius-sm);
        font-size: 12px;
        color: var(--text-secondary);
        line-height: 1;
    }
    .icon-btn.new span {
        color: var(--text-primary);
    }
    .icon-btn:hover {
        background: var(--surface-hover);
    }
    .file {
        display: none;
    }
    .today {
        border: 2px solid var(--border-strong);
        background: var(--blue-100);
        color: var(--blue-700);
        border-radius: 5px;
        padding: 6px 12px;
        font-size: 12px;
        line-height: 1;
    }
    .today:hover {
        background: var(--blue-200);
    }
    .nav {
        display: flex;
        gap: 2px;
    }
    .nav button {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: none;
        border-radius: 5px;
        font-size: 18px;
        color: var(--text-secondary);
    }
    .nav button:hover {
        background: var(--surface-hover);
    }
    .range {
        font-size: var(--text-lg);
        margin-left: 8px;
        white-space: nowrap;
    }
    .spacer {
        flex: 1;
    }
    .tabs {
        display: flex;
        border: 1.5px solid var(--border-default);
        border-radius: 6px;
        overflow: hidden;
    }
    .tabs button {
        padding: 6px 13px;
        font-size: 12px;
        line-height: 1;
        border: none;
        background: transparent;
        color: var(--text-secondary);
    }
    .tabs button.active {
        background: var(--blue-500);
        color: #fff;
    }
    .search {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #fff;
        border: 1.5px solid var(--border-default);
        border-radius: var(--radius-sm);
        padding: 0 10px;
        width: 180px;
    }
    .search img {
        opacity: 0.8;
    }
    .search input {
        flex: 1;
        border: none;
        outline: none;
        background: transparent;
        font-family: var(--font-ui);
        font-size: var(--text-base);
        padding: 7px 0;
        min-width: 0;
    }
    .search .clear {
        border: none;
        background: none;
        padding: 0 2px;
        font-size: 15px;
        line-height: 1;
        color: var(--text-secondary);
    }
    .count {
        font-size: 12px;
        color: var(--text-secondary);
        white-space: nowrap;
    }
</style>
