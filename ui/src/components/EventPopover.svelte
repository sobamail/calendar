<script lang="ts">
    import { useStore } from "../lib/context";
    import { fmt } from "../lib/calendar";
    import { calendarName } from "../lib/data";
    import { localZone, longDate, parseYmd } from "../lib/dates";
    import { dialogFocus } from "../lib/dialog";
    import Avatar from "./Avatar.svelte";

    const store = useStore();
    const ev = $derived(store.selected);
    const meta = $derived(ev ? store.meta(ev.cal) : null);

    // Delete asks first; the question belongs to the event it was asked for
    let confirmingId = $state<string | null>(null);
    const confirming = $derived(ev !== null && confirmingId === ev.id);

    const dateLabel = $derived.by(() => {
        if (!ev) return "";
        const base = longDate(parseYmd(ev.date));
        if (ev.endDate !== ev.date) {
            const end = longDate(parseYmd(ev.endDate));
            return ev.allDay
                ? `${base} – ${end} · All day`
                : `${base}, ${fmt(ev.s)} – ${end}, ${fmt(ev.e)}`;
        }
        return ev.allDay
            ? `${base} · All day`
            : `${base} · ${fmt(ev.s)} – ${fmt(ev.e)}`;
    });
</script>

<svelte:window
    onkeydown={(e) => {
        if (!ev || e.key !== "Escape") return;
        if (confirming) confirmingId = null;
        else store.closePopover();
    }}
/>

