<script lang="ts">
    import { useStore } from "../lib/context";
    import { whenText } from "../lib/calendar";
    import { dialogFocus } from "../lib/dialog";

    const store = useStore();
    const move = $derived(store.pendingMove);
    const guests = $derived(move?.to.attendees?.length ?? 0);
</script>

<svelte:window
    onkeydown={(e) => {
        if (move && e.key === "Escape") store.answerMove(false);
    }}
/>

<!-- after a drag of an event with guests: tell them, or the change is undone -->
{#if move}
    <div
        class="overlay"
        onclick={(e) => {
            if (e.target === e.currentTarget) store.answerMove(false);
        }}
        role="presentation"
    >
        <div
            class="card"
            role="dialog"
            aria-label="Tell the guests"
            tabindex="-1"
            use:dialogFocus
        >
            <div class="title">Tell the guests?</div>
            <div class="body">
                <p>{move.to.title} moves to {whenText(move.to)}.</p>
                <p>
                    Send {guests === 1 ? "its guest" : `its ${guests} guests`} the new time?
                    If not, it stays as it was.
                </p>
            </div>
            <div class="footer">
                <span class="spacer"></span>
                <button class="ghost" onclick={() => store.answerMove(false)}>Put it back</button>
                <button class="go" data-autofocus onclick={() => store.answerMove(true)}
                    >Send update</button
                >
            </div>
        </div>
    </div>
{/if}

<style>
    /* shaped like the other dialogs */
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
        width: 380px;
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
    .body {
        padding: 4px 22px 14px;
        font-size: 13px;
        color: var(--text-secondary);
    }
    .body p {
        margin: 0 0 8px;
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
    button {
        font-family: var(--font-ui);
        cursor: pointer;
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
</style>
