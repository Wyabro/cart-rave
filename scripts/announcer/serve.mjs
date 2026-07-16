#!/usr/bin/env node
// serve.mjs — minimal static server for the announcer review page.
// Usage: node serve.mjs <dir> [port]
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? ".");
const port = Number(process.argv[3] ?? 4390);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".wav": "audio/wav",
  ".opus": "audio/ogg",
  ".js": "text/javascript",
};

createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = path.join(dir, urlPath === "/" ? "review.html" : urlPath);
  // path traversal guard
  if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(port, "127.0.0.1", () => console.log(`review server on http://127.0.0.1:${port}/`));
