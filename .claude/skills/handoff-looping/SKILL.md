---
name: handoff-looping
description: Set up, retarget, or operate a handoff loop — a backlog worked by repeated fresh headless `claude -p` passes with a committed doc set as the only inter-pass memory. Use for autonomous loops of fresh sessions in a Sobamail app repo (soba-calendar, soba-contacts, …): scaffolding a gap-closing or hardening loop (like gaps-loop here), retargeting a loop driver at a new subject, or answering a halted loop's owner questions. Read templates.md (next to this file) before scaffolding.
---

# Handoff looping

A **handoff loop** executes a backlog that is too big for one session as a series of
**fresh `claude -p` passes**. Context resets on every pass by design: nothing survives
except a **doc set committed to the repo**, which each pass reads at startup and updates
before it stops. The doc set is simultaneously the work queue, the protocol, the memory
and the off switch. A driver shell script spawns passes and greps the doc for control
tokens to know when to stop.

Reference implementation: `gaps-loop/` + `zai/gaps-loop/` in soba-calendar. Read
`templates.md` (next to this file) before scaffolding; the repo facts every scaffold
relies on are collected under "Sobamail app repos" below.

## When to reach for it

- A backlog of separable items that will outgrow any single context window
  (multi-day gap-closing rounds, migration sweeps, review-backlog burndown).
- "Keep going until it's done" requests where each increment is verifiable on its own.

Not for single-session tasks (just do them), and not for work that needs the user's
input at every step — the loop *parks* owner questions and continues; it only pays off
when most items are actionable without a human.

## Anatomy — two locations, five files

| File | Where | Committed? | Role |
|---|---|---|---|
| `loop.sh` | `<loop-name>/` at the app repo root | yes | driver: spawns passes, greps tokens, stops |
| `prompt.md` | `<loop-name>/` | yes | thin per-pass bootstrap; points at the index, nothing else |
| `.gitignore` | `<loop-name>/` | yes | ignores `logs/` and `evidence/` (scratch) |
| `index.md` | `zai/<loop-name>/` | yes | map, reading order, NEXT ITEM pointer, parked questions, token shapes, pass log |
| `ground-rules.md` | `zai/<loop-name>/` | yes | the loop contract, read in EVERY pass: arming gate, pass protocol, units, gates, upkeep |
| `items.md` | `zai/<loop-name>/` | yes | working state only; item sections are DELETED as they close |

**Mechanics live in scripts, policy in the docs.** Shared helpers sit in the sibling
`util/` checkout (`/home/plq/src/arskom/amp/util`): `pass-report.sh` (driver-side;
the owner runs the driver, no allowlist needed) and `wait-for.sh` (pass-side;
ABSOLUTE path, one narrow allowlist rule — step 5). A script's header is its
contract; the ground rules carry the policy and the one-line invocation, never the
plumbing (the doc set is read every pass, a script is not). Git is not wrapped: a
pass runs plain `git` in the repo (point 12). An app session cannot read `util/`
(it is outside the allowed roots — measured 2026-10-14): the driver's preflight
checks the helpers exist, and the owner's shakedown proves them.

Plus a **durable facts doc** *outside* the loop directory (`zai/<app>-facts.md`, e.g.
`zai/calendar-facts.md`, `zai/contacts-facts.md`): the loop directory and doc set are
disposable once the loop completes; anything worth keeping is condensed there as
items close. Most loops also have a **plan of record** the ground rules point at
(e.g. `zai/calendar-gaps.md`): the analysis, owner context, distilled fixes and the
considered-and-REJECTED list that keeps settled questions closed. It is committed as a
work in progress like the rest of the doc set (step 8).

## Sobamail app repos (soba-calendar, soba-contacts, …)

- **One repo, two halves, one toolchain.** `Mutator.mjs` plus `sobamail.com/module/<app>/v1.mjs`
  are the backend: plain ES modules the soba runtime loads, no package manager, no
  build. `ui/` is a pnpm project (Svelte 5, Vite, TypeScript, vitest where it has
  been added). The `sobamail-app` skill (vendored submodule at
  `.claude/skills/sobamail-app`) is the platform reference — object keys, the two
  registration maps, replicated vs non-replicated handlers, schema checks, the wire
  format, pins. A loop's ground rules name the skill files an item reads instead of
  restating them. **A fresh `claude -p` pass does not load it on its own**: project
  skills are listed to the model, never auto-applied, so the index's reading order
  and the prompt make invoking it (Skill tool, name `sobamail-app`) a STARTUP step,
  right after the ground rules; without that line a pass works from memory of the
  platform and gets the replicated-handler rules wrong. The submodule is READ-ONLY
  for passes: an edit there parks an owner question (the gitlink must point at a
  pushed upstream commit).
