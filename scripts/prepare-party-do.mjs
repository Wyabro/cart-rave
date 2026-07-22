// Ensures wrangler ASSETS directory exists for the party-do Workers Vitest pool.
// Party WebSocket routes never fetch ASSETS; this only satisfies wrangler boot.
// No-op when dist/ already has content from a prior Vite build.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const distDir = join(process.cwd(), "dist");
const indexPath = join(distDir, "index.html");

mkdirSync(distDir, { recursive: true });
if (!existsSync(indexPath)) {
  writeFileSync(indexPath, "<!doctype html><title>cart-clash party-do stub</title>\n", "utf8");
}
