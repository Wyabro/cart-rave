/**
 * health-check.mjs — deterministic drift gate for Command Center / STATUS semantics.
 *
 *   npm run health:check
 *
 * Exit 0 = ok · 1 = semantic findings · 2 = setup error.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { collectProjectHealth } from "./lib/projectHealth.mjs";
import { evaluateProjectHealth } from "./lib/projectHealthValidation.mjs";
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
  const health = await collectProjectHealth({ cwd });
  const result = evaluateProjectHealth({ statusMd, briefingMd, health });
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