- **No live runtime in a pass.** Nothing headless runs the real soba runtime: a pass
  cannot instantiate, deploy, reload, send or receive mail. The ONLY backend test
  tier is the stand-in runtime Contacts carries in `ui/src/test/soba.ts` (sql.js
  in-memory SQLite with the Mutator's tables mirrored by hand; `soba.data.*`
  emulating lww replacement and fk cascades) and `ui/src/test/backend.ts` (a
  stubbed `fetch` that runs the module's request objects and answers in compact
  SMC), driven by vitest. Mutations, content addressing and replication are NOT
  modelled, so concurrent-replica behaviour is reasoned from the skill's lww rules,
  never measured. Whatever needs the live runtime (a new `objects` entry taking
  effect, mail with attachments, a schema upgrade on an existing instance) is
  recorded in the facts doc as UNVERIFIED against the runtime and left to the
  owner's shakedown — it is not a reason to park. The module files have NO
  `import "soba://computer/R2"` line (calendar and contacts both): that is what
  lets vitest import them with a `globalThis.soba` stub; a pass never adds it.
- **The pin rule.** Every commit that changes a module updates its `?sha224=` pin in
  every importer, leaf first, `Mutator.mjs` last, in the encoding the import already
  uses (soba-calendar: base32hex). `python3` has no allowlist rule in soba-calendar
  (in soba-contacts the rule matches the `.claude/skills/sobamail-app/scripts/gen-hash.py <file>`
  form, run from the repo root — check `.claude/settings*.json` of the repo at hand),
  so the measured headless shape there is the coreutils pipeline the template
  carries (`sha224sum … | cut … | basenc --base16 -d | basenc --base32hex | tr -d '='`,
  allowed 2026-10-14). Never guess a hash; a pin that does not match the file is a
  defect the gate cannot catch — the facts doc of each loop says who checks it.
- **Allowlist facts (soba-calendar `.claude/settings.json`, measured 2026-10-14).**
  `pnpm -C ui run *`, `pnpm -C ui install`, `pnpm run *` and the read-only git verbs
  are committed rules; `git add *`, `git commit *`, `git checkout *`, `git reset *`
  live only in the gitignored `.claude/settings.local.json` (the global gitignore
  excludes `**/.claude/settings.local.json`) — confirm they are there at every
  arming. `mv`, `mkdir`, `rm`, `node`, `npx`, `python3` have no rule: a file is
  created with the Write tool, moved with `git mv`, a scratch file dropped with
  `git clean -f -- <path>`. A `cd … && git …` chain is DENIED under `dontAsk`; a
  standalone `cd` inside the roots needs no rule. Reads and commands outside the
  allowed roots (`util/`, a sibling repo not added with `--add-dir`) are denied.
  Passes never edit `.claude` settings files: a denied shape is recorded verbatim in
  the item, an owner question parked, the pass moves on.
- **Commit discipline (Gerrit).** The `commit-msg` hook adds a `Change-Id`; review is
  per commit, so a pass commits straight onto the checked-out branch (`master`), one
  concern per commit with its tests, and never creates a branch, never pushes, never
  amends a pushed commit. Nothing shares the staging area here (one loop per repo),
  but the commit-by-path shape of point 12 is kept so a pass never sweeps a
  foreign change.
- **Memory is repo-wide, in `zai/`** (`zai/MEMORY.md` is the index; each memory is a
  file with frontmatter — `zai/memory-conventions.md`). Durable loop output goes to
  the facts doc, which is one of those files and is pointed at from `MEMORY.md`.
  Generic platform knowledge belongs to the `sobamail-app` skill, never to `zai/`.
- **Sibling app repos are read-only context** (`--add-dir`): soba-contacts is the
  reference implementation of the recipe (its `zai/contacts-facts.md` holds the
  measured runtime facts: delivery types, `soba.data.find` aborting the pass on a
  miss, snapshot reads, tasks not deduplicated, mail attachments). A loop in one app
  never edits another.
