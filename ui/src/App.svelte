<script lang="ts">
  import { CalendarStore, PAGE } from './lib/store.svelte';
  import { provideStore } from './lib/context';
  import Toolbar from './components/Toolbar.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import TimeGrid from './components/TimeGrid.svelte';
  import MonthGrid from './components/MonthGrid.svelte';
  import Agenda from './components/Agenda.svelte';
  import EventPopover from './components/EventPopover.svelte';
  import EventForm from './components/EventForm.svelte';
  import ImportDialog from './components/ImportDialog.svelte';
  import MoveDialog from './components/MoveDialog.svelte';

  const store = new CalendarStore();
  provideStore(store);
</script>

<div class="app">
  <Toolbar />

  {#if store.capped}
    <div class="notice" role="status" aria-label="Event limit">
      Showing the first {PAGE} events of the shown months; some are left out.
    </div>
  {/if}

  {#if store.error}
    <div class="error" role="alert">
      <span>{store.error}</span>
      <button aria-label="Dismiss" onclick={() => store.dismissError()}>×</button>
    </div>
  {/if}

  <div class="body">
    <Sidebar />
    <main>
      {#if store.view === 'week' || store.view === 'day'}
        <TimeGrid />
      {:else if store.view === 'month'}
        <MonthGrid />
      {:else}
        <Agenda />
      {/if}
    </main>
  </div>

  <EventPopover />
  <EventForm />
  <ImportDialog />
  <MoveDialog />
</div>

<style>
  .app {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--surface-panel);
    color: var(--text-primary);
    overflow: hidden;
  }
  .notice {
    padding: 6px 12px;
    background: var(--blue-100);
    color: var(--blue-700);
    font-size: var(--text-sm);
    flex: none;
  }
  .error {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    background: var(--red-400);
    color: #fff;
    font-size: var(--text-sm);
    flex: none;
  }
  .error span {
    flex: 1;
  }
  .error button {
    border: none;
    background: none;
    color: inherit;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 6px;
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--surface-app);
  }
</style>
