#!/usr/bin/env node
/**
 * setup.mjs — one-shot local bootstrap for a fresh clone (idempotent, safe to re-run).
 *
 *   npm run setup
 *
 * A clone is missing three local pieces that never travel through git:
 *   1. git hooks   — sets `git config core.hooksPath tools/git-hooks` so the tracked
 *                    pre-commit/post-commit hooks run. NOTE: this replaces any prior
 *                    local core.hooksPath for THIS repo (other clones are unaffected
 *                    until they run setup). Old copies under .git/hooks/ become inert —
 *                    git ignores that directory once hooksPath is set.
 *   2. skills      — `.claude/skills/` is gitignored (Windows symlink trap); mirrors
 *                    from `.agents/skills/` via tools/skills-sync.mjs.
 *   3. Command Center — builds the gitignored .diag-captures/ surfaces via
 *                    tools/refresh.mjs --offline.
 *
 * Exit non-zero if any step fails.
 */

import { spawnSync } from "node:child_process";

function step(label, cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.status !== 0) {
    console.error(`[setup] FAILED: ${label} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
  console.log(`[setup] ok: ${label}`);
}

step("git hooks (core.hooksPath → tools/git-hooks)", "git", [
  "config",
  "core.hooksPath",
  "tools/git-hooks",
]);
step("skills sync (.agents/skills → .claude/skills)", process.execPath, [
  "tools/skills-sync.mjs",
]);
step("Command Center surfaces (refresh --offline)", process.execPath, [
  "tools/refresh.mjs",
  "--offline",
]);
console.log("[setup] done — hooks installed, skills synced, Command Center built.");
