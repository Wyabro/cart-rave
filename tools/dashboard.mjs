/**
 * dashboard.mjs — generate the living project-health dashboard.
 *
 *   npm run dashboard                 # collect + write .diag-captures/dashboard.html (+ health.json)
 *   npm run dashboard -- --json       # health.json only (agents / CI consumers)
 *
 * The dashboard is GENERATED, never hand-maintained: git state, the latest battery
 * report (with per-check tallies), capture bundles awaiting triage, perf profile,
 * STATUS.md open issues / next actions / playtest queue, and BACKLOG.md counts — all
 * collected by tools/lib/projectHealth.mjs from artifacts the project already produces.
 * Screenshots referenced by capture bundles live in the same directory, so thumbnails
 * work as relative <img> paths.
 *
 * It answers ONE question at the top: "what should I work on next?" — derived from
 * failing gates → untriaged captures → open Criticals → STATUS next actions, in that order.
 *
 * Exit codes: 0 written · 2 collection failed (never 1 — this is a reporter, not a gate).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { collectProjectHealth } from "./lib/projectHealth.mjs";
import { parseArgs, makeLogger, CAPTURE_DIR } from "./lib/harness.mjs";

const log = makeLogger("dashboard");

/** @param {unknown} s */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** @param {string | null | undefined} iso */
function ago(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * Derive the "work on next" list — the whole point of the page.
 * @param {any} h
 * @returns {Array<{ kind: string, text: string }>}
 */
function deriveWorkNext(h) {
  /** @type {Array<{ kind: string, text: string }>} */
  const out = [];
  const latest = h.battery?.latest;
  if (latest?.results) {
    for (const r of latest.results) {
      if (r.code !== 0) out.push({ kind: "gate", text: `Fix failing battery step: ${r.name} (${r.note})` });
    }
  } else {
    out.push({ kind: "gate", text: "No battery report found — run `npm run battery` for a current gate signal" });
  }
  if ((h.captures?.length ?? 0) > 0) {
    out.push({ kind: "capture", text: `Triage ${h.captures.length} capture bundle(s) in .diag-captures/` });
  }
  for (const issue of h.issues?.open ?? []) {
    if (issue.status.includes("❌")) out.push({ kind: "issue", text: `${issue.id}: ${issue.issue}` });
  }
  for (const action of (h.issues?.nextActions ?? []).slice(0, 3)) {
    out.push({ kind: "plan", text: action });
  }
  return out.slice(0, 8);
}

/** @param {any} h @returns {string} */
function renderHtml(h) {
  const workNext = deriveWorkNext(h);
  const latest = h.battery?.latest;
  const batteryRows = (latest?.results ?? [])
    .map((r) => {
      const state = r.code === 0 ? "pass" : r.code === 2 ? "setup" : "fail";
      const label = r.code === 0 ? "PASS" : r.code === 2 ? "SETUP" : "FAIL";
      const checks = r.checks ? `${r.checks.passed}/${r.checks.passed + r.checks.failed}` : "—";
      const failedChecks = (r.checks?.checks ?? []).filter((c) => !c.pass);
      const detail = failedChecks.length
        ? `<div class="fails">${failedChecks.map((c) => `✕ ${esc(c.name)}${c.detail ? ` — ${esc(c.detail)}` : ""}`).join("<br>")}</div>`
        : "";
      return `<tr><td><span class="pill ${state}">${label}</span></td><td>${esc(r.name)}</td><td>${checks}</td><td>${(r.ms / 1000).toFixed(0)}s</td><td>${esc(r.note)}${detail}</td></tr>`;
    })
    .join("\n");

  const historyChips = (h.battery?.history ?? [])
    .map((e) => `<span class="chip ${e.green === e.total ? "pass" : "fail"}" title="${esc(e.file)}">${e.green}/${e.total}</span>`)
    .join(" ");

  const captureCards = (h.captures ?? [])
    .map(
      (c) => `<div class="card">
        ${c.png ? `<a href="${esc(c.png)}"><img src="${esc(c.png)}" alt="capture screenshot" loading="lazy"></a>` : ""}
        <div class="cardbody">
          <b>${esc(c.scenario ?? "?")}</b> <span class="dim">${esc(c.phase ?? "")}</span><br>
          <span class="dim">${esc(c.reason ?? "")}</span><br>
          <a href="${esc(c.file)}">${esc(c.file)}</a> · ${esc(ago(c.capturedAt))}${c.errorEvents != null ? ` · ${c.errorEvents} err/assert evt` : ""}
        </div>
      </div>`,
    )
    .join("\n");

  const issueRows = (h.issues?.open ?? [])
    .map((i) => `<tr><td><b>${esc(i.id)}</b></td><td>${esc(i.issue)}</td><td>${esc(i.status)}</td></tr>`)
    .join("\n");

  const backlogRows = (h.backlog ?? [])
    .map((s) => {
      const counts = Object.entries(s.counts)
        .map(([pri, n]) => `${esc(pri)}: ${n}`)
        .join(" · ");
      return `<tr><td><b>${esc(s.title)}</b></td><td>${s.rows.length}</td><td>${counts}</td></tr>`;
    })
    .join("\n");

  const perfRows = (h.perf?.rows ?? [])
    .slice()
    .sort((a, b) => (b.gpuMsMedian ?? 0) - (a.gpuMsMedian ?? 0))
    .slice(0, 12)
    .map(
      (r) =>
        `<tr><td>${esc(r.level)}</td><td>${esc(r.preset)}${r.ablate ? ` <span class="dim">-${esc(r.ablate)}</span>` : ""}</td><td>${r.gpuMsMedian ?? "—"}</td><td>${r.frameMsMedian ?? "—"}</td><td>${r.drawCalls ?? "—"}</td></tr>`,
    )
    .join("\n");

  const queueItems = (h.issues?.playtestQueue ?? []).map((q) => `<li>${esc(q)}</li>`).join("\n");
  const g = h.git;
  const pushState =
    g == null
      ? "git unavailable"
      : `${g.branch} @ ${g.head} · ${g.dirtyFiles} dirty · ${g.ahead ?? "?"} ahead / ${g.behind ?? "?"} behind origin`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cart Clash — Project Health</title>
<style>
  :root { --bg:#0d0d14; --panel:#16161f; --edge:#26263a; --text:#e8e8f0; --dim:#8a8aa0;
          --neon:#ff2d95; --cyan:#27e0e6; --green:#3ddc84; --red:#ff5d5d; --amber:#ffc24b; }
  * { box-sizing:border-box; }
  body { margin:0; padding:24px; background:var(--bg); color:var(--text);
         font:14px/1.5 "Segoe UI", system-ui, sans-serif; }
  h1 { font-size:22px; margin:0 0 2px; letter-spacing:1px; }
  h1 .neon { color:var(--neon); }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:2px; color:var(--cyan);
       margin:28px 0 10px; border-bottom:1px solid var(--edge); padding-bottom:6px; }
  .sub { color:var(--dim); margin-bottom:18px; }
  table { border-collapse:collapse; width:100%; background:var(--panel); border-radius:8px; overflow:hidden; }
  th, td { text-align:left; padding:8px 12px; border-bottom:1px solid var(--edge); vertical-align:top; }
  th { color:var(--dim); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:1px; }
  tr:last-child td { border-bottom:none; }
  .pill { display:inline-block; padding:1px 10px; border-radius:99px; font-weight:700; font-size:12px; }
  .pill.pass { background:rgba(61,220,132,.15); color:var(--green); }
  .pill.fail { background:rgba(255,93,93,.15); color:var(--red); }
  .pill.setup { background:rgba(255,194,75,.15); color:var(--amber); }
  .chip { display:inline-block; padding:1px 8px; border-radius:6px; font-size:12px; margin-right:2px; }
  .chip.pass { background:rgba(61,220,132,.12); color:var(--green); }
  .chip.fail { background:rgba(255,93,93,.12); color:var(--red); }
  .dim { color:var(--dim); }
  .fails { color:var(--red); font-size:12px; margin-top:4px; }
  ol.next { background:var(--panel); border:1px solid var(--edge); border-left:4px solid var(--neon);
            border-radius:8px; padding:14px 14px 14px 36px; margin:0; }
  ol.next li { margin:4px 0; }
  .tag { font-size:10px; text-transform:uppercase; letter-spacing:1px; padding:1px 6px;
         border-radius:4px; margin-right:8px; vertical-align:1px; }
  .tag.gate { background:rgba(255,93,93,.18); color:var(--red); }
  .tag.capture { background:rgba(255,194,75,.18); color:var(--amber); }
  .tag.issue { background:rgba(255,45,149,.18); color:var(--neon); }
  .tag.plan { background:rgba(39,224,230,.15); color:var(--cyan); }
  .cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px; }
  .card { background:var(--panel); border:1px solid var(--edge); border-radius:8px; overflow:hidden; }
  .card img { width:100%; display:block; aspect-ratio:16/9; object-fit:cover; }
  .cardbody { padding:10px 12px; font-size:13px; word-break:break-all; }
  a { color:var(--cyan); text-decoration:none; } a:hover { text-decoration:underline; }
  ul.queue { background:var(--panel); border:1px solid var(--edge); border-radius:8px;
             padding:12px 12px 12px 32px; margin:0; }
  .empty { color:var(--dim); font-style:italic; padding:10px 0; }
  footer { margin-top:32px; color:var(--dim); font-size:12px; }
</style>
</head>
<body>
<h1>CART <span class="neon">CLASH</span> — project health</h1>
<div class="sub">generated ${esc(h.generatedAt)} (${esc(ago(h.generatedAt))}) · ${esc(pushState)}${g?.headSubject ? ` · <span class="dim">${esc(g.headSubject)}</span>` : ""}</div>

<h2>What should I work on next?</h2>
${workNext.length ? `<ol class="next">${workNext.map((w) => `<li><span class="tag ${w.kind}">${w.kind}</span>${esc(w.text)}</li>`).join("\n")}</ol>` : `<div class="empty">Nothing derived — gates green, no captures, no open Criticals.</div>`}

<h2>Gates — latest battery ${latest ? `<span class="dim">(${esc(latest.file)}, ${esc(ago(latest.when))})</span>` : ""}</h2>
${latest ? `<table><tr><th></th><th>step</th><th>checks</th><th>time</th><th>what it proves</th></tr>${batteryRows}</table>` : `<div class="empty">No battery reports in .diag-captures/ — run \`npm run battery\`.</div>`}
${historyChips ? `<p class="dim">history (newest first): ${historyChips}</p>` : ""}

<h2>Capture bundles awaiting triage</h2>
${captureCards ? `<div class="cards">${captureCards}</div>` : `<div class="empty">None — failures auto-drop bundles here (harness), F8 captures manually (dev), error/assert events auto-capture (__ccDiag.captures()).</div>`}

<h2>Open issues <span class="dim">(docs/STATUS.md — canonical)</span></h2>
${issueRows ? `<table><tr><th>id</th><th>issue</th><th>status</th></tr>${issueRows}</table>` : `<div class="empty">Open-issues table not found/parsable in STATUS.md.</div>`}

<h2>Playtest queue <span class="dim">(human eyes needed)</span></h2>
${queueItems ? `<ul class="queue">${queueItems}</ul>` : `<div class="empty">Queue empty or not parsable.</div>`}

<h2>Backlog shape <span class="dim">(docs/planning/BACKLOG.md)</span></h2>
${backlogRows ? `<table><tr><th>discipline</th><th>items</th><th>by priority</th></tr>${backlogRows}</table>` : `<div class="empty">BACKLOG.md not found/parsable.</div>`}

<h2>Perf snapshot ${h.perf ? `<span class="dim">(${esc(h.perf.file)}, ${esc(ago(h.perf.when))})</span>` : ""}</h2>
${perfRows ? `<table><tr><th>arena</th><th>tier</th><th>gpu ms (med)</th><th>frame ms (med)</th><th>draw calls</th></tr>${perfRows}</table>` : `<div class="empty">No perf-profile reports in shots/ — run \`npm run perf:profile\`.</div>`}

<footer>
  Sources: git · .diag-captures/battery-*.json (+ per-check tallies) · capture bundles · shots/perf-profile-*.json · docs/STATUS.md · docs/planning/BACKLOG.md.<br>
  Regenerate: <code>npm run dashboard</code> · Raw model: <a href="health.json">health.json</a> · Analytics aggregates: <code>GET /api/analytics?token=…</code> on the Worker.
</footer>
</body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const health = await collectProjectHealth({ cwd: process.cwd() });
  await mkdir(CAPTURE_DIR, { recursive: true });

  const jsonPath = resolve(CAPTURE_DIR, "health.json");
  await writeFile(jsonPath, JSON.stringify(health, null, 2), "utf8");
  log(`health model → ${jsonPath}`);

  if (args.json !== true) {
    const htmlPath = resolve(CAPTURE_DIR, "dashboard.html");
    await writeFile(htmlPath, renderHtml(health), "utf8");
    log(`dashboard    → ${htmlPath}`);
  }

  const latest = health.battery?.latest;
  const failing = latest?.results?.filter((r) => r.code !== 0).length ?? 0;
  log(
    `summary: battery ${latest ? `${(latest.results?.length ?? 0) - failing}/${latest.results?.length ?? 0} green (${ago(latest.when)})` : "never run"}` +
      ` · ${health.captures?.length ?? 0} capture(s) · ${health.issues?.open?.length ?? 0} open issue(s)`,
  );
}

main().catch((e) => {
  console.error("[dashboard] FATAL:", e instanceof Error ? e.stack : e);
  process.exit(2);
});
