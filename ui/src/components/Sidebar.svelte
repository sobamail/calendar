<script lang="ts">
    import { useStore } from "../lib/context";
    import { PALETTE, calendarName } from "../lib/data";
    import { dialogFocus } from "../lib/dialog";
    import {
        monthLabel,
        monthMatrix,
        sameDay,
        weekdayHeaders,
        ymd,
    } from "../lib/dates";

    const store = useStore();
    // the store's clock ticks, so "today" moves on past midnight
    const t = $derived(store.now);

    const weeks = $derived(monthMatrix(store.cursor));

    function inMonth(d: Date): boolean {
        return d.getMonth() === store.cursor.getMonth();
    }
    function hasEvents(d: Date): boolean {
        return store.eventsOn(ymd(d)).length > 0;
    }

    // nothing closes the calendar dialog while a save is in flight
    function cancelCalendar() {
        if (!store.saving) store.closeCalendar();
    }
</script>

<svelte:window
    onkeydown={(e) => {
        if (store.showCalendar && e.key === "Escape") cancelCalendar();
    }}
/>

<aside class="sidebar">
    <!-- Mini month -->
    <div class="mini">
        <div class="mini-head">
            <span>{monthLabel(store.cursor)}</span>
            <div class="mini-nav">
                <button aria-label="Previous month" onclick={() => store.setMonth(-1)}
                    >‹</button
                >
                <button aria-label="Next month" onclick={() => store.setMonth(1)}
                    >›</button
                >
            </div>
        </div>
        <div class="mini-grid weekdays">
            {#each weekdayHeaders("narrow") as w, i (i)}
                <div class="wd">{w}</div>
            {/each}
        </div>
        {#each weeks as week, wi (wi)}
            <div class="mini-grid">
                {#each week as d (ymd(d))}
                    <button class="mini-cell" onclick={() => store.goToDay(d)}>
                        <div
                            class="num"
                            class:today={sameDay(d, t)}
                            class:muted={!inMonth(d)}
                            class:sel={sameDay(d, store.cursor) && !sameDay(d, t)}
                        >
                            {d.getDate()}
                        </div>
                        {#if hasEvents(d) && !sameDay(d, t)}
                            <div class="dot"></div>
                        {:else}
                            <div class="dot-spacer"></div>
                        {/if}
                    </button>
                {/each}
            </div>
        {/each}
    </div>

    <!-- Calendars -->
    <div class="cals">
        <div class="cals-label">My calendars</div>
        {#each store.calendars as meta (meta.id)}
            {@const on = store.isShown(meta.id)}
            <div class="cal-line">
                <button
                    class="cal-row"
                    aria-pressed={on}
                    onclick={() => store.toggleCal(meta.id)}
                >
                    <span
                        class="swatch"
                        style:border-color={meta.color}
                        style:background={on ? meta.color : "transparent"}
                    >
                        {#if on}
                            <svg
                                viewBox="0 0 12 12"
                                width="11"
                                height="11"
                                fill="none"
                                aria-hidden="true"
                            >
                                <path
                                    d="M1.5 6.5 4.5 9.5 10.5 2.5"
                                    stroke="#fff"
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        {/if}
                    </span>
                    <span class="cal-name" class:off={!on}>{calendarName(meta)}</span>
                </button>
                <!-- icons are drawn, not set in a font: the bundled font has no ✎ or ＋,
                     and a system font can't be counted on -->
                <button
                    class="cal-edit"
                    aria-label="Edit {calendarName(meta)}"
                    onclick={() => store.openCalendar(meta.id)}
                >
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
                        <path
                            d="M3 13l.8-3.2L11 2.6l2.4 2.4-7.2 7.2zM9.6 4l2.4 2.4"
                            stroke="currentColor"
                            stroke-width="1.4"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </button>
            </div>
        {/each}
        <button class="add-cal" onclick={() => store.openCalendar()}>
            <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
                <path
                    d="M6 1.5v9M1.5 6h9"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                />
            </svg>
            Add calendar
        </button>
    </div>

    {#if store.showCalendar}
        <div
            class="overlay"
            onclick={(e) => {
                if (e.target === e.currentTarget) cancelCalendar();
            }}
            role="presentation"
        >
            <div
                class="card"
                role="dialog"
                aria-label="Calendar form"
                tabindex="-1"
                use:dialogFocus
            >
                <div class="title">
                    {store.editingCalId ? "Edit calendar" : "New calendar"}
                </div>
                <div class="fields">
                    <label class="field">
                        <span>Name</span>
                        <input
                            bind:value={store.calForm.name}
                            placeholder="Name the calendar"
                            data-autofocus
                        />
                    </label>
                    <div class="field">
                        <span id="cal-color-label">Color</span>
                        <div
                            class="palette"
                            role="radiogroup"
                            aria-labelledby="cal-color-label"
                        >
                            {#each PALETTE as p (p.color)}
                                <button
                                    class="pick"
                                    role="radio"
                                    aria-label={p.name}
                                    aria-checked={store.calForm.color === p.color}
                                    style:background={p.color}
                                    onclick={() => (store.calForm.color = p.color)}
                                ></button>
                            {/each}
                        </div>
                    </div>
                    {#if store.calError}
                        <div class="form-error" role="alert">{store.calError}</div>
                    {/if}
                </div>
                <div class="footer">
                    <!-- the primary calendar can't be deleted -->
                    {#if store.editingCalId && store.editingCalId !== store.primaryId}
                        <button
                            class="ghost danger"
                            disabled={store.saving}
                            onclick={() => store.deleteCalendar()}>Delete calendar</button
                        >
                    {/if}
                    <span class="spacer"></span>
                    <button class="ghost" disabled={store.saving} onclick={cancelCalendar}
                        >Cancel</button
                    >
                    <button
                        class="go"
                        disabled={store.saving || !store.calForm.name.trim()}
                        onclick={() => store.saveCalendar()}
                    >
                        {store.editingCalId ? "Save calendar" : "Create calendar"}
                    </button>
                </div>
            </div>
        </div>
    {/if}
</aside>

<style>
    .sidebar {
        width: var(--sidebar-w);
        flex: none;
        background: var(--surface-sidebar);
        border-right: 1px solid var(--border-default);
        display: flex;
        flex-direction: column;
    }
    button {
        font-family: var(--font-ui);
        cursor: pointer;
    }

    .mini {
        padding: 14px 14px 12px;
        border-bottom: 1px solid var(--border-subtle);
    }
    .mini-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: var(--text-base);
    }
    .mini-nav {
        display: flex;
        gap: 2px;
        color: var(--text-muted);
    }
    .mini-nav button {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: none;
        border-radius: 4px;
        color: var(--text-muted);
        font-size: 15px;
    }
    .mini-nav button:hover {
        background: var(--surface-hover);
    }
    .mini-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
    }
    .weekdays {
        margin-bottom: 2px;
    }
    .wd {
        text-align: center;
        font-size: 9px;
        color: var(--text-muted);
        padding-bottom: 2px;
    }
    .mini-cell {
        text-align: center;
        padding: 1px 0;
        border: none;
        background: none;
        border-radius: 5px;
    }
    .mini-cell:hover {
        background: var(--surface-hover);
    }
    .num {
        font-size: 11px;
        line-height: 20px;
        color: var(--text-primary);
    }
    .num.muted {
        color: var(--ink-300);
    }
    .num.today {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--blue-500);
        color: #fff;
        margin: 0 auto;
    }
    .num.sel {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 1.5px solid var(--blue-500);
        color: var(--blue-700);
        margin: 0 auto;
        line-height: 17px;
    }
    .dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--blue-500);
        margin: 0 auto 1px;
    }
    .dot-spacer {
        height: 5px;
    }

    .cals {
        padding: 12px;
        flex: 1;
        overflow: auto;
    }
    .cals-label {
        font-size: var(--text-2xs);
        text-transform: uppercase;
        letter-spacing: var(--tracking-caps);
        color: var(--text-muted);
        margin-bottom: 8px;
        padding-left: 4px;
    }
    .cal-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 4px;
        border-radius: 5px;
        width: 100%;
        border: none;
        background: none;
        text-align: left;
    }
    .cal-row:hover {
        background: var(--surface-hover);
    }
    .cal-line {
        display: flex;
        align-items: center;
    }
    .cal-line .cal-row {
        flex: 1;
        min-width: 0;
    }
    .cal-edit {
        flex: none;
        display: flex;
        border: none;
        background: none;
        border-radius: 5px;
        padding: 5px 6px;
        color: var(--text-muted);
    }
    .cal-edit:hover {
        background: var(--surface-hover);
        color: var(--text-primary);
    }
    .swatch {
        width: 16px;
        height: 16px;
        flex: none;
        border-radius: 4px;
        border: 2px solid;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .cal-name {
        font-size: 13px;
        color: var(--text-primary);
    }
    .cal-name.off {
        color: var(--text-muted);
    }
    .add-cal {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 4px;
        margin-top: 6px;
        color: var(--text-link);
        font-size: var(--text-sm);
        border: none;
        background: none;
    }
    .add-cal svg {
        flex: none;
    }

    /* the calendar dialog, shaped like the event form */
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
        width: 360px;
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
        gap: 14px;
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
    .field input {
        border: 1.5px solid var(--border-default);
        border-radius: 5px;
        padding: 8px;
        font-family: var(--font-ui);
        font-size: 13px;
        color: var(--text-primary);
    }
    .field input:focus {
        outline: none;
        border-color: var(--border-strong);
        box-shadow: var(--focus-ring);
    }
    .palette {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }
    .pick {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 2px solid transparent;
        box-shadow: inset 0 0 0 2px #fff;
    }
    .pick[aria-checked="true"] {
        border-color: var(--text-primary);
    }
    .form-error {
        font-size: 12px;
        color: var(--red-600);
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
    .ghost.danger {
        color: var(--red-600);
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
