---
name: github-mirror
description: The public GitHub mirror is produced only by github-sync/sync.sh; what it leaves out and rewrites
metadata:
  type: project
---

github.com/sobamail/calendar (cloned at `~/src/github/sobamail/calendar`) carries this repo's source code, not its history: the tree minus `ui/public/fonts` (Idealist Sans) and `ui/public/icons` (the design system's set), with generic stand-ins for the three icons the UI loads and `.gitmodules` on HTTPS URLs. `github-sync/sync.sh` stages that tree in the mirror clone; its header is the full description.

**Why:** the fonts and icons may not be redistributed; a public clone holds no SSH key for the skill submodule.
**How to apply:** never hand-copy files into the mirror; change `EXCLUDE`, `overlay/` or `GITMODULES_SED` in the script instead. The owner runs it, then commits and pushes in the mirror.