- **The host is CEF (Chrome 117).** `blob:` downloads are cancelled inside Sobamail
  (contacts facts); a file-export item records that limit instead of fighting it.
- **Post-pass sync is optional.** The template's driver runs `util/pull-all.sh`
  after every pass when the script exists and skips it otherwise, since a Gerrit app
  repo is usually synchronized by the owner's push.

## The contract — why each piece is shaped the way it is

1. **Fresh context per pass** ⇒ everything a pass needs must be re-derivable from the
   doc set alone. Corollary the docs must state explicitly: every recorded claim, line
   number and census is a **hypothesis — re-measure before acting** (the tree moved
   since it was written).
2. **One entry point.** `prompt.md` names the subject in one breath and points at
   `index.md`; the index gives the reading order; the NEXT ITEM pointer names the item.
   Never bake item names or state into the prompt — it goes stale, the doc set does
   not — and say so in the prompt ("the doc set is the authority").
3. **Control tokens, whole-line anchored.** Two, both grepped by the driver against
   the index: completion — a **loop-specific** `<LOOP-NAME>-LOOP-COMPLETE` alone on
   its line, written only when the last item closes AND the loop's gate ran green;
   halt — `LOOP-HALT` alone on its (possibly `> `-blockquoted) line, written only
   when NO item is actionable, beside standalone `OWNER QUESTION (…):` lines. The
   greps are anchored (`^token[[:space:]]*$`, the class eating a stray CR) because
   the docs *name* the tokens mid-sentence — hence also "never reproduce the shapes
   early". A shared completion token would let one loop's completion stop another.
4. **Three driver exits.** `0` = completion token (done). `2` = halt token (parked on
   the owner: answer in the doc, verdicts verbatim, remove the token, rerun). `1` =
   two consecutive nonzero pass exits or MAX_PASSES exhausted (a human reads the
   newest log). One failed pass is tolerated — passes die for transient reasons.
5. **Arming gate.** A backlog that needs owner sign-off is not armed until every
   queued item carries an owner-filled VERDICT line; an unarmed pass only parks one
   OWNER QUESTION per unverdicted item, writes the halt token, commits, stops — the
   driver header warns against running before arming. Its complement, keeping an
   armed loop autonomous: **standing sign-offs** in the ground rules — blanket
   permissions in the owner's words that a pass relies on WITHOUT parking, boundary
   stated: anything outside their wording still parks. Drafting and dispositioning
   them is scaffolding work (steps 3 and 8), never an afterthought. The classes a
   Sobamail app loop predictably faces: dependency installs (`pnpm add` needs the
   network), schema changes (new tables or attr keys are additive; an existing
   column is never altered — the runtime never alters a table), accepting mail
   deliveries (Contacts refuses `metadata.type` `"message"`; an invitation feature
   must accept it), UI chrome removal, scope exclusions.
6. **The pass protocol lives in `ground-rules.md`**, read first in every pass: reading
   order → arming check → re-measure → units → end-of-pass protocol → STOP at the
   boundary. The *reliable* handoff record is the pass-log line in the index, printed
   by the driver after each pass; the model's closing text is best-effort.
7. **Units sized to finish inside the pass.** A pass is a headless `claude -p`: the
   session dies with the turn, and a still-running background task dies with it,
   unrecorded. Parking on a background task's completion notification is the trap —
   interactively that is how you wait; headless, the notification never comes.
   The pnpm gates finish in seconds to a minute, so a pass runs them in the
   FOREGROUND; `util/wait-for.sh` (absolute path) is the sanctioned wait if a gate
   ever outgrows that. Checkpoint per unit (doc update + commit), and never carry a
   half-done unit toward the boundary — finish it or revert it.
8. **Three unit shapes; names are per-loop.** MEASURE (measurement only, no committed
   source edits), FIX (one coherent test-first chunk), BRIEF (doc-only); chaining
   after a clean checkpoint, capped (~3). Rename to fit the subject — the shapes are
   the invariant. An **out-of-scope discovery** (a flake, an unrelated bug) gets a
   dated entry in the item and nothing more; it goes to the owner or its own loop.
