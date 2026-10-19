# Handoff-loop file templates

Skeletons for the five files of a handoff loop in a Sobamail app repo (see `SKILL.md`
for the contract and the repo facts). `<angle-bracket>` slots are per-loop fill-ins;
the literal paths are this host's. Keep the load-bearing comments — they encode the
reasons; a future retargeting relies on them. `<APP>` below is the absolute path of
the app repo, e.g. `/home/plq/src/arskom/amp/soba-calendar`.

## `<loop-name>/loop.sh` — the driver

```bash
#!/usr/bin/env bash
# Drives the <loop-name> loop: <one-line subject>, one pass per
# iteration. Every iteration is a FRESH `claude -p` invocation: context
# resets each time; the doc set indexed by $DOC below is the only memory
# between passes. The per-pass prompt lives in prompt.md next to this
# script. Run it as `bash <loop-name>/loop.sh` from the repo root (the
# file carries no exec bit: chmod has no allowlist rule).
#
# ARMING: do not run this before the sign-off queue in the doc set's
# items.md is fully dispositioned — a premature pass parks the round and
# exits 2 (the ground rules' ARMING GATE), which wastes a pass doing it.
# <delete this paragraph if the loop has no sign-off queue>
#
# OWNER-RUN: this driver is launched by the OWNER in their own terminal.
# Assistant sessions scaffold, arm, answer halted questions and read
# logs — they never execute it.
#
# Retargeting this driver at another subject means changing THREE things
# in lockstep: DOC, DONE_TOKEN (each loop's doc carries its OWN
# completion token) and prompt.md. A DONE_TOKEN that does not match the
# doc never fires, so the loop would keep spawning passes past the end
# of the work.
#
# Stop conditions (checked before every pass):
#   - $DONE_TOKEN appears in the doc        -> done, exit 0
#   - LOOP-HALT appears in the doc          -> a pass parked owner
#                                              question(s) and no item was
#                                              actionable; exit 2 — answer in
#                                              the doc, remove the token,
#                                              rerun
#   - two consecutive nonzero pass exits    -> exit 1 (inspect the log)
#   - MAX_PASSES exhausted                  -> exit 1
#
# Knobs (env): MODEL, MAX_PASSES, SLEEP_BETWEEN, PERMISSION_MODE.
# Logs: one file per pass under logs/ next to this script (tail -f to
# watch), plus logs/context.log — one end-of-pass context line per
# pass, the headless stand-in for /context, written by the shared
# util/pass-report.sh after each pass. evidence/ holds archived test
# output the passes save (both dirs are gitignored via this
# directory's .gitignore).
#
# After every pass the driver runs util/pull-all.sh IF it exists
# (`git pull --rebase` in every sibling repo under the amp root); a
# missing script is skipped, since a Gerrit app repo is synchronized by
# the owner's push.

# -u/pipefail but NOT -e: a failed pass must not kill the driver — the
# consecutive-failure counter below decides when to stop.
set -u -o pipefail

MODEL="${MODEL:-opus}"
MAX_PASSES="${MAX_PASSES:-30}"
SLEEP_BETWEEN="${SLEEP_BETWEEN:-15}"
PERMISSION_MODE="${PERMISSION_MODE:-dontAsk}"

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )" # "
REPO="$( cd "$DIR/.." && pwd )"                 # the app repo — hosts the doc set
PARENT="$( cd "$REPO/.." && pwd )"              # the amp checkout root (the siblings)
UTIL="$PARENT/util"                             # shared loop helpers (pass-report.sh, wait-for.sh)
PULL_ALL="$UTIL/pull-all.sh"                    # optional post-pass sync
DOC="$REPO/zai/<loop-name>/index.md"
LOG_DIR="$DIR/logs"
EVIDENCE_DIR="$DIR/evidence"
PROMPT_FILE="$DIR/prompt.md"

DONE_TOKEN="<LOOP-NAME>-LOOP-COMPLETE"
HALT_TOKEN="LOOP-HALT"

# Scope: ONLY the repos the ground rules put in scope — read-only
# context repos included, everything else excluded. The app repo itself
# is the working directory and needs no entry.
ADD_DIRS=(
    "$PARENT/soba-contacts"      # read-only: the reference implementation of the recipe
)

# Fail fast on a broken environment: a pass without the toolchain cannot
# do anything except burn money diagnosing itself.
for t in claude git pnpm sha224sum basenc; do
    if ! command -v "$t" >/dev/null 2>&1; then
        echo "[loop] '$t' not on PATH — fix the environment before running" >&2
        exit 1
    fi
done

if [[ ! -r "$PROMPT_FILE" ]]; then
    echo "[loop] prompt file missing: $PROMPT_FILE" >&2
    exit 1
fi
if [[ ! -r "$DOC" ]]; then
    echo "[loop] doc missing: $DOC" >&2
    exit 1
fi
if [[ ! -r "$UTIL/pass-report.sh" ]]; then
    echo "[loop] shared helper missing: $UTIL/pass-report.sh (the util checkout beside this repo)" >&2
    exit 1
fi
PROMPT=$(<"$PROMPT_FILE")

mkdir -p "$LOG_DIR" "$EVIDENCE_DIR"

add_dir_flags=()
for d in "${ADD_DIRS[@]}"; do
    add_dir_flags+=(--add-dir "$d")
done

consecutive_failures=0

for ((pass = 1; pass <= MAX_PASSES; pass++)); do
    # Anchored matches only: the doc's own instructions NAME both tokens
    # mid-sentence, so a bare grep would false-positive. Both tokens are
    # LABELS on their own lines: completion = the token alone on its own
    # line; halt = the token alone on its own (possibly blockquoted)
    # line, parked next to standalone "OWNER QUESTION (...):" lines.
    # [[:space:]]* also eats a stray \r if the doc ever lands with CRLF
    # endings.
    if grep -qE "^$DONE_TOKEN[[:space:]]*$" "$DOC"; then
        echo "[loop] $DONE_TOKEN found in the doc — the work is done."
        exit 0
    fi
    if grep -qE "^(> *)?$HALT_TOKEN[[:space:]]*$" "$DOC"; then
        echo "[loop] $HALT_TOKEN found in the doc — no item was actionable; question(s) for the owner:"
        grep -nE "^(> *)?OWNER QUESTION" "$DOC" || true
        echo "[loop] answer in the doc (record sign-offs verbatim), remove the token, rerun."
        exit 2
    fi

    echo "[loop] ---- pass $pass/$MAX_PASSES $(date -Is) ----"
    grep -m1 "NEXT ITEM:" "$DOC" || true

    log="$LOG_DIR/pass-$(date +%Y%m%d-%H%M%S).jsonl"
    echo "[loop] running claude (model=$MODEL, permission-mode=$PERMISSION_MODE); log: $log"

    # stream-json gives a full machine-readable transcript per pass
    # (every message and tool call, one JSON object per line); stderr
    # goes to .err.
    if (cd "$REPO" && claude -p "$PROMPT" \
        --model "$MODEL" \
        --permission-mode "$PERMISSION_MODE" \
        --verbose --output-format stream-json \
        "${add_dir_flags[@]}") >"$log" 2>"${log%.jsonl}.err"; then
        echo "[loop] pass $pass finished."
        # Result text, the newest pass-log line (the RELIABLE handoff
        # record — the result is only as good as the pass's closing
        # text) and the context report, appended to logs/context.log:
        # the shared driver-side helper; its header says what each line
        # means and how to read the context trend.
        bash "$UTIL/pass-report.sh" "$log" "$DOC" "$pass" "$LOG_DIR/context.log" || true
        consecutive_failures=0
    else
        rc=$?
        consecutive_failures=$((consecutive_failures + 1))
        echo "[loop] pass $pass exited rc=$rc ($consecutive_failures consecutive failure(s))."
        if ((consecutive_failures >= 2)); then
            echo "[loop] two consecutive failures — stopping for a human. See $LOG_DIR."
            exit 1
        fi
    fi

    # Optional post-pass sync of every sibling repo under the amp root.
    # Its exit status is informational — a refused rebase (a dirty tree)
    # is printed, not fatal.
    if [[ -r "$PULL_ALL" ]]; then
        echo "[loop] pull-all after pass $pass:"
        bash "$PULL_ALL" || echo "[loop] pull-all exited rc=$? — continuing"
    fi

    echo

    sleep "$SLEEP_BETWEEN"

    # Branch regime (ground rules): the app repo commits on the branch
    # its checkout is on. Commits stay LOCAL — the owner pushes.
done

echo "[loop] MAX_PASSES=$MAX_PASSES reached without $DONE_TOKEN — stopping for a human."
exit 1
```

