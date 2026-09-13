// Ensures wrangler ASSETS directory exists for the party-do Workers Vitest pool.
// Includes public-page fixtures so routing tests also work without a Vite build.
// Existing game build output is preserved.

import { mkdirSync, writeFileSync, existsSync, cpSync } from "node:fs";
import { join } from "node:path";

const distDir = join(process.cwd(), "dist");
const indexPath = join(distDir, "index.html");

mkdirSync(distDir, { recursive: true });
for (const name of ["404.html", "privacy", "terms", "privacy-choice.js", "info.css"]) {
  cpSync(join(process.cwd(), "public", name), join(distDir, name), { recursive: true });
}
if (!existsSync(indexPath)) {
  writeFileSync(indexPath, "<!doctype html><title>cart-clash party-do stub</title>\n", "utf8");
}