9. **Growth upkeep, every pass**, or startup reading swallows the pass budget
   (keeping context use to a minimum is the owner's standing direction — a rule only
   some items need goes in its own file, named by those items' reads lines, not in
   the ground rules every pass reads): pass log capped (~10 newest `> -` entries,
   ≤3 sentences each), closed item sections DELETED from `items.md` after condensing
   (≤8 lines) into the facts doc, stale facts corrected in place — no strikethrough
   trails.
10. **The NEXT ITEM pointer is the single dispatch point.** Every pass ends by aiming
    the next pass — usually at the SAME item until it closes or parks. A pass blocked
    on the owner does not stop an armed loop: park the question, advance the pointer,
    continue. Halt only when NOTHING is actionable.
11. **Literal commands in the docs.** Passes run headless under an allowlist keyed on
    literal first words: no `$(…)`, no shell variables across tool calls. The ground
    rules inline the LITERAL pnpm forms, the hash pipeline and the tool paths
    ("Sobamail app repos" above). Under `dontAsk` an unlisted shape is silently
    denied, not prompted — allowlist coverage is settled at scaffolding (step 5),
    never at runtime.
12. **Commit discipline stated per repo.** Which repos may be edited, which branch each
    commits on, read-only context repos (edits there park an owner question first).
    Per-concern commits carrying their tests; commits stay LOCAL — the owner pushes.
    Two shapes:
    - **Git runs IN the repo: `cd` first, never `git -C`.** `cd /abs/path/<repo>` as
      its OWN tool call, the git verbs in the calls that follow (the cwd persists
      between calls), then `cd` back to the app repo — later calls inherit the cwd.
      A `cd … && git …` chain is DENIED; `git -C` has no rule and gets none.
    - **Don't stage — pass the paths to `git commit`.** `git commit -F - -- <paths>`
      with the message on a quoted heredoc: it takes exactly those paths' working-tree
      content and leaves the rest of the index alone. No `git add` before it; a NEW
      file, which git cannot commit by path until it has seen it, gets `git add -N`
      (intent-to-add, no content staged) and nothing more; `git rm`/`git mv` stage by
      nature and are the shapes for a tracked file. Never `git add -A`/`-u`, never a
      bare `git commit`. The attribution trailer the session prescribes closes every
      message; the Gerrit hook adds the `Change-Id` by itself.
13. **Driver hygiene.** Fail fast if a required tool is missing from PATH (a pass
    without its toolchain only burns money diagnosing itself); one stream-json log
    per pass under `logs/`, `evidence/` for archived test output (both gitignored);
    the per-pass report is `util/pass-report.sh` — no JSON plumbing in `loop.sh`;
    `set -u -o pipefail` but NOT `-e` (the failure counter, not a failed pass, stops
    the driver).
14. **A context report closes every pass.** `/context` is a REPL command no pass can
    run, so `util/pass-report.sh` prints the headline from the transcript (context
    at end of pass as a share of the window, turns, output tokens, cost) and appends
    it to `logs/context.log`. A rising figure means the startup reading is growing
    or units/chaining outgrow the window: tighten the doc set, the chaining cap or
    the unit sizes before passes start dying full.

## Scaffolding a new loop

1. Pick `<loop-name>` and the completion token `<LOOP-NAME>-LOOP-COMPLETE`.
2. Write the doc set from `templates.md`: `index.md` (map, reading order, status,
   token shapes, empty pass log), `ground-rules.md` (fill every per-loop slot — subject,
   gates, the how-to with literal commands, branch discipline), `items.md` (one section
   per item: reads / WHAT / FIX SHAPE / PIN; an Order section; sign-off queue if any).
3. **Draft the advance sign-offs** (point 5) — always, even without per-item
   verdicts: enumerate the decision classes passes will face and write each as a
   PROPOSED standing sign-off with its boundary. Every class left unasked returns as
   a halted loop.
4. Write `loop.sh` and `prompt.md` from the templates: DOC, DONE_TOKEN, ADD_DIRS (only
   the repos in scope), the tool preflight list; UTIL resolves to the sibling `util`
   checkout and the preflight fails fast without `pass-report.sh`. Add the `.gitignore`.
