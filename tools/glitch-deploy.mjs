#!/usr/bin/env node
/**
 * tools/glitch-deploy.mjs — Glitch multipart deploy (CI / trusted machine only).
 *
 * Env:
 *   GLITCH_DEPLOY_TOKEN  required — gl_deploy_* token (never commit)
 *   GLITCH_VERSION       optional — default GLITCH_GAME_VERSION from glitchConfig.js
 *   GLITCH_BUILD_TYPE    optional — production|playtest|demo (default from glitchConfig)
 *   GLITCH_ACTIVATE      optional — "1" to PUT status ready after processing starts
 *
 * Usage:
 *   npm run build
 *   $env:GLITCH_DEPLOY_TOKEN="gl_deploy_..."; npm run ship:glitch
 */

import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { GLITCH_BUILD_TYPE, GLITCH_GAME_VERSION } from "../src/analytics/glitchConfig.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const TITLE_ID = "bf9f27c8-27be-4996-a3f0-cc4dc68ad2bb";
const API = `https://api.glitch.fun/api/titles/${TITLE_ID}`;
const PART_SIZE = 5 * 1024 * 1024; // 5 MiB minimum (except last)

const token = String(process.env.GLITCH_DEPLOY_TOKEN || "").trim();
const version = String(process.env.GLITCH_VERSION || GLITCH_GAME_VERSION).slice(0, 20);
const buildType = String(process.env.GLITCH_BUILD_TYPE || GLITCH_BUILD_TYPE);
const activate = process.env.GLITCH_ACTIVATE === "1" || process.env.GLITCH_ACTIVATE === "true";

if (!token) {
  console.error("[glitch:deploy] Set GLITCH_DEPLOY_TOKEN (gl_deploy_*) — never commit it.");
  process.exit(1);
}
if (!["production", "playtest", "demo"].includes(buildType)) {
  console.error("[glitch:deploy] GLITCH_BUILD_TYPE must be production|playtest|demo");
  process.exit(1);
}
if (!existsSync(join(DIST, "index.html"))) {
  console.error("[glitch:deploy] dist/index.html missing — run npm run build first.");
  process.exit(1);
}

