---
name: memory-conventions
description: Where project memory lives for this repo (repo-wide, in zai/)
metadata:
  type: feedback
---

Project memory for soba-calendar is **repo-wide**: stored as files in the `zai/` folder at the repo root and committed with the repo. `zai/MEMORY.md` is the index.

Do **not** use the workstation-wide `~/.claude/projects/.../memory/` store for this repo — memory travels with the repository.

**Why:** memory should live with the code, not on one workstation.
**How to apply:** write each new memory as a file in `zai/`, add a one-line pointer to `zai/MEMORY.md`, and link related notes with [[name]]. See [[calendar-architecture]]. Keep `zai/` to calendar-specific decisions: generic Sobamail platform knowledge (sha224 import pins, schema and check ops, SMC/wire format, the `soba.*` API, dev mode and deploy) belongs to the `sobamail-app` skill and must not be duplicated here. Facts docs hold the current state only: no history, dates or commits; a changed fact is rewritten in place.