5. **Pre-check the allowlist** (point 11: denials are silent). Walk every command
   shape the ground rules prescribe — check, build, test, the hash pipeline, git by
   path, evidence archiving, the wait script by ABSOLUTE path (a relative invocation
   of an allow-listed script matches no rule and is denied) — against
   `.claude/settings*.json` and the measured facts under "Sobamail app repos", and
   add missing rules NARROWLY (literal first word / path prefix), never wildcards.
   `wait-for.sh` needs its own rule in `.claude/settings.local.json` —
   `Bash(bash /home/plq/src/arskom/amp/util/wait-for.sh *)`, never `bash <util>/*`
   (util holds push scripts). Verify the driver statically too: the anchored token
   greps against the real index (0 hits), the NEXT ITEM grep. The live shakedown is
   the OWNER's (step 8): one run with `MAX_PASSES=1`, then read the pass's
   `.err`/`.jsonl` for denials. On a loop with an open sign-off queue that pass
   lands on the arming gate and exits 2 — that IS a successful shakedown, and its
   parked questions open step 8's round.
6. Seed the facts doc (or name an existing one) for durable output, and point
   `zai/MEMORY.md` at it and at the plan of record.
7. Commit everything, including a "pass 0" pass-log line recording the loop's creation.
8. **End scaffolding with the sign-off round.** Put the drafted standing sign-offs
   (and per-item verdicts where needed) to the owner and record the verdicts
   VERBATIM: a small, uncontentious set goes straight into the ground rules; a
   larger or contentious one runs as a sign-off queue in `items.md` behind the
   arming gate. Point NEXT ITEM at the first item only once the verdicts are in.

   Scaffolding STOPS there: report the loop armed, hand the owner the literal run
   command and a PASS-COUNT ESTIMATE (items × units per item at the chaining cap,
   plus baseline and gate-completion overhead, arithmetic shown) so they can
   size `MAX_PASSES` (×1.5–2 for headroom) and the spend. **Never execute `loop.sh`
   or a raw `claude -p` pass from a scaffolding or operating session**, not even as
   a shakedown — launching is the owner's act.

   The round need not finish in the session: the doc set is a legitimate **work in
   progress** — commit what is known and WAIT; the arming gate, not scaffolding's
   completeness, decides when looping starts. Adopt each arriving answer and commit
   it as an "arming update" pass-log line.

## Retargeting an existing driver

Change **three things in lockstep**: `DOC`, `DONE_TOKEN`, `prompt.md`. A DONE_TOKEN
that does not match what the new doc set will write **never fires**, and the loop keeps
spawning passes past the end of the work. Re-check ADD_DIRS and the preflight tool list
against the new subject's scope while there. Copying a loop to a sibling app repo is
the same change plus the app's own literal paths (the module file, the pin encoding,
the facts doc) in the ground rules.

## Operating a running loop

- Launching is the owner's act, always: sessions scaffold, arm, answer halted
  questions and read logs, never run the driver.
- Watch: `tail -f` the newest file under `<loop-name>/logs/`; context trend in
  `<loop-name>/logs/context.log`, one line per pass (point 14).
- Exit 2 (halt): the driver prints the parked `OWNER QUESTION` lines. Answer them in
  the doc — verdicts VERBATIM — remove the halt token, rerun.
- Exit 1: read the newest `.err`/`.jsonl` pair before restarting; two consecutive
  failures usually mean a broken environment or a doc-set contradiction, not a flake.
- Knobs (env): `MODEL`, `MAX_PASSES`, `SLEEP_BETWEEN`, `PERMISSION_MODE`.
- After the loop: the owner deploys or reloads the app in a Sobamail profile and
  works through the facts doc's UNVERIFIED list — that shakedown is the runtime gate
  no pass could run.

## Feeding lessons back

A loop that discovers a new failure mode of the *pattern itself* (a denied command
shape, a gate that outgrew the pass, a stand-in runtime divergence) records it in its
own ground rules — and the generalizable part is backported HERE (SKILL.md /
templates.md), the way this repo's measured denials became the allowlist facts
above; otherwise the next scaffold re-learns it at pass-1 prices. A lesson about the
platform itself goes to the `sobamail-app` skill (its own repo), not here. When
backporting, DISPLACE words rather than append: state each rule once, in the one file
whose audience needs it, and trim what it supersedes — this skill has growth upkeep
too.
