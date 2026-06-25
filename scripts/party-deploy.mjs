/**
 * Copies Vite dist/ into party-static/ for PartyKit static hosting.
 * Sourcemaps are omitted — they are large and break flaky PartyKit uploads.
 */
import { cpSync, existsSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const out = join(root, "party-static");

function shouldCopy(name) {
  return !name.endsWith(".map");
}

function copyFiltered(src, dest) {
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (path) => {
      const base = path.split(/[/\\]/).pop() ?? "";
      if (path === src) return true;
      try {
        if (statSync(path).isDirectory()) return true;
      } catch {
        return false;
      }
      return shouldCopy(base);
    },
  });
}

if (!existsSync(join(dist, "index.html"))) {
  throw new Error("dist/index.html missing — run npm run build first");
}

copyFiltered(dist, out);

const indexPath = join(out, "index.html");
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, "utf8");
  const stamp = `<!-- party-static ${new Date().toISOString()} -->`;
  const next = html.includes("<!-- party-static ")
    ? html.replace(/<!-- party-static [^>]+ -->/, stamp)
    : html.replace("</head>", `  ${stamp}\n</head>`);
  writeFileSync(indexPath, next);
}

const assetsDir = join(out, "assets");
if (existsSync(assetsDir)) {
  for (const name of readdirSync(assetsDir)) {
    if (name.endsWith(".map")) rmSync(join(assetsDir, name), { force: true });
  }
}
