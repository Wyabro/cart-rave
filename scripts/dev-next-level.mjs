/**
 * Local dev for the next-level branch: Vite client + preview PartyKit worker.
 * No deploy required — avoids Cloudflare custom-domain limits on partykit.dev.
 */
import { execSync, spawn } from "node:child_process";

const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

function prebundleViteDeps() {
  try {
    console.log("Pre-bundling Vite deps (one-time warmup)…");
    execSync(`${npm} exec vite optimize`, {
      stdio: "inherit",
      env: process.env,
      shell: isWin,
    });
  } catch (err) {
    console.warn("[dev:next-level] vite optimize skipped:", err?.message || err);
  }
}

console.log(`
Cart Rave — next-level local multiplayer
  Client (Vite):     http://127.0.0.1:3000/
  PartyKit preview:  http://127.0.0.1:1999  (ws://127.0.0.1:1999/parties/main/<room>)

Open the client URL, pick a mode, and play. Ctrl+C stops both processes.

Optional — shareable remote preview (deploy only when needed):
  npm run build:party-static && npm run deploy:preview
`);

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];

function spawnNpm(script) {
  // * Windows requires shell when spawning npm.cmd — shell:false throws EINVAL on Node 24+.
  const child = spawn(npm, ["run", script], {
    stdio: "inherit",
    shell: isWin,
    env: process.env,
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) shutdown(code ?? 1);
  });
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

prebundleViteDeps();
spawnNpm("dev");
spawnNpm("dev:party:preview");