## `<loop-name>/prompt.md` — the per-pass bootstrap

One paragraph, no state. Anything that changes as the loop runs belongs in the doc
set, never here.

```text
Continue the <loop-name> loop (<one-breath subject: what is being
closed/hardened/worked, per what plan — measure, fix test-first, verify,
record>) — one pass of many. The entry point and ONLY inter-pass memory
is the doc set indexed by zai/<loop-name>/index.md in <app repo>.
STARTUP (nothing more): read that INDEX and follow its reading order —
zai/<loop-name>/ground-rules.md is the protocol and its ARMING GATE
comes before everything; invoke the sobamail-app skill (Skill tool) —
it is the platform reference and a fresh pass has not loaded it; read
ONLY the subject docs the current item's
"reads" line names, plus the ONE item section in
zai/<loop-name>/items.md the NEXT ITEM pointer names — whatever it
names now; do not trust any item name written into this prompt, the doc
set is the authority. Also read the repo's CLAUDE.md. Every recorded
claim, line number and census is a hypothesis — re-measure before
acting. Execute at least ONE unit — chaining more only per the ground
rules' CHAINING rule — run the end-of-pass protocol from the ground
rules (growth upkeep included), then STOP at the pass boundary and end
on a short closing text summary.
```

Drop the "and its ARMING GATE comes before everything" clause if the
loop has no arming gate.

