/**
 * architecture.mjs — write docs/ARCHITECTURE.json, the committed agent-facing architecture map.
 *
 *   npm run arch              # regenerate from the tree + docs (no-op when the digest is unchanged)
 *   npm run arch -- --check   # exit 1 if the committed manifest is stale, write nothing
 *
 * Runs inside `npm run qa` (after briefing, before health:check) so the manifest self-heals on
 * every gate run; `health:check` fails on digest drift (ARCH_STALE) or an unmapped/duplicate/
 * missing file (ARCH_UNMAPPED_FILE / ARCH_DUPLICATE_CLAIM / ARCH_MISSING_FILE). Assembly +
 * digest: tools/lib/archRender.mjs. Line counts + churn are deliberately NOT written here — they
 * would churn every commit and break determinism (they live only in the HTML / health.json).
 *
 * The committed JSON is written only when its digest changes (zero-diff regens). The HTML page
 * (.diag-captures/architecture.html) is gitignored and stat-bearing (line counts + churn), so it
 * is rewritten on EVERY run — it must never influence the JSON or its digest.
 *
 * Exit 0 = fresh/written · 1 = --check found it stale · 2 = setup error.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildArchManifest, extractArchDigest } from "./lib/archRender.mjs";
import { buildArchModel } from "./lib/archModel.mjs";
import { SYSTEMS } from "./lib/archMap.mjs";
import { renderArchHtml } from "./lib/archHtml.mjs";
import { parseArgs, makeLogger, CAPTURE_DIR } from "./lib/harness.mjs";

const log = makeLogger("arch");

/** @param {string[]} argv */
function git(argv) {
  try {
    return execFileSync("git", argv, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

/**
 * Systems touched by src/ · party/ · shared/ commits in the last `days` days, mapped by changed
 * file path → claiming system. Returns [{ id, name, commits }] sorted by commit count desc.
 * @param {string} cwd
 * @param {Map<string, string[]>} bySystem
 * @param {any[]} systems
 * @param {number} [days]
 */
function movedSystems(cwd, bySystem, systems, days = 7) {
  const fileToSys = new Map();
  for (const [id, files] of bySystem.entries()) for (const f of files) fileToSys.set(f, id);
  const nameOf = Object.fromEntries(systems.map((s) => [s.id, s.name]));
  const raw = git(["log", `--since=${days}.days`, "--name-only", "--pretty=format:%H", "--", "src", "party", "shared"]);
  if (raw == null) return [];
  /** @type {Map<string, Set<string>>} */
  const perSys = new Map();
  let commit = null;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "") continue;
    if (/^[0-9a-f]{40}$/.test(t)) {
      commit = t;
      continue;
    }
    const sys = fileToSys.get(t);
    if (!sys || !commit) continue;
    (perSys.get(sys) ?? perSys.set(sys, new Set()).get(sys)).add(commit);
  }
  return [...perSys.entries()]
    .map(([id, set]) => ({ id, name: nameOf[id] ?? id, commits: set.size }))
    .sort((a, b) => b.commits - a.commits);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const archPath = resolve(cwd, "docs/ARCHITECTURE.json");

  const head = git(["rev-parse", "--short", "HEAD"]);
  const manifest = await buildArchManifest(cwd, { commit: head });
  const liveDigest = manifest.source_digest;

  let existing = "";
  try {
    existing = readFileSync(archPath, "utf8");
  } catch {
    /* first run */
  }
  const fresh = extractArchDigest(existing) === liveDigest;

  // --check is JSON-only (a gate) — never touch the gitignored HTML.
  if (args.check) {
    if (fresh) {
      log("fresh");
      process.exit(0);
    }
    log("STALE — docs/ARCHITECTURE.json lags the tree/docs. Run `npm run arch`.");
    process.exit(1);
  }

  // The committed JSON: write only on digest change (zero-diff regens).
  if (fresh) {
    log("docs/ARCHITECTURE.json already fresh — not rewritten");
  } else {
    writeFileSync(archPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    log(`wrote docs/ARCHITECTURE.json (digest ${liveDigest}) — commit it with your source change`);
  }

  // The HTML page: stat-bearing + gitignored → rewrite every run. A render failure must not fail
  // the arch gate (the JSON is the contract), so it is isolated.
  try {
    const model = await buildArchModel(cwd, SYSTEMS);
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    const commits30d = Number(git(["rev-list", "--count", "--since=30.days", "HEAD", "--", "src", "party", "shared"]) ?? 0) || 0;
    const html = renderArchHtml({
      manifest,
      model,
      git: { branch, head },
      generatedAt: new Date().toISOString(),
      commits30d,
      movedThisWeek: movedSystems(cwd, model.expansion.bySystem, SYSTEMS),
    });
    mkdirSync(CAPTURE_DIR, { recursive: true });
    const htmlPath = resolve(CAPTURE_DIR, "architecture.html");
    writeFileSync(htmlPath, html, "utf8");
    log(`architecture.html → ${htmlPath}`);
  } catch (e) {
    log(`HTML render skipped (JSON unaffected): ${e instanceof Error ? e.message : e}`);
  }
  process.exit(0);
}

try {
  await main();
} catch (e) {
  console.error("[arch] FATAL:", e instanceof Error ? e.stack : e);
  process.exit(2);
}
