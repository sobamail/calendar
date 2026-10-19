---
name: git-workflow
description: Commit directly on the current branch (master); never create feature branches
metadata:
  type: feedback
---

When asked to commit, commit straight onto the checked-out branch (`master` here, and `main` in the `.claude/skills/sobamail-app` submodule). Do **not** create a feature branch first, even though that is Claude Code's default on a repo's main branch. The user's rule: "no branch just commit".

**Why:** the repo uses a Gerrit flow (the `commit-msg` hook adds `Change-Id`), so review happens per commit and local feature branches only get in the way.
**How to apply:** `git add` the specific files and `git commit` on the current branch; leave pushing to the user. In the skill submodule, the parent's gitlink must point at a commit that is pushed upstream before the parent is pushed.