async function api(path, body, method = "POST") {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 400)}`);
    err.status = res.status;
    err.json = json;
    throw err;
  }
  return json;
}

async function zipDistContents(zipPath) {
  // Prefer PowerShell Compress-Archive on Windows; zip CLI elsewhere.
  if (process.platform === "win32") {
    const ps = `
      $ErrorActionPreference = 'Stop';
      if (Test-Path -LiteralPath '${zipPath.replace(/'/g, "''")}') { Remove-Item -LiteralPath '${zipPath.replace(/'/g, "''")}' -Force }
      Compress-Archive -Path '${DIST.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force
    `;
    const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
    if (r.status !== 0) {
      throw new Error(`Compress-Archive failed: ${r.stderr || r.stdout}`);
    }
    return;
  }
  const r = spawnSync("zip", ["-r", "-q", zipPath, "."], { cwd: DIST, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`zip failed: ${r.stderr || r.stdout}`);
  }
}

async function putPart(url, buffer) {
  const res = await fetch(url, { method: "PUT", body: buffer });
  if (!res.ok) {
    throw new Error(`part PUT HTTP ${res.status}`);
  }
  const etag = res.headers.get("etag") || res.headers.get("ETag");
  if (!etag) throw new Error("part PUT missing ETag");
  return etag;
}

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), "cc-glitch-"));
  const zipPath = join(tmp, "cart-clash.zip");
  try {
    console.log("[glitch:deploy] zipping dist/* →", zipPath);
    await zipDistContents(zipPath);
    const size = statSync(zipPath).size;
    console.log(`[glitch:deploy] zip ${size} bytes · version=${version} · build_type=${buildType}`);

    const initiated = await api("/deployments/multipart/initiate", {});
    const filePath = initiated.file_path;
    const uploadId = initiated.upload_id;
    const isLocal = Boolean(initiated.is_local);

    if (isLocal) {
      if (!initiated.upload_url) throw new Error("local mode missing upload_url");
      const buf = await import("node:fs/promises").then((fs) => fs.readFile(zipPath));
      const put = await fetch(initiated.upload_url, { method: "PUT", body: buf });
      if (!put.ok) throw new Error(`local PUT HTTP ${put.status}`);
    } else {
      if (!uploadId || !filePath) throw new Error("S3 initiate missing upload_id/file_path");
      const partCount = Math.max(1, Math.ceil(size / PART_SIZE));
      const partNumbers = Array.from({ length: partCount }, (_, i) => i + 1);
      console.log(`[glitch:deploy] requesting ${partCount} part URL(s)`);
      const urlsResp = await api("/deployments/multipart/urls", {
        upload_id: uploadId,
        file_path: filePath,
        part_numbers: partNumbers,
      });
      const urls = urlsResp.urls || {};
      const { readFile } = await import("node:fs/promises");
      const fileBuf = await readFile(zipPath);
      /** @type {{ PartNumber: number, ETag: string }[]} */
      const parts = [];
      for (const n of partNumbers) {
        const start = (n - 1) * PART_SIZE;
        const end = Math.min(start + PART_SIZE, size);
        const slice = fileBuf.subarray(start, end);
        const url = urls[String(n)] || urls[n];
        if (!url) throw new Error(`missing URL for part ${n}`);
        process.stdout.write(`[glitch:deploy] uploading part ${n}/${partCount} (${slice.length} bytes)… `);
        const etag = await putPart(url, slice);
        console.log("ok");
        parts.push({ PartNumber: n, ETag: etag });
      }
      parts.sort((a, b) => a.PartNumber - b.PartNumber);
      const completed = await api("/deployments/multipart/complete", {
        upload_id: uploadId,
        file_path: filePath,
        parts,
      });
      if (completed && completed.success === false) {
        throw new Error(`complete failed: ${JSON.stringify(completed)}`);
      }
    }

    console.log("[glitch:deploy] confirm…");
    const build = await api("/deployments/confirm", {
      file_path: filePath,
      version_string: version,
      build_type: buildType,
      deployment_type: "iframe",
      entry_point: "index.html",
      custom_variables: {
        engine: "vite",
        host: "cloudflare-workers-external",
        channel: buildType,
      },
    });
    const buildId = build.id || build.data?.id;
    console.log("[glitch:deploy] build", JSON.stringify({
      id: buildId,
      version: build.version || build.data?.version,
      status: build.status || build.data?.status,
      cdn_url: build.cdn_url || build.data?.cdn_url,
    }));

    if (activate && buildId) {
      // Wait briefly for processing; poll list then activate.
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const list = await api("/deployments", undefined, "GET");
        const rows = list.data || list;
        const row = Array.isArray(rows) ? rows.find((b) => b.id === buildId) : null;
        const status = row?.status || build.status;
        console.log(`[glitch:deploy] status poll ${i + 1}: ${status}`);
        if (status === "failed") {
          console.error("[glitch:deploy] processing failed:", row?.error_log || "(no log)");
          process.exit(1);
        }
        if (status === "ready" || status === "processing" || status === "uploading") {
          if (status === "ready") break;
          if (status === "processing" && i >= 2) {
            // Attempt activate once processing has begun (some titles allow ready from processing).
            try {
              const updated = await api(`/deployments/${buildId}/status`, { status: "ready" }, "PUT");
              console.log("[glitch:deploy] activated:", updated.status || updated);
              break;
            } catch (e) {
              if (e.status === 409) {
                console.log("[glitch:deploy] activate 409 — still processing, wait…");
                continue;
              }
              throw e;
            }
          }
        }
      }
    } else {
      console.log("[glitch:deploy] skipped activate (set GLITCH_ACTIVATE=1 to publish).");
      console.log("[glitch:deploy] Next: Glitch Deploy page → set build status to ready.");
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[glitch:deploy]", err.message || err);
  if (err.status === 403) {
    console.error("→ Use the deploy token (gl_deploy_*), not the runtime title token.");
  }
  process.exit(1);
});
