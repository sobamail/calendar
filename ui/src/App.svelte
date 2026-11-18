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
  import { PANES, format_fragment, parse_fragment, type Pane } from './lib/fragment';

  const store = new CalendarStore();
  provideStore(store);

  // The fragment (lib/fragment): pane/<pane>[,<pane>] shows the named panes
  // alone, the rest is the shown day and view. Read before the first render,
  // so the narrow view never flashes the whole app.
  let only = $state<Pane[] | null>(null);
  const panes = $derived(only ?? PANES);
  const showLeft = $derived(panes.includes('left'));
  const showRight = $derived(panes.includes('right'));

  function openFragment() {
    const f = parse_fragment(location.hash);
    only = f.only;
    if (f.date) store.showAt(f.date, f.view);
    // its popover shows once the day's window holds it
    if (f.event) store.select(f.event);
    // the mail client's "show events" of a contact: the search box holds the address
    if (f.search !== null) store.setQuery(f.search);
  }
  openFragment();

  // Every move of the day or the view is a history entry, so Back steps back
  // through them; a fragment without a day (the launch's pane/left, none at
  // all) is completed in place. The runtime leaves the fragment to the page
  // (amp-cef zai/page-url-fragment.md); one that doesn't reloads on every
  // write, see the facts.
  $effect(() => {
    const hash = '#' + format_fragment(only, store.cursor, store.view);
    if (hash === location.hash) return;
    const url = location.pathname + location.search + hash;
    // a launch naming an event or a search is consumed in place too: Back never
    // selects or searches it again
    const shown = parse_fragment(location.hash);
    if (shown.date && !shown.event && shown.search === null) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
  });
</script>

<!-- a link opened, or Back/Forward over the entries written above -->
<svelte:window onhashchange={openFragment} onpopstate={openFragment} />

<div class="app">
  <!-- the toolbar drives the shown view, so it goes with the right pane -->
  {#if showRight}
    <Toolbar />
  {/if}

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

  <div class="body" class:alone={!showRight}>
    {#if showLeft}
      <Sidebar />
    {/if}
    {#if showRight}
      <main>
        {#if store.view === 'week' || store.view === 'day'}
          <TimeGrid />
        {:else if store.view === 'month'}
          <MonthGrid />
        {:else}
          <Agenda />
        {/if}
      </main>
    {/if}
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
  /* pane/left: the sidebar alone fills the page */
  .body.alone :global(.sidebar) {
    width: auto;
    flex: 1;
    min-width: 0;
    border-right: none;
    background: var(--surface-panel);
  }
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--surface-app);
  }
</style>
