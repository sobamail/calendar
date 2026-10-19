<script lang="ts">
    import { useStore } from "../lib/context";
    import { H0, H1, calendarName } from "../lib/data";
    import { fmt } from "../lib/calendar";
    import { call_url_ok, email_ok } from "../lib/email";
    import { dialogFocus } from "../lib/dialog";

    const store = useStore();

    // every half hour of the day; 24:00 is not a valid time of day, so stop short
    const timeOptions = (() => {
        const out: { value: number; label: string }[] = [];
        for (let h = H0; h < H1; h += 0.5)
            out.push({ value: h, label: fmt(h) });
        return out;
    })();

    // Cancel's rules: nothing closes the form while a save is in flight
    function cancel() {
        if (!store.saving) store.closeCreate();
    }
</script>

<svelte:window
    onkeydown={(e) => {
        if (store.showCreate && e.key === "Escape") cancel();
    }}
/>

{#if store.showCreate}
    <div
        class="overlay"
        onclick={(e) => {
            if (e.target === e.currentTarget) cancel();
        }}
        role="presentation"
    >
        <div
            class="card"
            role="dialog"
            aria-label="Event form"
            tabindex="-1"
            use:dialogFocus
        >
            <div class="title">
                {store.editingId ? "Edit event" : "New event"}
            </div>
            <div class="fields">
                <label class="field">
                    <span>Title</span>
                    <input
                        bind:value={store.form.title}
                        placeholder="Add a title"
                        data-autofocus
                    />
                </label>

                <div class="row">
                    <label class="field">
                        <span>Calendar</span>
                        <select bind:value={store.form.cal}>
                            {#each store.calendars as cal (cal.id)}
                                <option value={cal.id}>{calendarName(cal)}</option>
                            {/each}
                            {#if store.form.cal && !store.calendars.some((c) => c.id === store.form.cal)}
                                <!-- an event on an unknown calendar shows it; saving asks for another -->
                                <option value={store.form.cal}
                                    >{calendarName(store.meta(store.form.cal))}</option
                                >
                            {/if}
                        </select>
                    </label>
                </div>

                <div class="row">
                    <label class="field">
                        <span>Start date</span>
                        <input
                            type="date"
                            bind:value={
                                () => store.form.date, (v) => store.setFormDate(v)
                            }
                        />
                    </label>
                    <label class="field">
                        <span>End date</span>
                        <input
                            type="date"
                            min={store.form.date}
                            bind:value={store.form.endDate}
                        />
                    </label>
                </div>

                <label class="check">
                    <input type="checkbox" bind:checked={store.form.allDay} />
                    <span>All day</span>
                </label>

                {#if !store.form.allDay}
                    <div class="row">
                        <label class="field">
                            <span>Starts</span>
                            <select bind:value={store.form.s}>
                                {#each timeOptions as o (o.value)}
                                    <option value={o.value}>{o.label}</option>
                                {/each}
                            </select>
                        </label>
                        <label class="field">
                            <span>Ends</span>
                            <select bind:value={store.form.e}>
                                {#each timeOptions as o (o.value)}
                                    <option value={o.value}>{o.label}</option>
                                {/each}
                            </select>
                        </label>
                    </div>
                {/if}

                <label class="field">
                    <span>Location</span>
                    <input
                        bind:value={store.form.location}
                        placeholder="Add a location"
                    />
                </label>

                <label class="field">
                    <span>Video call link</span>
                    <input
                        type="url"
                        bind:value={store.form.callUrl}
                        placeholder="https://…"
                        aria-invalid={!call_url_ok(store.form.callUrl)}
                    />
                </label>

                <div class="field">
                    <span>Guests</span>
                    {#each store.form.attendees as _, i}
                        <div class="guest-row">
                            <input
                                type="email"
                                bind:value={store.form.attendees[i]}
                                placeholder="name@example.com"
                                aria-label="Guest {i + 1}"
                                aria-invalid={!email_ok(store.form.attendees[i])}
                            />
                            <button
                                class="ghost remove"
                                aria-label="Remove guest {i + 1}"
                                onclick={() => store.removeGuest(i)}>×</button
                            >
                        </div>
                    {/each}
                    <button class="ghost add" onclick={() => store.addGuest()}
                        >Add guest</button
                    >
                </div>

                <label class="field">
                    <span>Description</span>
                    <textarea
                        bind:value={store.form.desc}
                        rows="3"
                        placeholder="Add a description"
                    ></textarea>
                </label>

                {#if store.formError}
                    <div class="form-error" role="alert">{store.formError}</div>
                {/if}
            </div>

            <div class="footer">
                <button
                    class="ghost"
                    disabled={store.saving}
                    onclick={cancel}>Cancel</button
                >
                <button
                    class="go"
                    disabled={store.saving || !store.formValid}
                    onclick={() => store.save()}
                >
                    {#if store.saving}
                        Saving…
                    {:else}
                        {store.editingId ? "Save changes" : "Add event"}
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
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
        max-height: 90vh;
        overflow: auto;
        background: #fff;
        border-radius: 12px;
        box-shadow: var(--shadow-pop);
    }
    .card:focus {
        outline: none;
    }
    button {
        font-family: var(--font-ui);
        cursor: pointer;
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
    .row {
        display: flex;
        gap: 12px;
    }
    .field {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
    }
    .field > span {
        font-size: 11px;
        color: var(--text-secondary);
    }
    .check {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--text-primary);
        cursor: pointer;
    }
    .check input {
        width: auto;
        margin: 0;
    }
    .form-error {
        font-size: 12px;
        color: var(--red-600);
    }
    button:disabled {
        opacity: 0.6;
        cursor: default;
    }
    .guest-row {
        display: flex;
        gap: 6px;
        align-items: center;
    }
    .ghost.remove {
        padding: 6px 10px;
        font-size: 16px;
        line-height: 1;
    }
    .ghost.add {
        align-self: flex-start;
        padding: 6px 8px;
        color: var(--blue-700);
    }
    textarea {
        resize: vertical;
    }
    input[aria-invalid="true"] {
        border-color: var(--red-400);
    }
    input,
    select,
    textarea {
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
    input:focus,
    select:focus,
    textarea:focus {
        outline: none;
        border-color: var(--border-strong);
        box-shadow: var(--focus-ring);
    }
    .footer {
        padding: 12px 22px;
        border-top: 1px solid var(--border-subtle);
        display: flex;
        gap: 8px;
        justify-content: flex-end;
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
