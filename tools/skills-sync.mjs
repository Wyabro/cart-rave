/**
 * skills-sync.mjs — mirror the committed agent skills into every runtime that reads them.
 *
 *   npm run skills:sync               # copy .agents/skills/* → every installed runtime
 *   npm run skills:sync -- --check    # report drift, write nothing, exit 1 if out of sync
 *   npm run skills:sync -- --json     # machine-readable (agents / CI consumers)
 *
 * Skills are vendored to `.agents/skills/` because that path is the cross-runtime alias, and
 * it stays the single committed source of truth. The problem this file solves is that no two
 * agent runtimes agree on where to *read* skills from, and the failure is silent: an unsynced
 * skill does not error, it simply never fires.
 *
 * Measured 2026-08-02: the three committed skills reached Claude Code and nothing else — 0 of
 * 6 other runtimes had them. That made AGENTS.md's escalation ladder false, since step 3 names
 * `.agents/skills/systematic-debugging/SKILL.md` as "the procedure every tool can read" while
 * Cursor and Grok could not read it. Every runtime on the machine turned out to use the same
 * convention — a `skills/` dir under its config root — so one fan-out serves all of them.
 *
 * Direction is one-way on purpose. `.agents/` is the source of truth; edits made under any
 * destination are local-only and WILL be overwritten. Edit the `.agents/` copy.
 *
 * ## Two rules that keep this safe
 *
 * 1. **A destination is only written if its `skills/` dir already exists.** That is the
 *    install signal. This tool never creates a config dir for a runtime you do not have —
 *    the sole exception is the repo-local Claude mirror, which it owns outright.
 *
 * 2. **Orphan pruning is scoped to the repo mirror only.** `.claude/skills/` is created and
 *    fully owned here, so a skill deleted from `.agents/` is removed from it (the gap that let
 *    a deleted `hallmark` keep loading — SKILLSYNC-PRUNE-1). The user-level dirs are SHARED
 *    with other installers: `~/.cursor/skills` alone holds 13 skills this repo never placed.
 *    Pruning there would delete them. So user-level destinations are add/update only, never
 *    delete — deliberately, permanently.
 *
 * ## What red-gates, and what does not
 *
 * `health:check` gates on the **repo mirror only** (`planSync` against `.claude/skills`), the
 * same contract as before. A missing junction in `~/.grok/skills` must not fail `npm run qa` —
 * qa going red for reasons outside the repo is its own failure mode. User-level drift is
 * reported by `--check` and fixed by re-running; it never blocks a commit.
 *
 * Exit codes: 0 synced / in sync · 1 drift (`--check` only) · 2 setup error (no source dir).
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve, relative } from "node:path";
import { parseArgs, makeLogger } from "./lib/harness.mjs";

const log = makeLogger("skills-sync");

/** Committed, cross-runtime. The source of truth. */
const SRC = resolve(".agents/skills");

/**
 * Every runtime that reads a `skills/` dir, and where.
 *
 * `owned: true` means this tool created the directory and may prune orphans from it. Only the
 * repo-local Claude mirror qualifies — see rule 2 in the header before adding another.
 *
 * @type {{ id: string, label: string, dir: string, owned: boolean }[]}
 */
export const RUNTIME_TARGETS = [
  { id: "claude", label: "Claude Code (repo mirror)", dir: resolve(".claude/skills"), owned: true },
  { id: "cursor", label: "Cursor", dir: join(homedir(), ".cursor", "skills"), owned: false },
  { id: "grok", label: "Grok CLI", dir: join(homedir(), ".grok", "skills"), owned: false },
  { id: "codex", label: "Codex", dir: join(homedir(), ".codex", "skills"), owned: false },
  { id: "gemini", label: "Gemini / Antigravity", dir: join(homedir(), ".gemini", "skills"), owned: false },
  { id: "copilot", label: "Copilot CLI", dir: join(homedir(), ".copilot", "skills"), owned: false },
  { id: "opencode", label: "OpenCode", dir: join(homedir(), ".config", "opencode", "skills"), owned: false },
];

/** The repo mirror — the one destination `health:check` gates on. */
export const REPO_MIRROR = RUNTIME_TARGETS[0].dir;

/**
 * Content fingerprint of a skill directory: every file's relative path and bytes, sorted so
 * the hash is stable across platforms. Cheap enough at skill scale (tens of small .md files)
 * and immune to the mtime skew a fresh clone or a `cp -r` leaves behind.
 * @param {string} dir
 * @returns {string}
 */
export function hashDir(dir) {
  const h = createHash("sha256");
  for (const file of walk(dir).sort()) {
    h.update(relative(dir, file).replace(/\\/g, "/"));
    h.update(readFileSync(file));
  }
  return h.digest("hex");
}

