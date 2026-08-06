/**
 * health-check.mjs — deterministic drift gate for Command Center / STATUS semantics.
 *
 *   npm run health:check
 *
 * Exit 0 = ok · 1 = semantic findings · 2 = setup error.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { planSync } from "./skills-sync.mjs";
import { collectProjectHealth } from "./lib/projectHealth.mjs";
import { evaluateProjectHealth } from "./lib/projectHealthValidation.mjs";
import { SYSTEMS } from "./lib/archMap.mjs";
import { expandSystems } from "./lib/archModel.mjs";
import { buildArchManifest } from "./lib/archRender.mjs";
import { makeLogger } from "./lib/harness.mjs";

const log = makeLogger("health:check");

async function main() {
  const cwd = process.cwd();
  const statusMd = await readFile(resolve(cwd, "docs/STATUS.md"), "utf8");
  let briefingMd = "";
  try {
    briefingMd = await readFile(resolve(cwd, "docs/BRIEFING.md"), "utf8");
  } catch {
    /* missing → BRIEFING_MISSING finding */
  }
  // * Architecture map + freshness inputs. expandSystems verifies coverage of the real tree;
  // * the live digest comes from a freshly built manifest (line counts/churn excluded by design).
  const expansion = await expandSystems(cwd, SYSTEMS);
  let archJsonText = "";
  try {
    archJsonText = await readFile(resolve(cwd, "docs/ARCHITECTURE.json"), "utf8");
  } catch {
    /* missing → ARCH_MISSING finding */
  }
  const liveDigest = (await buildArchManifest(cwd, {})).source_digest;
  const archInput = { expansion, archJsonText, liveDigest };

  // * Skills mirror. .claude/skills/ is gitignored, so in CI it can never exist and the gate
  // * would be permanently red — collect the plan only on a developer machine.
  const skillsSrc = resolve(cwd, ".agents/skills");
  const skillsPlan = process.env.CI || !existsSync(skillsSrc)
    ? undefined
    : planSync(skillsSrc, resolve(cwd, ".claude/skills"));

  // * BACKLOG.md is committed like STATUS.md, so no CI escape hatch — read without a
  // * try/catch: a missing file is a setup error (exit 2), same as STATUS.md above.
  const backlogMd = await readFile(resolve(cwd, "docs/planning/BACKLOG.md"), "utf8");

  const health = await collectProjectHealth({ cwd });
  const result = evaluateProjectHealth({ statusMd, briefingMd, health, archInput, skillsPlan, backlogMd });
  for (const f of result.findings) {
    const tag = f.severity === "error" ? "ERR" : "WARN";
    log(`${tag} ${f.code}: ${f.message}`);
  }
  if (!result.ok) {
    log(`${result.findings.filter((f) => f.severity === "error").length} error(s)`);
    process.exit(1);
  }
  log("ok");
  process.exit(0);
}

main().catch((e) => {
  console.error("[health:check] FATAL:", e instanceof Error ? e.stack : e);
  process.exit(2);
});
