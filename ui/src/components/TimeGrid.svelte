<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { useStore } from "../lib/context";
    import { H0, H1, HOUR_PX, SCROLL_HOUR } from "../lib/data";
    import { sameDay, weekDays, weekdayShort, ymd } from "../lib/dates";
    import { columnAt, fmt, tint, layoutDay, slotAt } from "../lib/calendar";

    const store = useStore();

    const gridHeight = (H1 - H0) * HOUR_PX;

    // The grid covers the whole day; open it on the working hours.
    let scroller: HTMLDivElement;
    onMount(() => {
        scroller.scrollTop = (SCROLL_HOUR - H0) * HOUR_PX;
    });

    const gutter = $derived.by(() => {
        const rows: { hour: number; label: string }[] = [];
        for (let h = H0; h <= H1; h++) rows.push({ hour: h, label: fmt(h) });
        return rows;
    });

    const columns = $derived.by(() => {
        const dates = store.view === "day" ? [store.cursor] : weekDays(store.cursor);
        return dates.map((d) => {
            const dayEvents = store.eventsOn(ymd(d));
            const timed = layoutDay(dayEvents.filter((e) => !e.allDay));
            const allDay = dayEvents.filter((e) => e.allDay);
            return { date: d, isToday: sameDay(d, store.now), timed, allDay };
        });
    });

    const nowHour = $derived(
        store.now.getHours() + store.now.getMinutes() / 60,
    );
    const showNow = $derived(nowHour >= H0 && nowHour <= H1);

    /** Open the create form on `date` at the half hour under the pointer. */
    function createAt(e: MouseEvent, date: Date) {
        const top = (e.currentTarget as HTMLElement).getBoundingClientRect().top;
        store.openCreate(ymd(date), slotAt(e.clientY - top));
    }

    // ---- Dragging: whole days across the columns, quarter hours down them ----------
    // A block moves the event; the handle on its bottom edge moves its end. The store
    // shows the event where it would land (snapped); the release saves it. The pointer
    // is followed on window: the grabbed block is re-rendered in another column as the
    // event moves there.

    let root: HTMLDivElement;
    /** The press under way: what it drags, where it went down, and whether it has moved. */
    let press: {
        id: string;
        allDay: boolean;
        resize: boolean;
        x: number;
        y: number;
        col: number;
        top: number;
        dragging: boolean;
    } | null = null;
    /** What a drag under way does, for the cursor. */
    let dragging = $state<"" | "move" | "resize">("");

    /** The columns of a lane, left to right. */
    function lane(allDay: boolean): DOMRect[] {
        return [...root.querySelectorAll(allDay ? ".all-day-col" : ".day-col")].map((c) =>
            c.getBoundingClientRect(),
        );
    }

    function grab(e: PointerEvent, id: string, allDay: boolean, resize = false) {
        // an event organized by someone else stays put; a press on it is just a click
        if (e.button !== 0 || store.saving || !store.movable(id)) return;
        // the handle is inside the block: one press, not two
        e.stopPropagation();
        const cols = lane(allDay);
        press = {
            id,
            allDay,
            resize,
            x: e.clientX,
            y: e.clientY,
            col: columnAt(e.clientX, cols),
            top: cols[0]?.top ?? 0,
            dragging: false,
        };
        window.addEventListener("pointermove", follow);
        window.addEventListener("pointerup", drop);
        window.addEventListener("pointercancel", cancel);
    }

    function follow(e: PointerEvent) {
        if (!press) return;
        // the button came up where we didn't see it: the drag is over, undone
        if ((e.buttons & 1) === 0) {
            cancel();
            return;
        }
        // a press that hardly moves stays a click
        if (!press.dragging && Math.abs(e.clientX - press.x) < 4 && Math.abs(e.clientY - press.y) < 4)
            return;
        if (!press.dragging) {
            // from here on the pointer's events come here even from outside the window,
            // so a release out there ends the drag. On the root, which isn't re-rendered
            // as the event moves; not before, or a plain click wouldn't reach the block.
            try {
                root.setPointerCapture(e.pointerId);
            } catch {
                // the pointer is gone already; the buttons check above still holds
            }
        }
        press.dragging = true;
        dragging = press.resize ? "resize" : "move";
        const cols = lane(press.allDay);
        // against the columns' top, which moves when the grid scrolls
        const hours = press.allDay
            ? 0
            : (e.clientY - (cols[0]?.top ?? 0) - (press.y - press.top)) / HOUR_PX;
        if (press.resize) store.resizeTo(press.id, hours);
        else store.dragTo(press.id, columnAt(e.clientX, cols) - press.col, hours);
    }

    /** End the press; true when it was a drag. */
    function release(): boolean {
        window.removeEventListener("pointermove", follow);
        window.removeEventListener("pointerup", drop);
        window.removeEventListener("pointercancel", cancel);
        const was = press?.dragging ?? false;
        press = null;
        dragging = "";
        return was;
    }

    function drop() {
        if (!release()) return;
        // the click the release makes must not open the event or the create form
        const swallow = (e: Event) => e.stopPropagation();
        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", swallow, { capture: true }));
        store.dragDrop();
    }

    function cancel() {
        if (release()) store.dragCancel();
    }

    onDestroy(cancel);
