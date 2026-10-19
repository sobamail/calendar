# Notes for Claude

- The frontent is a pnpm project. use pnpm.

- assets is the live dir maintained by the pnpm run dev-watch, ignore it

- Mutator.mjs and all that it imports comprise the Sobamail application backend.
  It doesn't support package managers like npm/pnpm.

- you MUST record durable facts, findings and lessons learnt in repo documents
  (e.g. `zai/messagemodel-invariants.md` — the facts document for the message
  model), not in assistant-local memory

- Always commit to whatever branch the current repo is, even when it's main/master.
  Trust that the owner must have set up the right branch to work on.

- In a long running task, proceed by committing any meaningful chunk of work,
  together with its tests if applicable, as you progress through it. Commits
  must not span multiple concerns
