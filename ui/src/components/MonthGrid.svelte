<script lang="ts">
    import { useStore } from "../lib/context";
    import { tint } from "../lib/calendar";
    import { monthMatrix, sameDay, weekdayHeaders, ymd } from "../lib/dates";

    const store = useStore();
    // the store's clock ticks, so "today" moves on past midnight
    const t = $derived(store.now);

    const weeks = $derived(monthMatrix(store.cursor));

    function inMonth(d: Date): boolean {
        return d.getMonth() === store.cursor.getMonth();
    }
</script>

<div class="month">
    <div class="heads">
        {#each weekdayHeaders("short") as w, i (i)}
            <div class="head">{w}</div>
        {/each}
    </div>
    <div class="weeks">
        {#each weeks as week, wi (wi)}
            <div class="week">
                {#each week as d (ymd(d))}
                    {@const evs = store.eventsOn(ymd(d))}
                    <!-- a click on the cell's empty space creates on that day -->
                    <div
                        class="cell"
                        class:today={sameDay(d, t)}
                        class:out={!inMonth(d)}
                        data-date={ymd(d)}
                        role="presentation"
                        onclick={() => store.openCreate(ymd(d))}
                    >
                        <button
                            class="num"
                            class:today={sameDay(d, t)}
                            class:muted={!inMonth(d)}
                            onclick={(e) => {
                                e.stopPropagation();
                                store.goToDay(d);
                            }}
                        >
                            {d.getDate()}
                        </button>
                        {#each evs.slice(0, 3) as ev (ev.id)}
                            {@const m = store.meta(ev.cal)}
                            <button
                                class="chip"
                                class:dim={store.isDimmed(ev.id)}
                                class:invitation={ev.invitation}
                                class:from-before={ev.day > 1}
                                class:to-after={ev.day < ev.days}
                                title={ev.invitation ? "Invitation" : undefined}
                                style:background={tint(m.color)}
                                style:color={m.deep}
                                style:border-left="2px {ev.invitation ? 'dashed' : 'solid'} {m.color}"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    store.select(ev.id);
                                }}
                            >
                                {ev.title}
                            </button>
                        {/each}
                        {#if evs.length > 3}
                            <button
                                class="more"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    store.goToDay(d);
                                }}>+{evs.length - 3} more</button
                            >
                        {/if}
                    </div>
                {/each}
            </div>
        {/each}
    </div>
</div>

<style>
    .month {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--surface-panel);
    }
    button {
        font-family: var(--font-ui);
        cursor: pointer;
    }
    .heads {
        display: flex;
        border-bottom: 1px solid var(--border-default);
        flex: none;
    }
    .head {
        flex: 1;
        text-align: center;
        padding: 7px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-muted);
        border-left: 1px solid var(--border-subtle);
    }
    .weeks {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }
    .week {
        flex: 1;
        display: flex;
        border-bottom: 1px solid var(--border-subtle);
        min-height: 0;
    }
    .cell {
        flex: 1;
        min-width: 0;
        border-left: 1px solid var(--border-subtle);
        padding: 4px;
        overflow: hidden;
        background: #fff;
    }
    .cell.out {
        background: var(--surface-app);
    }
    .cell.today {
        background: color-mix(in srgb, var(--blue-500) 7%, #fff);
    }
    .num {
        font-size: 12px;
        padding: 2px 4px 3px;
        color: var(--text-primary);
        border: none;
        background: none;
        display: block;
        text-align: left;
    }
    .num:hover {
        color: var(--text-link);
    }
    .num.muted {
        color: var(--ink-300);
    }
    .num.today {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--blue-500);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin-bottom: 3px;
    }
    .num.today:hover {
        color: #fff;
    }
    .chip {
        display: block;
        width: 100%;
        text-align: left;
        border: none;
        font-size: 10px;
        line-height: 1.35;
        padding: 1px 5px;
        border-radius: 3px;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    /* a span's chips run on across the cells: flat, borderless at the joins */
    .chip.from-before {
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
        border-left-color: transparent !important;
        margin-left: -4px;
        width: calc(100% + 4px);
    }
    .chip.to-after {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
        margin-right: -4px;
        width: calc(100% + 4px);
    }
    .chip.from-before.to-after {
        width: calc(100% + 8px);
    }
    .chip.dim {
        opacity: 0.35;
    }
    /* a mailed invitation: dashed, the label only in the title, for want of room */
    .chip.invitation {
        outline: 1px dashed currentColor;
        outline-offset: -1px;
    }
    .more {
        font-size: 10px;
        color: var(--text-muted);
        padding: 0 0 0 5px;
        border: none;
        background: none;
    }
    .more:hover {
        color: var(--text-link);
    }
</style>