## `<loop-name>/.gitignore`

```text
/logs/
/evidence/
```

## `zai/<loop-name>/index.md` — the map

```markdown
# <Loop-name> loop — INDEX

The loop that <subject, one paragraph: the items, the plan of record
with its doc path>. Driver: `<loop-name>/loop.sh` — a fresh
`claude -p` per pass; THIS doc set is the only inter-pass memory.

## Reading order (STARTUP, nothing more)

1. `ground-rules.md` (next to this file) — the protocol, every pass.
   Its ARMING GATE comes before everything.
2. Load the `sobamail-app` skill: invoke it with the Skill tool (name
   `sobamail-app`). A fresh pass has NOT loaded it — project skills are
   listed, never auto-applied — and it is the platform reference every
   backend, wire and UI decision rests on. If the Skill tool is missing,
   read `.claude/skills/sobamail-app/SKILL.md` instead. Its
   `references/*.md` are read only when the item's "reads" line names
   them.
3. The ONE item section in `items.md` that the NEXT ITEM pointer below
   names — whatever it names now.
4. The subject docs that item's "reads" line names — nothing else.
5. The repo's `CLAUDE.md`.

## Status

NEXT ITEM: <item-id, or "(NOT ARMED — sign-off round pending)">

<created date; arming state; anything the next pass must know that has
no better home. Keep it short — this is a pointer, not a log.>

## Owner questions (parking area)

(none parked)

## Tokens (the driver greps this file — never reproduce the shapes early)

- Completion: when the LAST item closes AND <the loop's gate> has run
  fully green in that pass, the pass writes the completion token — the
  string <LOOP-NAME>-LOOP-COMPLETE alone on its own line — at the top
  of this file. The driver matches whole lines only, so the
  mid-sentence mentions in this section never fire.
- Halt: only when NO item is actionable (not armed, all blocked or all
  done), park the pending question(s) as standalone
  "OWNER QUESTION (…):" blockquote lines above, then add a blockquote
  line holding the halt token — the string LOOP-HALT alone on that
  line, optionally after "> " — commit, stop. The driver exits 2 on
  that exact shape.

## Pass log (newest first; `> -` prefixed lines, ≤3 sentences, cap ~10)

> - <date> pass 0 (creation): doc set created — <plan of record>,
>   ground rules, items <list>, driver. <Armed at item X / NOT armed;
>   owner verdicts next.>
```

The pass-log format is load-bearing: `util/pass-report.sh` prints the newest `> - `
entry plus its `>   ` continuation lines as the per-pass summary.

The log starts before the first pass: while the loop sits unarmed waiting on the
owner (SKILL.md, scaffolding step 8), each adopted answer or correction is committed
with its own `> - <date> arming update N: …` line — pre-arming evolution is loop
history like any pass.

## `zai/<loop-name>/ground-rules.md` — the loop contract

Every section below stays (only the arming gate is conditional — its own note says
when to delete it); the `<…>` slots are the per-loop content. Keep the file
self-sufficient — a pass reads nothing else before acting on it.

```markdown
# <Loop-name> ground rules: the loop contract

**Read this file in EVERY pass, before touching anything.** It holds the
arming gate, the pass protocol, the check/build/test how-to, the fix
discipline, the evidence rules, the gates and the recording rules. The
index (`index.md` next to this file) says which other files your pass
needs.

## Subject and outputs

<What the loop does and the plan of record (doc path) whose analysis
governs — re-derive nothing it already settles. What "an item closes"
means (fix committed WITH its failing-first tests, gates green).
Durable facts go to <facts doc path>. Working state lives in `items.md`
and is deleted as items close.>

## ARMING GATE (checked FIRST, every pass)

<Delete this section if the loop needs no sign-off; then the loop is
born armed.> The loop is armed only when the sign-off queue in
`items.md` is fully dispositioned: every queued item carries an
owner-filled VERDICT line (approved / rejected / modified, in the
owner's words). Until then a pass does exactly this and NOTHING else:
park one standalone "OWNER QUESTION (sign-off round): …" line per
unverdicted item in the index, add the halt token per the index's token
shapes, commit, stop. Approved items get ordered into `items.md`'s
Order section; rejected ones move their distilled record to <the plan
of record>'s rejected section and their item section is DELETED.

## Owner sign-offs recorded in advance (<date>)

<Every loop carries this section — drafting it is a scaffolding step
(SKILL.md), and scaffolding ends with the owner dispositioning it.
Enumerate the decision classes passes will predictably face —
dependency installs, schema changes, accepting mail deliveries, UI
chrome removal, scope exclusions, read-only repos — and record the
verdicts VERBATIM. Every class left unasked resurfaces later as a
parked question and a halted loop.>
Granted at loop setup; a pass relies on these WITHOUT parking a
question. Anything outside their wording still parks.

1. STANDING — passes NEVER edit `.claude` settings files. A prescribed
   command shape that is silently denied is recorded verbatim in the
   item, an owner question is parked, and the pass moves on.
2. <standing permission, in the owner's words, with its boundary — e.g.
   "a new attr key under an existing attr table is free; a new table
   parks first">.
3. <…>

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
   carries its pin update in the same commit; update the item's section
   in `items.md`; point the NEXT ITEM pointer in the index at the item
   the next pass should work — usually the SAME item until it closes or
   parks; append ONE pass-log line there (newest first); perform the
   growth upkeep below; commit per the branch discipline.
6. STOP at the pass boundary; end on a short closing text summary. The
   driver prints your final message as the pass result, so the summary
   is the last thing the pass does.

## Units and the item lifecycle

<Rename the unit taxonomy to fit the subject; the three SHAPES are the
invariant: measurement-only, code-change, doc-only.>

- MEASURE: measurement only, NO committed source edits — reproduce the
  claim, run the relevant suites, record the census in the item
  (counts, first errors verbatim with file:line, the exact commands).
  Local experiments are allowed but must be reverted before the pass
  ends (`git status` clean except docs).
- FIX: code edits — ONE coherent chunk sized to finish inside the pass,
  ALWAYS failing-test-first: add the test, run it red, fix, run it
  green. Every chunk ends with the check plus the relevant test run
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
    pre-existing at baseline), condensed record (≤8 lines) in <facts
    doc>, item section DELETED from `items.md`.
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
`git clean -f -- <path>`). The working directory is the repo root;
every pnpm command is `pnpm -C ui …`.

- Types and Svelte: `pnpm -C ui run check` — 0 errors; <the warning
  baseline recorded at the first MEASURE, by file and rule>.
- Build: `pnpm -C ui run build` (into `ui/dist`, gitignored). The live
  `assets/` dir is the owner's dev-watch output: never built or
  committed by a pass.
- Tests: `pnpm -C ui run test` (vitest, whole suite); one file:
  `pnpm -C ui run test -- src/lib/<x>.test.ts`. Backend handlers run
  on the stand-in runtime in `ui/src/test/soba.ts` (sql.js); the UI
  against the fetch stub in `ui/src/test/backend.ts`. <Baseline: file
  and test counts as the first MEASURE recorded them, with the date.>
- Module pin, after EVERY change to `sobamail.com/module/<app>/v1.mjs`:
  `sha224sum sobamail.com/module/<app>/v1.mjs | cut -d' ' -f1 | basenc --base16 -d | basenc --base32hex | tr -d '='`
  prints the base32hex pin; put it into the `?sha224=` of every import
  of the module (`Mutator.mjs`) in the SAME commit. A module that
  imports another module is a leaf first, `Mutator.mjs` last.
- The runtime itself is out of reach: no deploy, no dev-mode reload, no
  mail. Anything only the live runtime can prove is recorded in the
  facts doc's UNVERIFIED list and left to the owner's shakedown.
- Chrome 117 (CEF) is the UI target: no syntax or API newer than that
  in shipped code.

## Fix discipline

- Failing test first, always: write the test against current behavior,
  watch it fail for the RIGHT reason, then fix. When a red might be
  pre-existing, prove it: `git stash` the work, rerun, `git stash pop`.
- Test tiers: pure helpers against nothing; module request handlers on
  the stand-in runtime; UI flows in jsdom against the fetch stub. The
  stand-in mirrors `Mutator.mjs`'s tables by hand — a schema change
  updates both in the same commit.
- Replicated handlers (a table's `insertEvent`, `DeleteRow`) stay
  deterministic: `soba.data.*` and pure code only; `soba.db.exec`,
  `soba.type.uuid.v4()`, `soba.mail.send`, clocks belong to request
  handlers (`sobamail-app` skill, references/runtime-api.md). Read
  with `soba.db.exec` before `soba.data.find`: a find on a never-
  inserted key throws and aborts the pass.
- Format like the surrounding code: backend clang-format style (100
  columns, 4 spaces, `! x`, double quotes); UI as Prettier left it.
- An out-of-scope discovery (a flake, an unrelated bug) gets a dated
  entry in the item and nothing more — do NOT divert the pass into
  chasing it; it goes to the owner or to its own loop.
- <Loop-specific constraints: wire compatibility with existing stored
  rows, helpers to extend rather than duplicate, forbidden shortcuts.>

## Gates

FIX passes run the gates; MEASURE runs what its census needs; BRIEF
runs nothing.

- gate-check: `pnpm -C ui run check` after every FIX; 0 errors,
  warnings not above the recorded baseline.
- gate-test: `pnpm -C ui run test` after every FIX; every test green
  (modulo reds recorded as pre-existing at baseline). If UNMEASURED at
  arming: the first MEASURE unit runs it on a clean tree and records
  the census (files, tests, every red by name with its first error
  verbatim) in `items.md` and the facts doc. Compare test NAMES, never
  counts.
- gate-build: `pnpm -C ui run build` by every pass that touched `ui/`.
- gate-pin: `Mutator.mjs`'s `?sha224=` equals the pipeline's output for
  the module, by every pass that touched the module.
- Completion: the LAST item closes AND the gates run fully green in
  that pass → write the completion token per the index.

## Evidence rules

- Archive gate runs by piping through tee at run time:
  `pnpm -C ui run test 2>&1 | tee <APP>/<loop-name>/evidence/<item>-gate-test.txt`.
- `<loop-name>/evidence/` is gitignored scratch; excerpt the
  load-bearing lines into the item's section — the doc is the durable
  record, evidence/ is scratch. Never put a credential, a token or a
  live address into evidence.
- Code evidence is `file:line` plus the load-bearing excerpt,
  re-measured in the same pass that cites it.

## Growth upkeep (every pass — the doc set must NOT grow indefinitely)

- The index holds only the map, the NEXT ITEM pointer, parked questions
  and the pass log: one `> -` prefixed line per pass, ≤3 sentences,
  newest first, CAPPED at the ~10 newest — delete older lines once
  their substance is in `items.md` or the facts doc.
- Closing an item: condensed record (≤8 lines — what was fixed, the
  tests that pin it, commits, final test numbers) into <facts doc>,
  then DELETE the item's section from `items.md`.
- Facts that stop being true are corrected in place — no strikethrough
  trails.

## Branch & commit discipline

- The app repo commits on the branch its checkout is on (CLAUDE.md:
  "Trust that the owner must have set up the right branch to work
  on"): `git branch --show-current` before committing, the branch
  recorded in the pass-log line; a repo off its recorded branch parks
  an owner question, the pass leaving the branch as found. Never
  create a branch. The Gerrit `commit-msg` hook adds the `Change-Id`.
- READ-only context: <sibling repos added with --add-dir>; the
  `.claude/skills/sobamail-app` submodule; `.claude/settings*.json`;
  `assets/`. An edit there parks an owner question first, with the
  diff.
- Ordinary per-concern commits, each carrying its tests; code and the
  doc updates of the same pass go in ONE commit per concern (a BRIEF
  pass commits docs only). NEVER amend a pushed commit; amending a
  still-local HEAD commit of the same pass is fine. Do NOT push —
  commits stay local; the owner synchronizes — so a pass ends with
  everything it touched COMMITTED.
- Git runs IN the repo, plain: the working directory is already the
  repo root; a sibling repo is reached with `cd /abs/path/<repo>` as
  its OWN tool call and left with `cd <APP>` right after. Never
  `git -C <repo>` and never a `cd … && git …` chain.
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
```

## `zai/<loop-name>/items.md` — working state

```markdown
# <Loop-name> loop items

Working state only — an item's section is DELETED when it closes
(ground rules, growth upkeep); durable output goes to <facts doc>. The
plan of record is <doc path> — every claim and line number there and
here is a hypothesis; re-measure before acting.

## Order

<Armed: the item order. Not armed: "NOT ARMED — sign-off round
pending" plus the intended order after arming.>

## <ID> — <title> (<OPEN|PROPOSED>, <signed|verdict pending>)

- reads: <the subject docs and sections this item needs — the index's
  reading order step 4 resolves through this line>.
- WHAT: <the problem, with the code locations as recorded — to be
  re-verified by the pass>.
- FIX SHAPE: <the intended fix and its constraints; name precedents>.
- PIN: <the failing-first test that will pin the fix — where it lives,
  what it asserts; or the recorded reason a deterministic test is not
  practical>.

## Sign-off queue (each needs an owner verdict BEFORE the loop is armed)

### <ID> — <title> (PROPOSED)

- CONTEXT: <why this is on the table; owner words quoted verbatim>.
- OPTIONS: <(a)/(b)/(c) with trade-offs>.
- VERDICT: (owner fills in: approved / rejected / modified — in the
  owner's words)
```
