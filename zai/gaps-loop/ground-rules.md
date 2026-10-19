# Gaps loop ground rules: the loop contract

**Read this file in EVERY pass, before touching anything.** It holds the
arming gate, the pass protocol, the check/build/test how-to, the fix
discipline, the evidence rules, the gates and the recording rules. The
index (`index.md` next to this file) says which other files your pass
needs.

## Subject and outputs

The loop closes the gaps of soba-calendar as the calendaring interface
of an email platform, per the plan of record `zai/calendar-gaps.md`:
its §1–§13 are the items G1–G13, its §R is settled (do not reopen; a
pass that finds a rejected idea necessary parks a question instead).
Re-derive nothing the plan already settles. soba-contacts (read-only,
added with `--add-dir`) is the reference implementation for every
idiom; its `zai/contacts-facts.md` holds the measured runtime facts.
The platform reference is the `sobamail-app` skill at
`.claude/skills/sobamail-app/` (read-only): `SKILL.md` for the recipe,
`references/runtime-api.md` for the `soba.*` calls and which are
refused in replicated handlers, `references/app-anatomy.md` for object
classes, registration and tables, `references/wire-and-ui.md` for the
wire format. An item closes when its fix is committed WITH its
failing-first tests and the gates are green. Durable facts go to
`zai/calendar-facts.md` (a `zai/` memory file: keep its frontmatter).
Working state lives in `items.md` and is deleted as items close.

## ARMING GATE (checked FIRST, every pass)