/** @param {string} dir @returns {string[]} absolute file paths, recursively */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** @param {string} dir @returns {string[]} immediate subdirectory names, or [] if absent */
function subdirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * Decide what each skill in SRC needs, without touching disk.
 *
 * Signature and return shape are load-bearing: `health-check.mjs` and `skillsSync.test.js`
 * both call this directly. Do not widen it — add new planners alongside instead.
 *
 * @param {string} src @param {string} dest
 * @returns {{ name: string, status: "created" | "updated" | "unchanged" }[]}
 */
export function planSync(src, dest) {
  return subdirs(src).map((name) => {
    const to = join(dest, name);
    if (!existsSync(to)) return { name, status: /** @type {const} */ ("created") };
    const same = hashDir(join(src, name)) === hashDir(to);
    return { name, status: same ? /** @type {const} */ ("unchanged") : /** @type {const} */ ("updated") };
  });
}

/**
 * Skills present in `dest` that no longer exist in `src` — stale mirrors of deleted skills.
 * A pure read; the caller decides whether the destination is owned enough to act on it.
 *
 * This is the SKILLSYNC-PRUNE-1 gap: without it a skill deleted from `.agents/` kept loading
 * from the mirror indefinitely, and `--check` could not see it because the old planner only
 * ever walked the source.
 *
 * @param {string} src @param {string} dest
 * @returns {string[]} orphan skill names
 */
export function planPrune(src, dest) {
  const live = new Set(subdirs(src));
  return subdirs(dest).filter((name) => !live.has(name));
}

/**
 * Full plan across every runtime whose skills dir exists. Owned destinations also report
 * orphans; shared ones never do, because we are not allowed to delete there.
 *
 * @param {string} [src]
 * @returns {{ id: string, label: string, dir: string, owned: boolean, present: boolean,
 *             skills: ReturnType<typeof planSync>, orphans: string[] }[]}
 */
export function planAll(src = SRC) {
  return RUNTIME_TARGETS.map((t) => {
    // The repo mirror is ours to create; a user-level dir existing is the "installed" signal.
    const present = t.owned || existsSync(t.dir);
    return {
      ...t,
      present,
      skills: present ? planSync(src, t.dir) : [],
      orphans: present && t.owned ? planPrune(src, t.dir) : [],
    };
  });
}

const isMain = process.argv[1] && /skills-sync\.mjs$/.test(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(SRC) || !statSync(SRC).isDirectory()) {
    log(`no ${relative(process.cwd(), SRC)} — nothing to sync.`);
    process.exit(2);
  }

  const check = args.check === true;
  const plan = planAll();
  const active = plan.filter((t) => t.present);

  if (!check) {
    for (const t of active) {
      mkdirSync(t.dir, { recursive: true });
      for (const skill of t.skills) {
        if (skill.status === "unchanged") continue;
        cpSync(join(SRC, skill.name), join(t.dir, skill.name), { recursive: true, force: true });
      }
      for (const orphan of t.orphans) rmSync(join(t.dir, orphan), { recursive: true, force: true });
    }
  }

  const drifted = active.filter((t) => t.skills.some((s) => s.status !== "unchanged") || t.orphans.length);

  if (args.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ src: SRC, mode: check ? "check" : "sync", targets: plan }, null, 2));
    process.exit(check && drifted.length ? 1 : 0);
  }

  const skillCount = active[0]?.skills.length ?? 0;
  if (!skillCount) {
    log("no skills in .agents/skills/ — nothing to sync.");
    process.exit(0);
  }

  for (const t of plan.filter((x) => !x.present)) log(`skip     ${t.label} — not installed (${t.dir})`);

  if (!drifted.length) {
    log(`${skillCount} skill(s) in sync across ${active.length} runtime(s): ${active.map((t) => t.id).join(", ")}`);
    process.exit(0);
  }

  for (const t of drifted) {
    const changed = t.skills.filter((s) => s.status !== "unchanged");
    for (const s of changed) {
      const what = s.status === "created" ? "missing" : "stale";
      log(check ? `DRIFT    ${t.label}: ${s.name} (${what})` : `${s.status.padEnd(8)} ${t.label}: ${s.name}`);
    }
    for (const o of t.orphans) log(check ? `ORPHAN   ${t.label}: ${o} (deleted from .agents/)` : `pruned   ${t.label}: ${o}`);
  }

  if (check) {
    log(`${drifted.length} of ${active.length} runtime(s) out of sync — run \`npm run skills:sync\`.`);
    process.exit(1);
  }
  log(`synced ${skillCount} skill(s) to ${active.length} runtime(s).`);
  process.exit(0);
}
