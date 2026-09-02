#!/usr/bin/env node
/**
 * scripts/zip-crazygames.mjs — CrazyGames Basic Launch zip of dist/.
 *
 * `npm run zip:cg` runs `npm run build` first. This file only zips.
 * Output: tmp/cart-clash-crazygames.zip with index.html at the zip root.
 *
 * Caps (no SDK): zip ≤ 50 MB, ≤ 1500 files.
 * Excludes tooling / SEO / PWA files that still use root-absolute paths.
 */

import { existsSync, mkdirSync, rmSync, statSync, cpSync, readdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, "..");
export const DIST = join(ROOT, "dist");
export const ZIP_OUT = join(ROOT, "tmp", "cart-clash-crazygames.zip");

export const MAX_ZIP_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_COUNT = 1500;

export const EXCLUDE_NAMES = Object.freeze([
  ".chunk-manifest.json",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
]);

const EXCLUDE_SET = new Set(EXCLUDE_NAMES);
const SDK_NAME_RE = /crazygames|crazysdk/i;

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function countFiles(dir) {
  let n = 0;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) n += countFiles(p);
    else if (ent.isFile()) n += 1;
  }
  return n;
}

export function listRelativeFiles(dir, prefix = "") {
  /** @type {string[]} */
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listRelativeFiles(p, rel));
    else if (ent.isFile()) out.push(rel.replace(/\\/g, "/"));
  }
  return out;
}

/**
 * @param {string} srcDir
 * @param {string} destDir
 */
export function stageDist(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  const srcResolved = resolve(srcDir);
  cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => {
      if (resolve(src) === srcResolved) return true;
      return !EXCLUDE_SET.has(basename(src));
    },
  });
}

/**
 * @param {string} stagedDir
 * @param {string} zipPath
 */
export function zipStaged(stagedDir, zipPath) {
  mkdirSync(dirname(zipPath), { recursive: true });
  if (existsSync(zipPath)) rmSync(zipPath, { force: true });

  if (process.platform === "win32") {
    const ps = `
      $ErrorActionPreference = 'Stop';
      Compress-Archive -Path (Join-Path ${psQuote(stagedDir)} '*') -DestinationPath ${psQuote(zipPath)} -Force
    `;
    const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], {
      encoding: "utf8",
    });
    if (r.status !== 0) {
      throw new Error(`Compress-Archive failed: ${r.stderr || r.stdout}`);
    }
    return;
  }

  const r = spawnSync("zip", ["-r", "-q", zipPath, "."], {
    cwd: stagedDir,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`zip failed: ${r.stderr || r.stdout}`);
  }
}

/**
 * @param {string} zipPath
 * @returns {string[]}
 */
export function listZipEntryNames(zipPath) {
  if (process.platform === "win32") {
    const ps = `
      $ErrorActionPreference = 'Stop';
      Add-Type -AssemblyName System.IO.Compression.FileSystem;
      $z = [System.IO.Compression.ZipFile]::OpenRead(${psQuote(zipPath)});
      try { $z.Entries | ForEach-Object { $_.FullName } }
      finally { $z.Dispose() }
    `;
    const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], {
      encoding: "utf8",
    });
    if (r.status !== 0) {
      throw new Error(`zip list failed: ${r.stderr || r.stdout}`);
    }
    return String(r.stdout || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\\/g, "/"));
  }

  const r = spawnSync("unzip", ["-Z", "-1", zipPath], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`unzip -Z failed: ${r.stderr || r.stdout}`);
  }
  return String(r.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function assertNoSdk(relativeFiles) {
  const hit = relativeFiles.find((f) => SDK_NAME_RE.test(f));
  if (hit) {
    throw new Error(`CrazyGames SDK file in zip staging: ${hit}`);
  }
}

/**
 * @param {{ srcDir?: string, outPath?: string }} [opts]
 * @returns {Promise<{ outPath: string, bytes: number, fileCount: number, files: string[] }>}
 */
export async function zipCrazyGames(opts = {}) {
  const srcDir = opts.srcDir || DIST;
  const outPath = opts.outPath || ZIP_OUT;
  const indexPath = join(srcDir, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(`${indexPath} missing — run npm run build first.`);
  }

  const staging = await mkdtemp(join(tmpdir(), "cc-cg-zip-"));
  try {
    stageDist(srcDir, staging);
    if (!existsSync(join(staging, "index.html"))) {
      throw new Error("staged zip is missing index.html at root");
    }
    const files = listRelativeFiles(staging);
    assertNoSdk(files);
    const fileCount = files.length;
    if (fileCount > MAX_FILE_COUNT) {
      throw new Error(`file count ${fileCount} exceeds ${MAX_FILE_COUNT}`);
    }

    zipStaged(staging, outPath);
    const bytes = statSync(outPath).size;
    if (bytes > MAX_ZIP_BYTES) {
      throw new Error(`zip ${bytes} bytes exceeds ${MAX_ZIP_BYTES} (50 MB)`);
    }

    const entries = listZipEntryNames(outPath);
    const hasRootIndex = entries.some(
      (e) => e === "index.html" || e === "./index.html",
    );
    if (!hasRootIndex) {
      throw new Error("zip is missing index.html at archive root");
    }
    if (entries.some((e) => /(^|\/)dist\/index\.html$/.test(e))) {
      throw new Error("zip nested dist/ — Compress-Archive wrapped a folder");
    }
    for (const name of EXCLUDE_NAMES) {
      if (entries.some((e) => e === name || e.endsWith(`/${name}`))) {
        throw new Error(`zip still contains excluded ${name}`);
      }
    }

    return { outPath, bytes, fileCount, files };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function isCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  return pathToFileURL(resolve(entry)).href === import.meta.url;
}

if (isCli()) {
  zipCrazyGames()
    .then(({ outPath, bytes, fileCount }) => {
      const mb = (bytes / (1024 * 1024)).toFixed(2);
      console.log(`[zip:cg] ${outPath}`);
      console.log(`[zip:cg] ${bytes} bytes (${mb} MB) · ${fileCount} files`);
    })
    .catch((err) => {
      console.error("[zip:cg]", err?.message || err);
      process.exit(1);
    });
}
