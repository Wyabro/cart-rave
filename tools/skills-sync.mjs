/**
 * skills-sync.mjs — mirror the committed agent skills into Claude Code's local skills dir.
 *
 *   npm run skills:sync               # copy .agents/skills/* → .claude/skills/*
 *   npm run skills:sync -- --check    # report drift, write nothing, exit 1 if out of sync
 *   npm run skills:sync -- --json     # machine-readable (agents / CI consumers)
 *
 * Skills are vendored to `.agents/skills/` because that path is the cross-runtime alias —
 * Codex, Copilot CLI and Gemini CLI all read it, so one committed copy serves every tool
 * Wyatt routes work to (AGENTS.md § MODEL / TOOL ROUTING). Claude Code does not read it;
 * it reads `.claude/skills/`, which `.gitignore:47` deliberately excludes so the same
 * markdown isn't committed twice.
 *
 * The cost of that split is that a fresh clone has zero Claude-side skills and says nothing
 * about it — the skill simply never triggers. This closes the gap: one idempotent copy that
 * is safe to re-run whenever `.agents/skills/` changes.
 *
 * Direction is one-way on purpose. `.agents/` is the committed source of truth; edits made
 * under `.claude/skills/` are local-only and WILL be overwritten. Edit the `.agents/` copy.
 *
 * `--check` is the same comparison without the copy, so `health:check` can red-gate on drift
 * instead of letting a stale mirror sit there silently. It is skipped in CI, where
 * `.claude/skills/` is gitignored and therefore never present — see health-check.mjs.
 *
 * Exit codes: 0 synced / in sync · 1 drift (`--check` only) · 2 setup error (no source dir).
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, relative } from "node:path";
import { parseArgs, makeLogger } from "./lib/harness.mjs";

const log = makeLogger("skills-sync");

/** Committed, cross-runtime. The source of truth. */
const SRC = resolve(".agents/skills");
/** Claude Code's local read path — gitignored, rebuilt from SRC. */
const DEST = resolve(".claude/skills");

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

/**
 * Decide what each skill in SRC needs, without touching disk.
 * @param {string} src @param {string} dest
 * @returns {{ name: string, status: "created" | "updated" | "unchanged" }[]}
 */
export function planSync(src, dest) {
  return readdirSync(src, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const to = join(dest, e.name);
      if (!existsSync(to)) return { name: e.name, status: /** @type {const} */ ("created") };
      const same = hashDir(join(src, e.name)) === hashDir(to);
      return { name: e.name, status: same ? /** @type {const} */ ("unchanged") : /** @type {const} */ ("updated") };
    });
}

const isMain = process.argv[1] && /skills-sync\.mjs$/.test(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(SRC) || !statSync(SRC).isDirectory()) {
    log(`no ${relative(process.cwd(), SRC)} — nothing to sync.`);
    process.exit(2);
  }

  const plan = planSync(SRC, DEST);
  const check = args.check === true;

  if (!check) {
    mkdirSync(DEST, { recursive: true });
    for (const skill of plan) {
      if (skill.status === "unchanged") continue;
      cpSync(join(SRC, skill.name), join(DEST, skill.name), { recursive: true, force: true });
    }
  }

  const changed = plan.filter((s) => s.status !== "unchanged");

  if (args.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ src: SRC, dest: DEST, mode: check ? "check" : "sync", skills: plan }, null, 2));
    process.exit(check && changed.length ? 1 : 0);
  }

  if (!plan.length) {
    log("no skills in .agents/skills/ — nothing to sync.");
  } else if (!changed.length) {
    log(`${plan.length} skill(s) already in sync: ${plan.map((s) => s.name).join(", ")}`);
  } else if (check) {
    for (const s of changed) log(`DRIFT ${s.name} — .claude/skills/${s.name}/ is ${s.status === "created" ? "missing" : "stale"}`);
    log(`${changed.length} of ${plan.length} skill(s) out of sync — run \`npm run skills:sync\`.`);
    process.exit(1);
  } else {
    for (const s of changed) log(`${s.status.padEnd(9)} .claude/skills/${s.name}/`);
    log(`${changed.length} of ${plan.length} skill(s) synced from .agents/skills/.`);
  }
  process.exit(0);
}
