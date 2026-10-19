<script lang="ts">
    import { useStore } from "../lib/context";
    import {
        addDays,
        agendaSpan,
        dayGroupLabel,
        parseYmd,
        sameDay,
        today,
        ymd,
    } from "../lib/dates";
    import { fmt } from "../lib/calendar";
    import type { DayPiece } from "../lib/types";

    const store = useStore();

    // The events from the start of the cursor's week to the end of the loaded
    // window, grouped by day; a multi-day event is listed under every day it
    // covers inside that span.
    const span = $derived(agendaSpan(store.cursor));
    const groups = $derived.by(() => {
        const { from, last } = span;
        const t = today();
        const dates = new Set<string>();
        for (const e of store.visible) {
            let d = e.date < from ? parseYmd(from) : parseYmd(e.date);
            const end = e.endDate < last ? e.endDate : last;
            for (; ymd(d) <= end; d = addDays(d, 1)) dates.add(ymd(d));
        }
        return [...dates]
            .sort()
            .map((dateStr) => {
                const d = parseYmd(dateStr);
                return {
                    key: dateStr,
                    label: dayGroupLabel(d),
                    isToday: sameDay(d, t),
                    events: store.eventsOn(dateStr),
                };
            })
            .filter((g) => g.events.length > 0);
    });

    const edgeText = $derived(
        `Nothing before ${dayGroupLabel(parseYmd(span.from))} or after ` +
            `${dayGroupLabel(parseYmd(span.last))} is listed: move the week with ‹ and ›.`,
    );

    function timeLabel(ev: DayPiece): string {
        if (ev.allDay || (ev.s === 0 && ev.e === 24)) return "All day";
        return `${fmt(ev.s)} – ${fmt(ev.e)}`;
    }
</script>

<div class="agenda">
    <div class="inner">
        {#each groups as g (g.key)}
            <div class="group">
                <div class="glabel" class:today={g.isToday}>{g.label}</div>
                {#each g.events as ev (ev.id)}
                    {@const m = store.meta(ev.cal)}
                    <button
                        class="row"
                        class:dim={store.isDimmed(ev.id)}
                        class:invitation={ev.invitation}
                        onclick={() => store.select(ev.id)}
                    >
                        <div class="time">{timeLabel(ev)}</div>
                        <div class="dot" style:background={m.color}></div>
                        <div class="body">
                            <div class="title">
                                {#if ev.invitation}<span class="inv-label">Invitation:</span>{/if}
                                {ev.days > 1
                                    ? `${ev.title} (day ${ev.day} of ${ev.days})`
                                    : ev.title}
                            </div>
                            {#if ev.location}
                                <div class="loc">{ev.location}</div>
                            {/if}
                        </div>
                    </button>
                {/each}
            </div>
            {#if g === groups[groups.length - 1]}
                <div class="edge" role="note" aria-label="Agenda edge">
                    {edgeText}
                </div>
            {/if}
        {:else}
            <div class="empty">
                <div class="empty-title">Nothing coming up</div>
                <div class="empty-sub">
                    Create an event or jump to another week.
                </div>
            </div>
        {/each}
    </div>
</div>

<style>
    .agenda {
        flex: 1;
        overflow-y: auto;
        padding: 18px 24px 40px;
        background: var(--surface-panel);
    }
    .inner {
        max-width: 720px;
        margin: 0 auto;
    }
    .group {
        margin-bottom: 20px;
    }
    .glabel {
        font-size: 13px;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--border-subtle);
        padding-bottom: 6px;
        margin-bottom: 6px;
    }
    .glabel.today {
        color: var(--blue-500);
    }
    .row {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        padding: 9px 8px;
        border-radius: 6px;
        width: 100%;
        text-align: left;
        border: none;
        background: none;
        font-family: var(--font-ui);
        cursor: pointer;
    }
    .row:hover {
        background: var(--surface-hover);
    }
    .row.dim {
        opacity: 0.35;
    }
    /* a mailed invitation: dashed */
    .row.invitation {
        outline: 1px dashed var(--border-strong);
        outline-offset: -1px;
    }
    .inv-label {
        color: var(--text-secondary);
        font-weight: 400;
    }
    .time {
        width: 104px;
        flex: none;
        font-size: 12px;
        color: var(--text-muted);
        padding-top: 2px;
    }
    .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        margin-top: 5px;
        flex: none;
    }
    .body {
        flex: 1;
        min-width: 0;
    }
    .title {
        font-size: 14px;
        color: var(--text-primary);
    }
    .loc {
        font-size: 12px;
        color: var(--text-muted);
        margin-top: 1px;
    }
    .edge {
        text-align: center;
        font-size: 12px;
        color: var(--text-muted);
        border-top: 1px solid var(--border-subtle);
        padding-top: 10px;
    }
    .empty {
        text-align: center;
        padding: 64px 24px;
        color: var(--text-muted);
    }
    .empty-title {
        font-size: 15px;
        color: var(--text-secondary);
    }
    .empty-sub {
        font-size: 13px;
        margin-top: 6px;
    }
</style>
