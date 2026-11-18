<script lang="ts">
    import { useStore } from "../lib/context";
    import { agendaSpan, dayGroupLabel, parseYmd, sameDay, ymd } from "../lib/dates";
    import { fmt } from "../lib/calendar";
    import { event_fragment, narrow, open_full } from "../lib/fragment";
    import type { DayPiece } from "../lib/types";

    const store = useStore();

    // The sidebar's agenda: the cursor's day to the end of the loaded window,
    // one line per event; what doesn't fit the line is elided.
    const groups = $derived.by(() => {
        const t = store.now;
        return store.agendaDays(ymd(store.cursor), agendaSpan(store.cursor).last).map((g) => {
            const d = parseYmd(g.date);
            return {
                key: g.date,
                label: dayGroupLabel(d),
                isToday: sameDay(d, t),
                events: g.events,
            };
        });
    });

    function timeLabel(ev: DayPiece): string {
        if (ev.allDay || (ev.s === 0 && ev.e === 24)) return "All day";
        return fmt(ev.s);
    }
    function titleOf(ev: DayPiece): string {
        return ev.days > 1 ? `${ev.title} (day ${ev.day} of ${ev.days})` : ev.title;
    }
</script>

<section class="summary" aria-label="Agenda summary">
    {#each groups as g (g.key)}
        <div class="day" class:today={g.isToday}>{g.label}</div>
        {#each g.events as ev (ev.id)}
            {@const m = store.meta(ev.cal)}
            {@const text = titleOf(ev)}
            <button
                class="line"
                class:dim={store.isDimmed(ev.id)}
                class:invitation={ev.invitation}
                title="{timeLabel(ev)} {text}"
                onclick={() => {
                    // the narrow view has no room for the event: the full app, on it
                    if (narrow()) open_full(event_fragment(g.key, ev.id));
                    else store.select(ev.id);
                }}
            >
                <span class="dot" style:background={m.color}></span>
                <span class="time">{timeLabel(ev)}</span>
                <span class="text">{text}</span>
            </button>
        {/each}
    {:else}
        <div class="empty">Nothing coming up</div>
    {/each}
</section>

<style>
    .summary {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 10px 12px 16px;
    }
    .day {
        font-size: var(--text-2xs);
        text-transform: uppercase;
        letter-spacing: var(--tracking-caps);
        color: var(--text-muted);
        padding: 8px 4px 3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .day:first-child {
        padding-top: 0;
    }
    .day.today {
        color: var(--blue-500);
    }
    .line {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 3px 4px;
        border: none;
        border-radius: 4px;
        background: none;
        font-family: var(--font-ui);
        font-size: 12px;
        line-height: 16px;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        cursor: pointer;
    }
    .line:hover {
        background: var(--surface-hover);
    }
    .line.dim {
        opacity: 0.35;
    }
    /* a mailed invitation: dashed, as in the agenda */
    .line.invitation {
        outline: 1px dashed var(--border-strong);
        outline-offset: -1px;
    }
    .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex: none;
    }
    .time {
        flex: none;
        color: var(--text-muted);
        font-variant-numeric: tabular-nums;
    }
    .text {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--text-primary);
    }
    .empty {
        font-size: 12px;
        color: var(--text-muted);
        padding: 4px;
    }
</style>
