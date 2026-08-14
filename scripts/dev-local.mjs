/**
 * Local multiplayer dev (cart-clash branch): Vite client + Wrangler worker.
 * Prefer: npm run dev:local
 * Aliases: npm run dev:cart-clash · npm run dev:next-level (deprecated name)
 * See docs/brand.md for product vs infra naming.
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
    console.warn("[dev:local] vite optimize skipped:", err?.message || err);
  }
}

console.log(`
Cart Clash — local multiplayer
  Client (Vite):     http://127.0.0.1:3000/
  Worker (Wrangler): http://127.0.0.1:8899  (ws://127.0.0.1:8899/parties/main/<room>)

Open the client URL, pick a mode, and play. Ctrl+C stops both processes.
`);

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];

function spawnNpm(script) {
  // * Windows requires shell when spawning npm — shell:false throws EINVAL on Node 24+,
  // * and Node 24 deprecates args-array + shell:true (DEP0190), so the shell form gets
  // * one literal command string. `script` values are our own hardcoded names.
  const child = isWin
    ? spawn(`npm run ${script}`, { stdio: "inherit", shell: true, env: process.env })
    : spawn("npm", ["run", script], { stdio: "inherit", env: process.env });
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