{#if ev && meta}
    <div
        class="overlay"
        onclick={(e) => {
            if (e.target === e.currentTarget) store.closePopover();
        }}
        role="presentation"
    >
        <div
            class="card"
            role="dialog"
            aria-label={ev.title}
            tabindex="-1"
            use:dialogFocus
        >
            <div class="bar" style:background={meta.color}></div>
            <div class="content">
                <div class="cal">
                    <span class="dot" style:background={meta.color}></span>
                    <span class="cal-name">{calendarName(meta)}</span>
                </div>
                <h2>{ev.title}</h2>
                {#if ev.invitation}
                    <div class="meta invitation">
                        Invitation{ev.organizer ? ` from ${ev.organizer}` : ""}
                    </div>
                {/if}
                <div class="meta">{dateLabel}</div>
                {#if ev.tz && !ev.allDay && ev.tz !== localZone()}
                    <div class="meta">Scheduled in {ev.tz}</div>
                {/if}
                {#if ev.location}
                    <div class="meta">{ev.location}</div>
                {/if}
                {#if ev.desc}
                    <p class="desc">{ev.desc}</p>
                {/if}

                {#if ev.attendees?.length}
                    <div class="guests">
                        <div class="guests-label">Guests</div>
                        <div class="guest-list">
                            {#each ev.attendees as name (name)}
                                <div class="guest">
                                    <Avatar {name} size={24} />
                                    <span>{name}</span>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- an invitation's guests are the organizer's to invite -->
                {#if ev.attendees?.length && !ev.invitation}
                    {#if store.uninvitedId === ev.id}
                        <div class="notice">Saved. The guests haven't been told yet.</div>
                    {/if}
                    <button
                        class="invite"
                        disabled={store.saving}
                        title="Mail the guests an invitation to this event"
                        onclick={() => store.sendInvites(ev.id)}
                        >Send invitations</button
                    >
                    {#if store.inviteStatus?.id === ev.id}
                        <div class="notice" role="status">{store.inviteStatus.text}</div>
                    {/if}
                {/if}

                {#if ev.callUrl}
                    <a
                        class="join"
                        href={ev.callUrl}
                        target="_blank"
                        rel="noopener noreferrer">Join video call</a
                    >
                {:else if ev.call}
                    <!-- stored before call links existed: there is nowhere to go -->
                    <button
                        class="join"
                        disabled
                        title="This event has no call link; edit it to add one"
                        >Join video call</button
                    >
                {/if}

                {#if confirming}
                    <div class="actions confirm" use:dialogFocus>
                        <span class="question">Delete '{ev.title}'?</span>
                        <div class="spacer"></div>
                        <button
                            class="ghost"
                            onclick={() => (confirmingId = null)}>Cancel</button
                        >
                        <button
                            class="danger"
                            disabled={store.saving}
                            data-autofocus
                            onclick={() => store.remove(ev.id)}>Confirm</button
                        >
                    </div>
                {:else}
                    <div class="actions">
                        <button
                            class="secondary"
                            onclick={() => store.edit(ev.id)}>Edit</button
                        >
                        <button
                            class="danger"
                            disabled={store.saving}
                            onclick={() => (confirmingId = ev.id)}
                            >Delete</button
                        >
                        <button
                            class="ghost"
                            title="Download as an iCalendar file"
                            onclick={() => store.exportIcs([ev])}>Export</button
                        >
                        <div class="spacer"></div>
                        <button
                            class="ghost"
                            onclick={() => store.closePopover()}>Close</button
                        >
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .overlay {
        position: fixed;
        inset: 0;
        background: rgba(20, 40, 80, 0.28);
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .card {
        width: 380px;
        max-height: 86vh;
        overflow: auto;
        background: #fff;
        border-radius: 12px;
        box-shadow: var(--shadow-pop);
    }
    .card:focus {
        outline: none;
    }
    .bar {
        height: 5px;
    }
    .content {
        padding: 18px 22px 20px;
    }
    button {
        font-family: var(--font-ui);
        cursor: pointer;
    }
    .cal {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
    }
    .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
    }
    .cal-name {
        font-size: 12px;
        color: var(--text-muted);
    }
    h2 {
        font-size: 22px;
        line-height: 1.2;
        margin: 0 0 12px;
        font-weight: 400;
    }
    .meta {
        font-size: 13px;
        color: var(--text-secondary);
        margin-bottom: 6px;
    }
    .meta.invitation {
        display: inline-block;
        padding: 1px 6px;
        border: 1px dashed var(--border-strong);
        border-radius: var(--radius-sm);
    }
    .desc {
        font-size: 13px;
        color: var(--text-secondary);
        line-height: 1.55;
        margin: 10px 0 0;
    }
    .guests {
        margin-top: 14px;
    }
    .guests-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-muted);
        margin-bottom: 8px;
    }
    .guest-list {
        display: flex;
        flex-direction: column;
        gap: 7px;
    }
    .guest {
        display: flex;
        align-items: center;
        gap: 9px;
        font-size: 13px;
    }
    .invite {
        display: block;
        width: 100%;
        margin-top: 14px;
        border: 2px solid var(--border-strong);
        border-radius: var(--radius-sm);
        background: var(--blue-100);
        color: var(--blue-700);
        padding: 8px;
        font-size: 13px;
    }
    .invite:hover {
        background: var(--blue-200);
    }
    .invite:disabled {
        opacity: 0.6;
        cursor: default;
    }
    .notice {
        margin-top: 10px;
        font-size: 12px;
        color: var(--text-secondary);
    }
    .join {
        display: block;
        width: 100%;
        margin-top: 16px;
        border: none;
        border-radius: var(--radius-sm);
        background: var(--green-500);
        color: #fff;
        padding: 10px;
        font-size: 13px;
        font-family: var(--font-ui);
        text-align: center;
        text-decoration: none;
        box-sizing: border-box;
    }
    .join:hover {
        background: var(--green-600);
    }
    .join:disabled {
        opacity: 0.6;
        cursor: default;
        background: var(--green-500);
    }
    .actions {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid var(--border-subtle);
    }
    .actions .spacer {
        flex: 1;
    }
    .question {
        font-size: 13px;
        color: var(--text-primary);
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .secondary {
        border: 2px solid var(--border-strong);
        background: var(--blue-100);
        color: var(--blue-700);
        border-radius: 5px;
        padding: 7px 14px;
        font-size: 13px;
    }
    .secondary:hover {
        background: var(--blue-200);
    }
    .danger {
        border: none;
        background: var(--red-400);
        color: #fff;
        border-radius: 5px;
        padding: 8px 14px;
        font-size: 13px;
    }
    .danger:hover {
        background: var(--red-600);
    }
    .ghost {
        border: none;
        background: none;
        color: var(--text-secondary);
        border-radius: 5px;
        padding: 8px 12px;
        font-size: 13px;
    }
    .ghost:hover {
        background: var(--surface-hover);
    }
</style>