The loop is armed only when the sign-off queue in `items.md` (S1–S7)
is fully dispositioned: every queued item carries an owner-filled
VERDICT line (approved / rejected / modified, in the owner's words).
Until then a pass does exactly this and NOTHING else: park one
standalone "OWNER QUESTION (sign-off round): …" line per unverdicted
item in the index, add the halt token per the index's token shapes,
commit, stop. Approved items get ordered into `items.md`'s Order
section; rejected ones move their distilled record to the plan of
record's §R and their item section is DELETED.

## Owner sign-offs recorded in advance (proposed 2026-10-14, all confirmed by the owner 2026-10-15)

Granted at loop setup; a pass relies on these WITHOUT parking a
question. Anything outside their wording still parks.

1. STANDING — passes NEVER edit `.claude` settings files. A prescribed
   command shape that is silently denied is recorded verbatim in the
   item, an owner question is parked, and the pass moves on.
2. STANDING — test files under `ui/src/**/*.test.ts`, the stand-in
   runtime `ui/src/test/soba.ts` and the fetch stub
   `ui/src/test/backend.ts` are free to add and extend; vitest config
   changes are free. (Installing the packages is S1(a): the six named
   packages only.)
3. STANDING — a NEW single attr key (`callUrl`, `uid`, `organizer`,
   `status`, `tz`) under `event_attr_single`, written by `PutEvent`
   and read by `GetEvents`, is free. A new TABLE (the calendars of G6)
   is free (S2(a)). An existing column or check is never
   altered; stored rows keep working (a missing new attr reads as its
   default). `Mutator.mjs`'s `version` is not touched: the owner bumps
   it at deploy.
4. STANDING — UI text, labels, placeholders and empty-state wording are
   free. Layout changes inside an existing component are free; a new
   top-level panel or a change to the title bar/toolbar structure
   beyond what the plan names parks first.
5. STANDING — the `@types/sobamail.com/module/calendar/v1.d.ts`
   declarations follow every module change in the same commit (free;
   it is part of the module change).
6. STANDING — soba-contacts, the skill submodule, `.claude/settings*.json`
   and `assets/` are read-only; an edit there parks an owner question
   with the diff. Copying a file FROM soba-contacts (harness, email
   check, dialog shapes) into this repo is free.

## Running a pass

1. STARTUP (nothing more): read the index and follow its reading order —
   this file, the `sobamail-app` skill (invoked with the Skill tool: a
   fresh pass has not loaded it), the ONE item section in `items.md`
   the NEXT ITEM pointer names, the subject docs that item's "reads"
   line names, and the repo's CLAUDE.md.
2. Check the ARMING GATE above.
3. Re-measure every claim the item relies on — recorded line numbers,
   census results and baselines are hypotheses: grep for the symbol.
4. Execute one unit: MEASURE, FIX or BRIEF (below) — then optionally
   chain further units per the chaining rule.
5. End-of-pass protocol: FIX passes run the gates; a module change
   carries its pin update and its d.ts update in the same commit;
   update the item's section in `items.md`; point the NEXT ITEM pointer
   in the index at the item the next pass should work — usually the
   SAME item until it closes or parks; append ONE pass-log line there
   (newest first); perform the growth upkeep below; commit per the
   branch discipline.
6. STOP at the pass boundary; end on a short closing text summary. The
   driver prints your final message as the pass result, so the summary
   is the last thing the pass does.

## Units and the item lifecycle

- MEASURE: measurement only, NO committed source edits — reproduce the
  claim, run the relevant suites, record the census in the item
  (counts, first errors verbatim with file:line, the exact commands).
  Local experiments are allowed but must be reverted before the pass
  ends (`git status` clean except docs).
- FIX: code edits — ONE coherent chunk sized to finish inside the pass,
  ALWAYS failing-test-first: add the test, run it red, fix, run it
  green. Every chunk ends with gate-check plus the relevant test file
  proving the delta.
- BRIEF: doc-only — builds NOTHING, runs NO suite. Write the analysis
  or the owner question into the item; park the question in the index
  per the index's token shapes.
- CHAINING: after a unit completes CLEANLY — its items.md update
  written and its commits landed — the pass MAY take another unit when
  the next one is already identified and sized to finish inside the
  pass. Rough cap: ~3 units, less if the transcript is getting long.
  Checkpoint per unit (update the item, commit) so a pass that dies
  loses at most its current unit; NEVER carry a half-done unit toward
  the pass boundary — finish it or revert it. The end-of-pass protocol
  runs ONCE, after the last unit; its single pass-log line covers all
  units. A MEASURE may chain into the FIX it just made obvious.
- Lifecycle: PROPOSED → (verdict) → OPEN → FIXING → CLOSED | PARKED.
  - CLOSED: fix + tests committed, gates green (modulo reds recorded as
    pre-existing at baseline), condensed record (≤8 lines) in
    `zai/calendar-facts.md`, item section DELETED from `items.md`.
  - PARKED: blocked on the owner; the question is parked in the index
    and NEXT ITEM advances.
- A pass blocked on the owner does NOT stop the loop (post-arming):
  park the question, advance NEXT ITEM to the next actionable item,
  continue. The loop halts only when NO item is actionable (the index
  documents the halt shape).

## Check, build & test how-to (re-measure baselines at the first MEASURE)

A pass runs headless under an allowlist keyed on literal first words:
literal paths, one command per tool call, no `$(...)` substitution, no
shell variables across tool calls, no leading environment assignment,
no `cd … && …` chain. Files and directories are created with the Write
tool and moved with `git mv` (`mv`, `mkdir`, `chmod`, `rm`, `node`,
`npx`, `python3` have no allowlist rule; a scratch file is dropped with
`git clean -f -- <path>`). The working directory is the repo root
`/home/plq/src/arskom/amp/soba-calendar`; every pnpm command is
`pnpm -C ui …`.

- Types and Svelte: `pnpm -C ui run check` — 0 errors. Baseline since
  G4 (2026-10-15): 0 warnings.
- Build: `pnpm -C ui run build` (into `ui/dist`, gitignored; ~2 s). The
  live `assets/` dir is the owner's dev-watch output: never built or
  committed by a pass.
- Tests: `pnpm -C ui run test` (vitest, whole suite, ~20 s). There is
  no headless one-file shape (measured G8 pass): `pnpm -C ui run test --
  <file>` still runs the whole suite and `pnpm -C ui exec vitest` is
  denied — run the suite and read the file's lines.
  Backend handlers run on the stand-in runtime `ui/src/test/soba.ts`
  (sql.js), ported from soba-contacts' file of the same path; the UI
  against the fetch stub `ui/src/test/backend.ts`.
- Module pin, after EVERY change to `sobamail.com/module/calendar/v1.mjs`:
  `sha224sum sobamail.com/module/calendar/v1.mjs | cut -d' ' -f1 | basenc --base16 -d | basenc --base32hex | tr -d '='`
  prints the base32hex pin; put it into the `?sha224=` of the module's
  import in `Mutator.mjs` in the SAME commit. The module imports
  nothing (keep it so: no `soba://computer/R2` line — that is what lets
  vitest import it with a `globalThis.soba` stub).
- The runtime itself is out of reach: no deploy, no dev-mode reload, no
  mail. Anything only the live runtime can prove is recorded in the
  facts doc's UNVERIFIED list and left to the owner's shakedown.
- Chrome 117 (CEF) is the UI target: no syntax or API newer than that
  in shipped code (`Intl.Locale.prototype.weekInfo` is in; `Array.prototype.toSorted`
  is in; `Set.prototype.union` is NOT).

## Fix discipline

- Failing test first, always: write the test against current behavior,
  watch it fail for the RIGHT reason, then fix. When a red might be
  pre-existing, prove it: `git stash` the work, rerun, `git stash pop`.
- Test tiers: pure helpers (`dates.ts`, `calendar.ts`, `ics.ts`)
  against nothing; module request handlers on the stand-in runtime;
  UI flows in jsdom against the fetch stub (`// @vitest-environment jsdom`
  on the file). The stand-in mirrors `Mutator.mjs`'s tables by hand —
  a schema change updates both in the same commit.
- Replicated handlers (`AddEvent`, `SetEventAttr`, `AddEventAttr`,
  `AddEventAttrValue`, `DeleteRow`) stay deterministic: `soba.data.*`
  and pure code only; `soba.db.exec`, `soba.type.uuid.v4()`,
  `soba.mail.send`, clocks belong to request handlers (`PutEvent`,
  `GetEvents`, `GetEvent`, `DeleteEvent`, the new `SendInvite`). Read
  with `soba.db.exec` before `soba.data.find`: a find on a never-
  inserted key throws and aborts the pass (contacts facts).
- Wire compatibility: rows written before the loop keep reading — a
  new attr absent from a stored event reads as its constructor default;
  `start`/`end` keep their local-naive ISO shape unless S4 says
  otherwise; the compact reply shape (keys 0/1/2/3) is unchanged.
- The UI reaches the backend only through `ui/src/lib/model.ts` and
  state only through `CalendarStore` (`ui/src/lib/store.svelte.ts`);
  components never fetch (CLAUDE.md of 2026-10-13, still the design).
  Every value is rendered as text — no `{@html}`.
- Format like the surrounding code: backend clang-format style (100
  columns, 4 spaces, `! x`, double quotes); UI as Prettier left it
  (4-space Svelte, 2-space `App.svelte`).
- An out-of-scope discovery (a flake, an unrelated bug) gets a dated
  entry in the item and nothing more — do NOT divert the pass into
  chasing it; it goes to the owner or to its own loop.

## Gates

FIX passes run the gates; MEASURE runs what its census needs; BRIEF
runs nothing.

- gate-check: `pnpm -C ui run check` after every FIX; 0 errors,
  warnings not above the recorded baseline.
- gate-test: `pnpm -C ui run test` after every FIX; every test green
  (modulo reds recorded as pre-existing at baseline). Compare test
  NAMES, never counts.
- gate-build: `pnpm -C ui run build` by every pass that touched `ui/`.
- gate-pin: `Mutator.mjs`'s `?sha224=` equals the pipeline's output for
  the module, by every pass that touched the module.
- Completion: the LAST item closes AND the four gates run fully green in
  that pass → write the completion token per the index.

## Evidence rules

- Archive gate runs by piping through tee at run time:
  `pnpm -C ui run test 2>&1 | tee /home/plq/src/arskom/amp/soba-calendar/gaps-loop/evidence/<item>-gate-test.txt`.
- `gaps-loop/evidence/` is gitignored scratch; excerpt the load-bearing
  lines into the item's section — the doc is the durable record,
  evidence/ is scratch. Never put a credential, a token or a live
  address into evidence.
- Code evidence is `file:line` plus the load-bearing excerpt,
  re-measured in the same pass that cites it.

## Growth upkeep (every pass — the doc set must NOT grow indefinitely)

- The index holds only the map, the NEXT ITEM pointer, parked questions
  and the pass log: one `> -` prefixed line per pass, ≤3 sentences,
  newest first, CAPPED at the ~10 newest — delete older lines once
  their substance is in `items.md` or the facts doc.
- Closing an item: condensed record (≤8 lines — what was fixed, the
  tests that pin it, commits, final test numbers) into
  `zai/calendar-facts.md`, then DELETE the item's section from
  `items.md`.
- Facts that stop being true are corrected in place — no strikethrough
  trails.

## Branch & commit discipline

- soba-calendar commits on the branch its checkout is on (CLAUDE.md:
  "Trust that the owner must have set up the right branch to work
  on"; `master` at arming): `git branch --show-current` before
  committing, the branch recorded in the pass-log line; a checkout off
  its recorded branch parks an owner question, the pass leaving the
  branch as found. Never create a branch. The Gerrit `commit-msg`
  hook adds the `Change-Id`.
- READ-only context: soba-contacts; the `.claude/skills/sobamail-app`
  submodule; `.claude/settings*.json`; `assets/`. An edit there parks
  an owner question first, with the diff.
- Ordinary per-concern commits, each carrying its tests; code and the
  doc updates of the same pass go in ONE commit per concern (a BRIEF
  pass commits docs only). NEVER amend a pushed commit; amending a
  still-local HEAD commit of the same pass is fine. Do NOT push —
  commits stay local; the owner synchronizes — so a pass ends with
  everything it touched COMMITTED.
- Git runs IN the repo, plain: the working directory is already the
  repo root; soba-contacts is never committed to. Never `git -C <repo>`
  and never a `cd … && git …` chain.
- Commit shape — don't stage, name the paths on the commit:
  `git commit -F - -- <your paths>` with the message on a quoted
  heredoc (literal text). Given paths, `git commit` takes exactly
  those paths' working-tree content and leaves the rest of the index
  alone. No `git add` before it. The one exception is a NEW file,
  which git cannot commit by path until it has seen it:
  `git add -N <path>` (intent-to-add — registers the path, stages no
  content), then the commit above. `git rm` / `git mv` stage what
  they do and are the shapes for deleting / renaming a tracked file.
  Never `git add -A` / `-u`, never a bare `git commit`. Commit
  trailers per the session's attribution rule (the `Co-Authored-By`
  line the harness prescribes).