</script>

<svelte:window
    onkeydown={(e) => {
        if (e.key === "Escape") cancel();
    }}
/>

<div
    class="grid-view"
    class:dragging={dragging === "move"}
    class:resizing={dragging === "resize"}
    bind:this={root}
>
    <!-- Column headers -->
    <div class="col-heads">
        <div class="gutter-pad"></div>
        {#each columns as col (ymd(col.date))}
            <div class="col-head">
                <div class="wd" class:today={col.isToday}>
                    {weekdayShort(col.date)}
                </div>
                <div class="dn" class:today={col.isToday}>
                    {col.date.getDate()}
                </div>
            </div>
        {/each}
    </div>

    <!-- All-day lane -->
    <div class="all-day">
        <div class="gutter-pad label">all-day</div>
        {#each columns as col (ymd(col.date))}
            <div class="all-day-col">
                {#each col.allDay as ev (ev.id)}
                    {@const m = store.meta(ev.cal)}
                    <button
                        class="all-day-chip"
                        class:dim={store.isDimmed(ev.id)}
                        class:invitation={ev.invitation}
                        class:moving={store.moving?.id === ev.id}
                        class:from-before={ev.day > 1}
                        class:to-after={ev.day < ev.days}
                        style:background={tint(m.color)}
                        style:color={m.deep}
                        style:border-left="3px {ev.invitation ? 'dashed' : 'solid'} {m.color}"
                        onpointerdown={(e) => grab(e, ev.id, true)}
                        onclick={() => store.select(ev.id)}
                    >
                        {#if ev.invitation}<span class="inv-label">Invitation:</span>{/if}
                        {ev.title}
                    </button>
                {/each}
            </div>
        {/each}
    </div>

    <!-- Scrolling grid -->
    <div class="scroll" bind:this={scroller}>
        <div class="grid-body">
            <div class="gutter" style:height="{gridHeight}px">
                {#each gutter as g (g.hour)}
                    <div
                        class="hour-label"
                        style:top="{(g.hour - H0) * HOUR_PX}px"
                    >
                        {g.label}
                    </div>
                {/each}
            </div>

            {#each columns as col (ymd(col.date))}
                <!-- a click on an empty slot creates there; keyboard users have New event -->
                <div
                    class="day-col"
                    data-date={ymd(col.date)}
                    role="presentation"
                    onclick={(e) => createAt(e, col.date)}
                    style:height="{gridHeight}px"
                    style:background-image="repeating-linear-gradient(to bottom,
                    var(--border-subtle), var(--border-subtle) 1px, transparent
                    1px, transparent {HOUR_PX}px)"
                >
                    {#each col.timed as ev (ev.id)}
                        {@const m = store.meta(ev.cal)}
                        {@const top = (ev.s - H0) * HOUR_PX}
                        {@const h = (ev.e - ev.s) * HOUR_PX}
                        <button
                            class="event"
                            class:dim={store.isDimmed(ev.id)}
                            class:invitation={ev.invitation}
                            class:moving={store.moving?.id === ev.id}
                            style:left="calc({(ev.lane / ev.lanes) * 100}% +
                            2px)"
                            style:width="calc({100 / ev.lanes}% - 4px)"
                            style:top="{top}px"
                            style:height="{Math.max(h - 2, 15)}px"
                            style:background={tint(m.color)}
                            style:border-left="3px {ev.invitation ? 'dashed' : 'solid'} {m.color}"
                            style:color={m.deep}
                            onpointerdown={(e) => grab(e, ev.id, false)}
                            onclick={(e) => {
                                e.stopPropagation();
                                store.select(ev.id);
                            }}
                        >
                            <div class="ev-title">
                                {#if ev.invitation}<span class="inv-label">Invitation:</span>{/if}
                                {ev.title}
                            </div>
                            {#if h >= 34}
                                <div class="ev-time">
                                    {fmt(ev.s)} – {fmt(ev.e)}
                                </div>
                            {/if}
                            {#if ev.day === ev.days && store.movable(ev.id)}
                                <!-- the end's handle, on the day the event ends -->
                                <span
                                    class="resize"
                                    aria-hidden="true"
                                    onpointerdown={(e) => grab(e, ev.id, false, true)}
                                ></span>
                            {/if}
                        </button>
                    {/each}

                    {#if col.isToday && showNow}
                        <div
                            class="now-line"
                            style:top="{(nowHour - H0) * HOUR_PX}px"
                        >
                            <div class="now-dot"></div>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
    .grid-view {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }
    button {
        font-family: var(--font-ui);
        cursor: pointer;
    }
    .gutter-pad {
        width: 56px;
        flex: none;
    }

    /* the rows above the grid keep a gutter as wide as the grid's scrollbar, so their
       columns line up with the grid's */
    .col-heads,
    .all-day {
        overflow: hidden;
        scrollbar-gutter: stable;
    }
    .col-heads {
        display: flex;
        border-bottom: 1px solid var(--border-default);
        background: var(--surface-panel);
        flex: none;
    }
    .col-head {
        flex: 1;
        min-width: 0;
        text-align: center;
        padding: 7px 2px 6px;
        border-left: 1px solid var(--border-subtle);
    }
    .wd {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-muted);
    }
    .wd.today {
        color: var(--blue-500);
    }
    .dn {
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        color: var(--text-primary);
        margin: 3px auto 0;
    }
    .dn.today {
        width: 28px;
        border-radius: 50%;
        background: var(--blue-500);
        color: #fff;
    }

    .all-day {
        display: flex;
        border-bottom: 1px solid var(--border-default);
        background: var(--surface-app);
        flex: none;
        min-height: 26px;
    }
    .all-day .label {
        display: flex;
        align-items: flex-start;
        justify-content: flex-end;
        padding: 5px 8px 0 0;
        font-size: 10px;
        color: var(--text-muted);
    }
    .all-day-col {
        flex: 1;
        min-width: 0;
        padding: 3px;
        border-left: 1px solid var(--border-subtle);
    }
    .all-day-chip {
        display: block;
        width: 100%;
        text-align: left;
        border: none;
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 11px;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    /* a span's chips run on across the columns: flat, borderless at the joins */
    .all-day-chip.from-before {
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
        border-left-color: transparent !important;
        margin-left: -3px;
        width: calc(100% + 3px);
    }
    .all-day-chip.to-after {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
        margin-right: -3px;
        width: calc(100% + 3px);
    }
    .all-day-chip.from-before.to-after {
        width: calc(100% + 6px);
    }

    .scroll {
        flex: 1;
        overflow-y: auto;
        scrollbar-gutter: stable;
        background: var(--surface-panel);
    }
    .grid-body {
        display: flex;
        padding-top: 10px;
        padding-bottom: 28px;
    }
    .gutter {
        width: 56px;
        flex: none;
        position: relative;
    }
    .hour-label {
        position: absolute;
        right: 8px;
        transform: translateY(-50%);
        font-size: 10px;
        color: var(--text-muted);
        white-space: nowrap;
    }
    .day-col {
        flex: 1;
        min-width: 0;
        position: relative;
        border-left: 1px solid var(--border-subtle);
    }
    .event {
        position: absolute;
        box-sizing: border-box;
        border: none;
        border-radius: 5px;
        padding: 2px 6px;
        overflow: hidden;
        font-size: 11px;
        line-height: 1.2;
        box-shadow: var(--shadow-xs);
        z-index: 2;
        text-align: left;
    }
    .event:hover {
        filter: brightness(0.96);
    }
    /* a press on an event may become a drag: no scrolling or text selection from it */
    .event,
    .all-day-chip {
        touch-action: none;
        user-select: none;
    }
    .event.moving,
    .all-day-chip.moving {
        box-shadow: var(--shadow-pop);
        z-index: 5;
    }
    .dragging,
    .dragging * {
        cursor: grabbing;
        user-select: none;
    }
    .resize {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 6px;
        cursor: ns-resize;
    }
    .resizing,
    .resizing * {
        cursor: ns-resize;
        user-select: none;
    }
    .event.dim,
    .all-day-chip.dim {
        opacity: 0.35;
        box-shadow: none;
    }
    /* a mailed invitation, not answered (replies are out of scope): dashed */
    .event.invitation,
    .all-day-chip.invitation {
        outline: 1px dashed currentColor;
        outline-offset: -1px;
    }
    .inv-label {
        font-weight: 400;
        opacity: 0.8;
    }
    .ev-title {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .ev-time {
        opacity: 0.7;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .now-line {
        position: absolute;
        left: 0;
        right: 0;
        height: 0;
        border-top: 2px solid #ff3607;
        z-index: 4;
    }
    .now-dot {
        position: absolute;
        left: -4px;
        top: -4px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ff3607;
    }
</style>
