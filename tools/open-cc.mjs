/**
 * open-cc.mjs — open a generated Command Center surface in the default browser.
 *
 *   npm run cc                     # regenerate everything (via the cc script) then open the dashboard
 *   node tools/open-cc.mjs architecture.html   # open a specific surface
 *
 * The `cc` npm script runs `npm run dashboard` first (which regenerates briefing + arch + dashboard),
 * so by the time this opens the file it is fresh. Cross-platform; degrades to just printing the URL.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const target = process.argv[2] ?? "dashboard.html";
const file = resolve(process.cwd(), ".diag-captures", target);
const url = pathToFileURL(file).href;

if (!existsSync(file)) {
  console.error(`[cc] ${target} not found — run \`npm run dashboard\` first (the cc script does this).`);
  process.exit(1);
}

const platform = process.platform;
const [cmd, args] =
  platform === "win32" ? ["cmd", ["/c", "start", "", url]] : platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];

try {
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  console.log(`[cc] opened ${url}`);
} catch (e) {
  // * Headless / no opener — the URL is still useful printed.
  console.log(`[cc] open manually: ${url}`);
  console.error(`[cc] (launcher failed: ${e instanceof Error ? e.message : e})`);
}
