/**
 * dashboard.mjs — generate the Command Center.
 *
 *   npm run dashboard                 # collect + write .diag-captures/dashboard.html (+ health.json)
 *   npm run dashboard -- --json       # health.json only (agents / CI consumers)
 *
 * DESIGN CONTRACT (v3 — the daily operating system): a 5-second cold open must
 * answer, in order: which release phase → today's mission → what "done" looks like
 * → the one next action → what's blocked/forbidden → where work resumes. Everything
 * else is reference, collapsed. The page is organized by decision frequency, never
 * by data source. Captures are evidence, not todos. Playtest state is read from the
 * console's localStorage IN THE BROWSER at view time — no generate-time copy, the
 * console stays the single source of playtest truth. A view-time staleness guard
 * warns when the page itself is old.
 *
 * Humans: this page. Agents: health.json (same model + a `digest` block that is the
 * cold-start summary — see AGENTS.md session rehydration).
 *
 * Exit codes: 0 written · 2 collection failed (never 1 — this is a reporter, not a gate).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { collectProjectHealth, compressIssueStatus, issueState, deriveNextAction } from "./lib/projectHealth.mjs";
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

/** Markdown links → their text, for prose rendered outside a markdown viewer. @param {unknown} s */
function stripMdLinks(s) {
  return String(s ?? "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

/** Pull a fact value out of the handoff briefing by key prefix. @param {any} briefing @param {string} keyPrefix */
function fact(briefing, keyPrefix) {
  const f = (briefing?.facts ?? []).find((x) => x.key.toLowerCase().startsWith(keyPrefix.toLowerCase()));
  return f ? f.value : null;
}

/** @param {any} h @returns {string} */
function renderHtml(h) {
  const now = deriveNextAction(h);
  const mission = h.mission ?? h.declared?.mission;
  const briefing = h.handoff;
  const latest = h.battery?.latestTargeted ?? h.battery?.latest;
  const g = h.git ?? h.observed?.git;
  const digest = h.digest ?? {};
  const readiness = h.readiness ?? {};
  const targetedClass = latest?.classification?.class ?? readiness.batteryClass ?? "unknown";
  const scopeLabel = latest?.classification?.scopeLabel ?? readiness.batteryScope ?? "?/?";

  // --- hero chips -----------------------------------------------------------
  const bundleFact = fact(briefing, "Prod") ?? fact(briefing, "Live client bundle");
  const bundleShort = String(bundleFact ?? "").match(/index-[\w-]+\.js/)?.[0] ?? null;
  const prodUrl = (fact(briefing, "Prod") ?? "").match(/https?:\/\/\S+/)?.[0] ?? null;
  const diagUrl = prodUrl ? `${prodUrl.replace(/\/+$/, "")}/?diag=1` : null;
  const failingCount = (latest?.results ?? []).filter((r) => r.code !== 0 && r.code !== 3).length;
  const inconclCount = (latest?.results ?? []).filter((r) => r.code === 3).length;
  // * Never paint battery green when evidence is partial/stale/mismatched/legacy.
  const batteryChipCls =
    targetedClass === "green" && failingCount === 0 && inconclCount === 0
      ? "good"
      : failingCount > 0 || targetedClass === "red"
        ? "bad"
        : "warn";
  const batteryMark = batteryChipCls === "good" ? "✓" : batteryChipCls === "bad" ? "✕" : "△";
  const batteryChip = latest
    ? `<span class="chip ${batteryChipCls}" title="class=${esc(targetedClass)}">${batteryMark} battery ${esc(scopeLabel)} · ${esc(targetedClass)} <i>${esc(ago(latest.when))}</i></span>`
    : `<span class="chip warn">△ battery never run</span>`;
  const dirty = (g?.dirtyFiles ?? 0) > 0 || (g?.ahead ?? 0) > 0 || (g?.behind ?? 0) > 0 || readiness.dirty;
  const syncChip =
    g == null
      ? ""
      : dirty || readiness.inSync === false
        ? `<span class="chip warn">△ git drift — ${g.dirtyFiles ?? 0} dirty · ${g.ahead ?? "?"} ahead · ${g.behind ?? "?"} behind</span>`
        : `<span class="chip good">✓ in sync with origin/${esc(g.branch)}</span>`;
  const readyChip = readiness.releaseReady
    ? `<span class="chip good">✓ release ready</span>`
    : `<span class="chip warn">△ not release-ready</span>`;
  const phaseChip = h.declared?.phase
    ? `<span class="chip neutral">▶ ${esc(String(h.declared.phase).split("—")[0].trim())}</span>`
    : "";
  const prodChip = bundleShort
    ? `<span class="chip neutral" title="${esc(bundleFact)}">${prodUrl ? `<a href="${esc(prodUrl)}">` : ""}prod ${esc(bundleShort)}${prodUrl ? "</a>" : ""}</span>`
    : "";
  const openBugs = (h.issues?.open ?? []).filter((i) => issueState(i.status) === "open");
  const blockerChip = openBugs.length ? `<span class="chip bad">✕ ${openBugs.length} open blocker${openBugs.length > 1 ? "s" : ""}</span>` : "";

  // --- release brain --------------------------------------------------------
  const phaseStrip = (h.phases ?? [])
    .map((p) => {
      const cls = p.state === "current" ? "ph-now" : p.state === "done" ? "ph-done" : "ph-todo";
      const short = p.name.split("—")[0].trim();
      const mark = p.state === "done" ? "✓ " : p.state === "current" ? "▶ " : "";
      return `<span class="ph ${cls}" title="${esc(p.name)}">${mark}${esc(short)}</span>`;
    })
    .join(`<span class="ph-sep">›</span>`);

  // --- mission + done-when --------------------------------------------------
  const doneWhen = h.doneWhen ?? [];
  const doneCount = doneWhen.filter((d) => d.done).length;
  const doneRowsHtml = doneWhen
    .map((d) => `<li class="${d.done ? "dw-done" : ""}"><span class="dw-box">${d.done ? "✓" : ""}</span>${esc(d.text)}</li>`)
    .join("\n");

  // --- session bar ----------------------------------------------------------
  const last = digest.lastSession;
  const activeRow = (h.issues?.playtestQueue ?? []).find((q) => q.state === "active") ?? null;

  // --- firewall / not today -------------------------------------------------
  const doNots = (briefing?.doNots ?? []).map((d) => `<li>${esc(d)}</li>`).join("\n");
  const queue = h.issues?.playtestQueue ?? [];
  const lockedRows = queue.filter((q) => q.state === "locked");
  const allIssues = h.issues?.all ?? h.issues?.open ?? [];
  const parkedIssues = allIssues.filter((i) => issueState(i.status) === "parked");
  const notToday = [
    ...lockedRows.map((q) => `<li><b>${esc(q.id || "·")}</b> ${esc(q.what)} <i>${esc(compressIssueStatus(q.status, 60))}</i></li>`),
    ...parkedIssues.map((i) => `<li><b>${esc(i.id)}</b> ${esc(i.issue)}</li>`),
  ].join("\n");
  const backlogTotal = (h.backlog ?? []).reduce((n, s) => n + s.rows.length, 0);

  // --- queue ----------------------------------------------------------------
  const doneRows = queue.filter((q) => q.state === "done");
  const waitingRows = queue.filter((q) => q.state === "waiting");
  const doneLine = doneRows.length
    ? `<div class="q-done">✓ Closed evidence this phase: ${doneRows.map((q) => `<b>${esc(q.id)}</b> ${esc(q.what)}`).join(" · ")}</div>`
    : "";
  const activeCard = activeRow
    ? `<div class="q-active"><span class="q-badge">▶ ACTIVE</span><span class="q-id">${esc(activeRow.id)}</span>
       <div class="q-what">${esc(activeRow.what)}</div>
       <div class="q-status">${esc(activeRow.status.replace(/^▶️\s*/u, ""))}</div></div>`
    : `<div class="empty">No active card — wait for Wyatt to name one.</div>`;
  const waitingList = waitingRows.length
    ? `<ol class="q-wait">${waitingRows.map((q) => `<li><b>${esc(q.id)}</b> ${esc(q.what)} <i>${esc(compressIssueStatus(q.status, 70))}</i></li>`).join("\n")}</ol>`
    : "";

  // --- pulse ----------------------------------------------------------------
  const radar = (h.issues?.open ?? [])
    .map((i) => ({ ...i, state: issueState(i.status) }))
    .filter((i) => i.state === "open" || i.state === "warn" || i.state === "partial")
    .sort((a, b) => ["open", "warn", "partial"].indexOf(a.state) - ["open", "warn", "partial"].indexOf(b.state));
  const radarRows = radar
    .map((i) => {
      const dot = i.state === "open" ? "✕" : i.state === "warn" ? "△" : "◐";
      return `<li class="r-${i.state}"><span class="r-dot">${dot}</span><b>${esc(i.id)}</b> ${esc(i.issue)}<div class="r-note">${esc(compressIssueStatus(i.status, 140))}</div></li>`;
    })
    .join("\n");
  const shelved = Math.max(0, allIssues.length - radar.length);

  const batteryRowsCompact = (latest?.results ?? [])
    .map((r) => {
      const stateCls = r.code === 0 ? "good" : r.code === 2 || r.code === 3 ? "warn" : "bad";
      const mark = r.code === 0 ? "✓" : r.code === 2 || r.code === 3 ? "△" : "✕";
      const checks = r.checks ? ` ${r.checks.passed}/${r.checks.passed + r.checks.failed}` : "";
      return `<li><span class="chip ${stateCls}">${mark} ${esc(r.name)}${checks}</span></li>`;
    })
    .join("\n");

  const commitRows = (g?.commits ?? [])
    .slice(0, 6)
    .map((c) => `<li><span class="mono dim">${esc(c.sha)}</span> ${esc(c.subject)}</li>`)
    .join("\n");
  const localFact = fact(briefing, "Local");

  // --- reference ------------------------------------------------------------
  const batteryDetailRows = (latest?.results ?? [])
    .map((r) => {
      const label = r.code === 0 ? "PASS" : r.code === 2 ? "SETUP" : r.code === 3 ? "INCONCL" : "FAIL";
      const state = r.code === 0 ? "pass" : r.code === 2 || r.code === 3 ? "setup" : "fail";
      const checks = r.checks ? `${r.checks.passed}/${r.checks.passed + r.checks.failed}` : "—";
      const failedChecks = (r.checks?.checks ?? []).filter((c) => !c.pass && !c.inconclusive);
      const inconclChecks = (r.checks?.checks ?? []).filter((c) => c.inconclusive);
      const lines = [
        ...failedChecks.map((c) => `✕ ${esc(c.name)}${c.detail ? ` — ${esc(c.detail)}` : ""}`),
        ...inconclChecks.map((c) => `△ ${esc(c.name)}${c.detail ? ` — ${esc(c.detail)}` : ""}`),
      ];
      const detail = lines.length ? `<div class="fails">${lines.join("<br>")}</div>` : "";
      return `<tr><td><span class="pill ${state}">${label}</span></td><td>${esc(r.name)}</td><td>${checks}</td><td>${(r.ms / 1000).toFixed(0)}s</td><td>${esc(r.note)}${detail}</td></tr>`;
    })
    .join("\n");
  const historyChips = (h.battery?.history ?? [])
    .map((e) => {
      const cls = e.class === "green" ? "good" : e.class === "red" ? "bad" : "warn";
      const scope = e.scopeLabel ? ` ${e.scopeLabel}` : ` ${e.green}/${e.total}`;
      return `<span class="chip ${cls}" title="${esc(e.file)} · ${esc(e.class ?? "")}">${esc(e.class ?? "?")}${scope}</span>`;
    })
    .join(" ");

  const newestSha = (h.captures ?? []).find((c) => c.buildSha)?.buildSha ?? null;
  const captureCards = (h.captures ?? [])
    .map((c) => {
      const buildChip =
        c.buildSha == null
          ? `<span class="chip warn">build ?</span>`
          : `<span class="chip ${newestSha && c.buildSha === newestSha ? "good" : "warn"}" title="newest captured build: ${esc(newestSha ?? "?")}">build ${esc(c.buildSha)}</span>`;
      const role = c.isHost == null ? "" : c.isHost ? " · host" : " · non-host";
      const serverId = c.serverId != null ? `<span class="dim">#${esc(c.serverId)}</span> ` : "";
      return `<div class="card">
        ${c.png ? `<a href="${esc(c.png)}"><img src="${esc(c.png)}" alt="capture screenshot" loading="lazy"></a>` : ""}
        <div class="cardbody">
          ${serverId}<b>${esc(c.scenario ?? "?")}</b> <span class="dim">${esc(c.phase ?? "")}${role}${c.qualityTier ? ` · ${esc(c.qualityTier)}` : ""}</span><br>
          ${buildChip}${c.reason ? ` <span class="dim">${esc(c.reason)}</span>` : ""}<br>
          <a href="${esc(c.file)}">${esc(c.file)}</a> · ${esc(ago(c.capturedAt))}${c.errorEvents != null ? ` · ${c.errorEvents} err/assert evt` : ""}
        </div>
      </div>`;
    })
    .join("\n");

  const perfRows = (h.perf?.rows ?? [])
    .slice()
    .sort((a, b) => (b.gpuMsMedian ?? 0) - (a.gpuMsMedian ?? 0))
    .slice(0, 12)
    .map((r) => {
      const n = (v) => (v == null ? "—" : Number(v).toFixed(1));
      return `<tr><td>${esc(r.level)}</td><td>${esc(r.preset)}${r.ablate ? ` <span class="dim">-${esc(r.ablate)}</span>` : ""}</td><td>${n(r.gpuMsMedian)}</td><td>${n(r.frameMsMedian)}</td><td>${r.drawCalls ?? "—"}</td></tr>`;
    })
    .join("\n");

  const backlogRows = (h.backlog ?? [])
    .map((s) => {
      const counts = Object.entries(s.counts)
        .map(([pri, n]) => `${esc(pri)}: ${n}`)
        .join(" · ");
      return `<tr><td><b>${esc(s.title)}</b></td><td>${s.rows.length}</td><td>${counts}</td></tr>`;
    })
    .join("\n");

  const digestList = (items) =>
    (items ?? []).length ? `<ul>${items.map((x) => `<li>${esc(typeof x === "string" ? x : `${x.id}: ${x.issue}`)}</li>`).join("")}</ul>` : `<div class="empty">none</div>`;
  const symbolChips = (digest.symbolsInPlay ?? []).map((s) => `<span class="chip neutral mono">${esc(s)}</span>`).join(" ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cart Clash — Command Center</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🛒</text></svg>">
<style>
  :root { --bg:#0a0a11; --panel:#13131c; --panel2:#191926; --edge:#252538; --edge2:#34344c;
          --text:#eceaf4; --dim:#8d8da6; --neon:#ff2d95; --cyan:#27e0e6; --violet:#7c5cff;
          --good:#3ddc84; --bad:#ff5d5d; --warn:#ffc24b; }
  * { box-sizing:border-box; }
  body { margin:0; padding:0; background:var(--bg); color:var(--text);
         font:14px/1.5 "Segoe UI", system-ui, sans-serif;
         background-image:radial-gradient(1100px 500px at 50% -180px, rgba(255,45,149,.11), transparent 65%),
                          radial-gradient(700px 400px at 88% -40px, rgba(39,224,230,.07), transparent 60%); }
  body::before { content:""; position:fixed; top:0; left:0; right:0; height:2px; z-index:10;
                 background:linear-gradient(90deg, var(--neon), var(--violet), var(--cyan)); opacity:.85; }
  .shell { max-width:1060px; margin:0 auto; padding:26px 20px 70px; }
  a { color:var(--cyan); text-decoration:none; } a:hover { text-decoration:underline; }
  .dim { color:var(--dim); } .mono { font-family:ui-monospace,"Cascadia Code",Consolas,monospace; font-size:12px; }
  .empty { color:var(--dim); font-style:italic; padding:6px 0; }

  #stale { display:none; margin:0 0 16px; padding:10px 16px; border:1px solid rgba(255,194,75,.5);
           border-radius:10px; background:rgba(255,194,75,.08); color:var(--warn); font-weight:600; }

  header { display:flex; flex-wrap:wrap; gap:10px 18px; align-items:flex-end; justify-content:space-between; margin-bottom:14px; }
  h1 { margin:0; font-size:17px; letter-spacing:3px; font-weight:800; }
  h1 .neon { color:var(--neon); text-shadow:0 0 18px rgba(255,45,149,.55); }
  h1 .cc { color:var(--dim); font-weight:600; letter-spacing:4px; font-size:12px; margin-left:10px; }
  .stamp { color:var(--dim); font-size:12px; margin-top:2px; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; }
  .chip { display:inline-block; padding:2px 10px; border-radius:999px; font-size:12px; border:1px solid var(--edge);
          background:var(--panel); color:var(--dim); white-space:nowrap; }
  .chip i { font-style:normal; opacity:.65; }
  .chip.good { color:var(--good); border-color:rgba(61,220,132,.35); }
  .chip.bad { color:var(--bad); border-color:rgba(255,93,93,.4); }
  .chip.warn { color:var(--warn); border-color:rgba(255,194,75,.4); }
  .chip.neutral a { color:inherit; }

  /* release brain */
  .phases { display:flex; flex-wrap:wrap; align-items:center; gap:4px 2px; margin-bottom:14px;
            padding:10px 14px; background:var(--panel); border:1px solid var(--edge); border-radius:999px; }
  .ph { font-size:11px; letter-spacing:1px; text-transform:uppercase; padding:3px 11px; border-radius:999px; white-space:nowrap; }
  .ph-done { color:var(--good); opacity:.75; }
  .ph-todo { color:var(--dim); opacity:.6; }
  .ph-now { color:#fff; background:linear-gradient(90deg, rgba(255,45,149,.3), rgba(124,92,255,.3));
            border:1px solid var(--neon); font-weight:700; box-shadow:0 0 16px rgba(255,45,149,.25);
            animation:phpulse 2.6s ease-in-out infinite; }
  .ph-sep { color:var(--edge2); font-size:12px; padding:0 2px; }
  @keyframes phpulse { 0%,100% { box-shadow:0 0 10px rgba(255,45,149,.18);} 50% { box-shadow:0 0 22px rgba(255,45,149,.4);} }

  /* mission + done-when */
  .mission { display:grid; grid-template-columns:1.5fr 1fr; gap:0; border:1px solid rgba(255,45,149,.4);
             border-radius:16px; overflow:hidden; margin-bottom:14px;
             background:linear-gradient(160deg, rgba(255,45,149,.10), rgba(19,19,28,.95) 55%),
                        repeating-linear-gradient(0deg, rgba(255,255,255,.014) 0 1px, transparent 1px 3px);
             box-shadow:0 0 44px rgba(255,45,149,.10), inset 0 1px 0 rgba(255,255,255,.04); }
  @media (max-width:840px) { .mission { grid-template-columns:1fr; } }
  .mission > div { padding:18px 22px 16px; }
  .k { font-size:11px; letter-spacing:3px; font-weight:700; color:var(--dim); text-transform:uppercase; }
  .mission .k { color:var(--neon); }
  .mission-head { font-size:clamp(26px, 4vw, 42px); font-weight:900; letter-spacing:.4px; line-height:1.08; margin:8px 0 4px; text-transform:uppercase; }
  .mission-detail { color:var(--dim); font-size:14px; }
  .dw { border-left:1px solid rgba(255,45,149,.25); background:rgba(0,0,0,.22); }
  .dw .k { color:var(--cyan); }
  .dw ul { list-style:none; margin:8px 0 0; padding:0; }
  .dw li { margin:7px 0; padding-left:26px; position:relative; font-size:13px; line-height:1.35; }
  .dw-box { position:absolute; left:0; top:1px; width:16px; height:16px; border:1px solid var(--edge2); border-radius:4px;
            color:var(--good); font-size:12px; line-height:15px; text-align:center; background:var(--panel2); }
  .dw-done { color:var(--dim); } .dw-done .dw-box { border-color:rgba(61,220,132,.5); background:rgba(61,220,132,.1); }

  /* now */
  .now { border:1px solid rgba(39,224,230,.35); border-left:5px solid var(--cyan); border-radius:12px;
         background:var(--panel); padding:16px 20px; margin-bottom:10px;
         box-shadow:0 0 28px rgba(39,224,230,.07), inset 0 1px 0 rgba(255,255,255,.03); }
  .now .k { color:var(--cyan); }
  .now-text { font-size:19px; font-weight:650; line-height:1.4; margin:6px 0 4px; }
  .now-expect { color:var(--dim); font-size:13px; } .now-expect b { color:var(--good); font-weight:700; }
  .now-after { margin-top:10px; padding-top:10px; border-top:1px solid var(--edge); font-size:13px; color:var(--dim); }
  .now-after ol { margin:4px 0 0; padding-left:20px; } .now-after li { margin:3px 0; }

  /* session bar */
  .session { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
  @media (max-width:840px) { .session { grid-template-columns:1fr; } }
  .session > div { background:var(--panel); border:1px solid var(--edge); border-radius:12px; padding:10px 16px; font-size:13px;
                   inset:0; box-shadow:inset 0 1px 0 rgba(255,255,255,.03); }
  .session b { color:var(--text); } .session .glyph { color:var(--violet); font-weight:800; margin-right:6px; }

  /* firewall / not today */
  .twocol { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
  @media (max-width:840px) { .twocol { grid-template-columns:1fr; } }
  .panel { background:var(--panel); border:1px solid var(--edge); border-radius:12px; padding:14px 18px;
           box-shadow:inset 0 1px 0 rgba(255,255,255,.03); }
  .panel ul, .panel ol { margin:8px 0 0; padding-left:20px; } .panel li { margin:4px 0; }
  .firewall { border-color:rgba(255,194,75,.35); } .firewall .k { color:var(--warn); }
  .firewall li { color:#e8d8b0; } .firewall li::marker { color:var(--warn); }
  .nottoday .k { color:var(--dim); }
  .nottoday li i { color:var(--dim); font-style:normal; font-size:12px; }
  .nt-note { margin-top:10px; padding-top:8px; border-top:1px solid var(--edge); color:var(--dim); font-size:12px; }

  /* queue */
  section.block { margin-bottom:14px; }
  .q-done { color:var(--dim); font-size:13px; margin:8px 0; }
  .q-done b { color:var(--good); font-weight:600; }
  .q-active { background:linear-gradient(180deg, rgba(124,92,255,.15), var(--panel)); border:1px solid var(--violet);
              border-radius:12px; padding:14px 18px; margin:8px 0; box-shadow:0 0 26px rgba(124,92,255,.15); }
  .q-badge { font-size:10px; letter-spacing:2px; font-weight:800; color:#dcd6ff; background:rgba(124,92,255,.25);
             border:1px solid var(--violet); border-radius:999px; padding:2px 10px; margin-right:10px; vertical-align:2px;
             animation:phpulse 2.6s ease-in-out infinite; }
  .q-id { font-family:ui-monospace,Consolas,monospace; color:var(--violet); font-weight:700; }
  .q-what { font-size:17px; font-weight:650; margin-top:6px; }
  .q-status { color:var(--dim); font-size:13px; margin-top:2px; }
  ol.q-wait { margin:8px 0 0; padding-left:22px; }
  ol.q-wait li { margin:5px 0; color:#c9c7da; } ol.q-wait li::marker { color:var(--dim); }
  ol.q-wait i { color:var(--dim); font-style:normal; font-size:12px; }

  /* playtest control room */
  .pt { border:1px solid var(--edge2); border-radius:14px; background:linear-gradient(180deg, rgba(124,92,255,.06), var(--panel));
        padding:14px 18px; box-shadow:inset 0 1px 0 rgba(255,255,255,.03); }
  .pt .k { color:var(--violet); }
  .flow { display:flex; flex-wrap:wrap; gap:6px 0; align-items:stretch; margin:12px 0 4px; counter-reset:step; }
  .fstep { position:relative; background:var(--panel2); border:1px solid var(--edge); border-radius:10px;
           padding:8px 12px 8px 30px; margin-right:22px; min-width:118px; flex:1 1 118px; max-width:180px; }
  .fstep::before { counter-increment:step; content:counter(step); position:absolute; left:9px; top:9px;
                   width:15px; height:15px; border-radius:50%; background:rgba(124,92,255,.22); color:#dcd6ff;
                   font-size:10px; font-weight:800; line-height:15px; text-align:center; }
  .fstep::after { content:"→"; position:absolute; right:-18px; top:50%; transform:translateY(-50%); color:var(--edge2); font-size:14px; }
  .fstep:last-child::after { content:""; }
  .fstep b { display:block; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; }
  .fstep span { display:block; color:var(--dim); font-size:11.5px; line-height:1.35; margin-top:2px; }
  .pt-bar { height:10px; border-radius:999px; background:var(--panel2); border:1px solid var(--edge); overflow:hidden; margin:12px 0 6px; }
  .pt-bar i { display:block; height:100%; width:0; background:linear-gradient(90deg, var(--neon), var(--violet)); transition:width .3s; }
  .pt-meta { font-size:13px; color:var(--dim); } .pt-meta b { color:var(--text); }

  /* pulse */
  .pulse { display:grid; grid-template-columns:1.2fr 1fr; gap:14px; margin:14px 0 18px; }
  @media (max-width:840px) { .pulse { grid-template-columns:1fr; } }
  .radar ul { list-style:none; margin:8px 0 0; padding:0; }
  .radar li { margin:8px 0; padding-left:22px; position:relative; }
  .r-dot { position:absolute; left:0; top:1px; font-size:12px; }
  .r-open .r-dot { color:var(--bad); } .r-warn .r-dot { color:var(--warn); } .r-partial .r-dot { color:var(--cyan); }
  .r-note { color:var(--dim); font-size:12px; }
  .note { color:var(--dim); font-size:12px; margin:8px 0 0; }
  .side .panel { margin-bottom:14px; }
  .side ul { list-style:none; padding:0; } .side li { margin:5px 0; font-size:13px; }
  .buildlist { list-style:none; padding:0; display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 0; }

  /* reference */
  h2.sec { font-size:12px; text-transform:uppercase; letter-spacing:3px; color:var(--dim); margin:22px 0 8px; font-weight:700; }
  details.ref { background:var(--panel); border:1px solid var(--edge); border-radius:10px; margin:8px 0;
                transition:border-color .15s; }
  details.ref:hover { border-color:var(--edge2); }
  details.ref summary { cursor:pointer; padding:10px 16px; color:var(--dim); font-size:13px; letter-spacing:1px;
                        text-transform:uppercase; font-weight:600; list-style:none; }
  details.ref summary::before { content:"▸ "; color:var(--edge2); }
  details.ref[open] summary::before { content:"▾ "; }
  details.ref summary:hover { color:var(--text); }
  details.ref .inner { padding:4px 16px 16px; }
  table { border-collapse:collapse; width:100%; background:var(--panel2); border-radius:8px; overflow:hidden; }
  th, td { text-align:left; padding:7px 12px; border-bottom:1px solid var(--edge); vertical-align:top; }
  th { color:var(--dim); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:1px; }
  tr:last-child td { border-bottom:none; }
  .pill { display:inline-block; padding:1px 10px; border-radius:99px; font-weight:700; font-size:12px; }
  .pill.pass { background:rgba(61,220,132,.15); color:var(--good); }
  .pill.fail { background:rgba(255,93,93,.15); color:var(--bad); }
  .pill.setup { background:rgba(255,194,75,.15); color:var(--warn); }
  .fails { color:var(--bad); font-size:12px; margin-top:4px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:10px; }
  .card { background:var(--panel2); border:1px solid var(--edge); border-radius:8px; overflow:hidden; }
  .card img { width:100%; display:block; aspect-ratio:16/9; object-fit:cover; }
  .cardbody { padding:8px 10px; font-size:12px; word-break:break-all; }
  .links { display:flex; flex-wrap:wrap; gap:8px; }
  .links a { background:var(--panel2); border:1px solid var(--edge); border-radius:6px; padding:4px 10px; font-size:12px; }
  .digrid { display:grid; grid-template-columns:1fr 1fr; gap:4px 24px; }
  @media (max-width:840px) { .digrid { grid-template-columns:1fr; } }
  .digrid h4 { margin:10px 0 2px; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:var(--dim); }
  .digrid ul { margin:2px 0 0; padding-left:18px; font-size:13px; } .digrid li { margin:2px 0; }
  footer { margin-top:26px; color:var(--dim); font-size:12px; }
</style>
</head>
<body data-generated="${esc(h.generatedAt)}">
<div class="shell">

<div id="stale"></div>

<header>
  <div>
    <h1>CART <span class="neon">CLASH</span><span class="cc">COMMAND CENTER</span></h1>
    <div class="stamp">generated <span id="gen-ago">${esc(ago(h.generatedAt))}</span> · <span class="mono">npm run dashboard</span> to refresh</div>
  </div>
  <div class="chips">${phaseChip}${prodChip}${syncChip}${readyChip}${batteryChip}${blockerChip}<span class="chip neutral" id="pt-chip" hidden></span></div>
</header>

${phaseStrip ? `<nav class="phases" aria-label="release phases">${phaseStrip}</nav>` : ""}

<section class="mission">
  <div>
    <div class="k">Current mission</div>
    <div class="mission-head">${esc(mission?.headline ?? "No mission parsed — check STATUS.md § Current focus")}</div>
    ${mission?.detail ? `<div class="mission-detail">${esc(mission.detail)} — <a href="../docs/planning/handoff-next-window.md">full handoff</a></div>` : ""}
  </div>
  <div class="dw">
    <div class="k">Done when (${doneCount}/${doneWhen.length})</div>
    ${doneRowsHtml ? `<ul>${doneRowsHtml}</ul>` : `<div class="empty">No "Done when" checklist in STATUS.md § Current focus.</div>`}
  </div>
</section>

<section class="now">
  <div class="k">${esc(now.tag)}</div>
  <div class="now-text">${esc(now.text)}</div>
  ${now.expect ? `<div class="now-expect"><b>Pass looks like:</b> ${esc(now.expect)}</div>` : ""}
  ${
    (h.issues?.nextActions ?? []).length > 1
      ? `<div class="now-after">Then, in order:<ol>${h.issues.nextActions
          .slice(1, 4)
          .map((a) => `<li>${esc(stripMdLinks(a))}</li>`)
          .join("")}</ol></div>`
      : ""
  }
</section>

<div class="session">
  <div><span class="glyph">◀</span><b>Last session${last?.when ? ` (${esc(last.when)})` : ""}:</b>
    ${last ? `${last.label ? `<b>${esc(last.label)}</b> — ` : ""}${esc(compressIssueStatus(last.summary, 150))}` : `<span class="dim">no dated entry parsed — see STATUS.md § Last updated</span>`}
  </div>
  <div><span class="glyph">▶</span><b>Resume:</b>
    ${activeRow ? `queue card <b>${esc(activeRow.id)}</b>` : `<span class="dim">no active queue card</span>`}<span id="resume-pt"></span>
    · <a href="../docs/STATUS.md">STATUS.md</a> has the detail
  </div>
</div>

<div class="twocol">
  <section class="panel firewall">
    <div class="k">⛔ Do not — side-quest firewall</div>
    ${doNots ? `<ul>${doNots}</ul>` : `<div class="empty">No standing prohibitions in the handoff.</div>`}
  </section>
  <section class="panel nottoday">
    <div class="k">🅿 Not today — parked on purpose</div>
    ${notToday ? `<ul>${notToday}</ul>` : `<div class="empty">Nothing parked.</div>`}
    <div class="nt-note">New idea mid-session? Write it into <a href="../docs/planning/BACKLOG.md">BACKLOG.md</a> (${backlogTotal} items live there) and get back to the mission. <b>Recording an idea ≠ changing priorities.</b></div>
  </section>
</div>

<section class="block panel">
  <div class="k">The queue — strict, one card at a time</div>
  ${doneLine}${activeCard}${waitingList}
</section>

<section class="block pt" id="pt-panel">
  <div class="k">Playtest control room — run <span id="pt-run">${esc(mission?.headline?.match(/run\s+(\d+)/i)?.[1] ?? "?")}</span></div>
  <div class="flow">
    <div class="fstep"><b>Mission</b><span>${activeRow ? `card <b>${esc(activeRow.id)}</b> above` : "pick the active card"}</span></div>
    <div class="fstep"><b>Launch</b><span>${diagUrl ? `<a href="${esc(diagUrl)}">prod ?diag=1</a> — hard-refresh both machines` : "prod + ?diag=1 on both machines"}</span></div>
    <div class="fstep"><b>Run cards</b><span><a href="../docs/playtest/console.html">console</a> — one live card, notes in-place</span></div>
    <div class="fstep"><b>Capture</b><span>F8 on BOTH machines (auto-uploads)</span></div>
    <div class="fstep"><b>Pull</b><span class="mono">npm run captures:pull</span></div>
    <div class="fstep"><b>Review</b><span><a href="#captures">captures below</a> + export console md into chat</span></div>
    <div class="fstep"><b>Fix</b><span>ONE lever · <span class="mono">npm run qa</span></span></div>
    <div class="fstep"><b>Retest</b><span>ship on "ship it" → hard-refresh → F8 again</span></div>
  </div>
  <div id="pt-body"><div class="empty">Console progress appears here once cards are run in this browser —
    <a href="../docs/playtest/console.html">open the console</a>.</div></div>
</section>

<div class="pulse">
  <section class="panel radar">
    <div class="k">Bugs on the radar</div>
    ${radarRows ? `<ul>${radarRows}</ul>` : `<div class="empty">No open issues parsed.</div>`}
    ${shelved > 0 ? `<div class="note">${shelved} closed/parked issue rows shelved — full table in <a href="../docs/STATUS.md">STATUS.md</a>.</div>` : ""}
  </section>
  <div class="side">
    <section class="panel">
      <div class="k">Build health</div>
      <ul class="buildlist">${batteryRowsCompact || `<li><span class="chip warn">△ battery never run</span></li>`}</ul>
      <div class="note">gates: <span class="mono">npm run qa</span> · rigs: <span class="mono">npm run battery</span>${latest ? ` · last sweep ${esc(ago(latest.when))}` : ""}</div>
    </section>
    <section class="panel">
      <div class="k">What changed</div>
      <ul>${commitRows || `<li class="empty">git log unavailable</li>`}</ul>
      ${localFact ? `<div class="note">△ local: ${esc(localFact)}</div>` : ""}
      ${bundleFact ? `<div class="note">live: ${esc(bundleFact)}</div>` : ""}
    </section>
  </div>
</div>

<h2 class="sec">Reference — open when you need it</h2>

<details class="ref"><summary>AI cold-start digest — agents read <span class="mono">health.json</span> (same data)</summary><div class="inner">
  <div class="digrid">
    <div><h4>Recently completed</h4>${digestList(digest.recentlyCompleted)}</div>
    <div><h4>In progress</h4>${digestList(digest.inProgress)}</div>
    <div><h4>Blockers</h4>${digestList(digest.blockers)}</div>
    <div><h4>Avoid touching</h4>${digestList(digest.avoid)}</div>
    <div><h4>Recent regressions / rollbacks</h4>${digestList(digest.recentRegressions)}</div>
    <div><h4>Symbols in play</h4>${symbolChips || `<div class="empty">none</div>`}</div>
  </div>
  <div class="note">Read order: <a href="../.diag-captures/dashboard.html">dashboard</a> → <a href="health.json">health.json</a> → <a href="../docs/STATUS.md">STATUS.md</a> → <a href="../AGENTS.md">AGENTS.md</a> · gates by number · ship <b>only</b> on Wyatt's "ship it". Declared phase ≠ release readiness.</div>
</div></details>

<details class="ref"><summary>Battery detail &amp; history ${latest ? `(${esc(latest.file)})` : "(never run)"}</summary><div class="inner">
${latest ? `<table><tr><th></th><th>step</th><th>checks</th><th>time</th><th>what it proves</th></tr>${batteryDetailRows}</table>` : `<div class="empty">No battery reports — run \`npm run battery\`.</div>`}
${historyChips ? `<p class="note">history (newest first): ${historyChips}<br>⚠ Red history entries are frequently the documented joiner-bootstrap flake (STATUS § battery reliability) — A/B against a baseline before reading a red as a regression.</p>` : ""}
</div></details>

<details class="ref" id="captures"><summary>Capture bundles (${(h.captures ?? []).length}) — evidence for the active card, not a todo list</summary><div class="inner">
${captureCards ? `<div class="cards">${captureCards}</div>` : `<div class="empty">None on disk.</div>`}
<div class="note">F8 uploads land via <span class="mono">npm run captures:pull</span>; harness failures auto-drop bundles.</div>
</div></details>

<details class="ref"><summary>Perf snapshot ${h.perf ? `(${esc(h.perf.file)}, ${esc(ago(h.perf.when))})` : "(none)"}</summary><div class="inner">
${perfRows ? `<table><tr><th>arena</th><th>tier</th><th>gpu ms</th><th>frame ms</th><th>draws</th></tr>${perfRows}</table>` : `<div class="empty">No perf-profile reports — run \`npm run perf:profile\`.</div>`}
<div class="note">Headless magnitudes (SwiftShader) — mechanisms are real, absolute ms are not. Judge feel on real hardware.</div>
</div></details>

<details class="ref"><summary>Backlog shape (${backlogTotal} items — the parking lot's parking lot)</summary><div class="inner">
${backlogRows ? `<table><tr><th>discipline</th><th>items</th><th>by priority</th></tr>${backlogRows}</table>` : `<div class="empty">BACKLOG.md not parsable.</div>`}
</div></details>

<details class="ref"><summary>Docs &amp; tools</summary><div class="inner links">
  <a href="../docs/STATUS.md">STATUS.md</a>
  <a href="../AGENTS.md">AGENTS.md</a>
  <a href="../docs/planning/handoff-next-window.md">handoff</a>
  <a href="../docs/playtest/console.html">playtest console</a>
  <a href="../docs/planning/BACKLOG.md">BACKLOG</a>
  <a href="../docs/planning/ROADMAP.md">ROADMAP</a>
  <a href="../docs/guides/dev-toolkit.md">dev toolkit</a>
  <a href="../docs/guides/observability.md">observability</a>
  <a href="../docs/guides/visual-qa.md">visual QA</a>
  <a href="../docs/playtest/README.md">playtest plan</a>
  <a href="health.json">health.json</a>
</div></details>

<footer>
  Sources: git · battery reports · capture bundles · perf profiles · docs/STATUS.md (mission · phases · done-when · queue · issues · last-updated) · docs/planning/BACKLOG.md · docs/planning/handoff-next-window.md · playtest console (view-time, this browser).<br>
  Generated ${esc(h.generatedAt)} — read-only; the markdown stays canonical. Agents: <a href="health.json">health.json</a> (digest included).
</footer>

</div>
<script>
// View-time behaviors. All dynamic strings are escaped before any innerHTML write.
(function () {
  function escText(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function agoText(iso) {
    var min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (!isFinite(min)) return "?";
    if (min < 60) return min + "m ago";
    var h = Math.round(min / 60);
    return h < 48 ? h + "h ago" : Math.round(h / 24) + "d ago";
  }

  // 1) Staleness guard — a generated page that sat for days must say so.
  try {
    var gen = document.body.getAttribute("data-generated");
    var ageH = (Date.now() - new Date(gen).getTime()) / 3600000;
    var genAgo = document.getElementById("gen-ago");
    if (genAgo && isFinite(ageH)) genAgo.textContent = agoText(gen);
    if (isFinite(ageH) && ageH > 12) {
      var stale = document.getElementById("stale");
      stale.style.display = "block";
      stale.textContent = "⚠ This page was generated " + agoText(gen) + " — the project may have moved. Run npm run dashboard for current state.";
    }
  } catch (e) { /* stamp unreadable — leave the static ago text */ }

  // 2) Playtest console state — read-only view of localStorage key
  //    cartClashPlaytestConsole_v1 (same browser as console.html; console owns it).
  try {
    var raw = localStorage.getItem("cartClashPlaytestConsole_v1");
    if (!raw) return;
    var data = JSON.parse(raw);
    var st = data.taskState || {};
    var ids = Object.keys(st);
    if (ids.length === 0) return;
    var done = 0, pass = 0, fail = 0, skip = 0, fails = [];
    ids.forEach(function (id) {
      var s = (st[id] && st[id].status) || "pending";
      if (s !== "pending") done++;
      if (s === "pass") pass++;
      if (s === "fail") { fail++; fails.push(id); }
      if (s === "skip") skip++;
    });
    var pct = Math.round((done / ids.length) * 100);
    var run = (data.meta && data.meta.runNum) || "?";
    var runEl = document.getElementById("pt-run");
    if (runEl) runEl.textContent = run;
    var body = document.getElementById("pt-body");
    if (body) {
      body.innerHTML =
        '<div class="pt-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="pt-meta"><b>' + done + "/" + ids.length + " cards</b> (" + pct + "%) · " +
        '<span class="chip good">✓ ' + pass + "</span> " +
        (fail ? '<span class="chip bad">✕ ' + fail + " — " + escText(fails.join(", ")) + "</span> " : "") +
        (skip ? '<span class="chip warn">△ ' + skip + " skipped</span> " : "") +
        "· " + (data.activeId ? "resume at card <b>" + escText(data.activeId) + "</b>" : "all cards resolved") +
        (data.savedAt ? ' · <span class="dim">console saved ' + escText(agoText(data.savedAt)) + "</span>" : "") + "</div>";
    }
    var chip = document.getElementById("pt-chip");
    if (chip) {
      chip.hidden = false;
      chip.textContent = (fail ? "✕ " : "◐ ") + "playtest " + done + "/" + ids.length + (fail ? " · " + fail + " fail" : "");
      chip.className = "chip " + (fail ? "bad" : done === ids.length ? "good" : "neutral");
    }
    var resume = document.getElementById("resume-pt");
    if (resume && data.activeId) resume.innerHTML = " · console at card <b>" + escText(data.activeId) + "</b>";
  } catch (e) { /* no console state in this browser — static fallbacks stay */ }
})();
</script>
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

  const latest = health.battery?.latestTargeted ?? health.battery?.latest;
  const failing = latest?.results?.filter((r) => r.code !== 0 && r.code !== 3).length ?? 0;
  const inconcl = latest?.results?.filter((r) => r.code === 3).length ?? 0;
  const newest = health.captures?.[0];
  const newestNote = newest
    ? ` (newest ${newest.serverId != null ? `#${newest.serverId}` : newest.file} build=${newest.buildSha ?? "?"} ${ago(newest.capturedAt)})`
    : "";
  const scope = latest?.classification?.scopeLabel ?? "?/?";
  const bclass = latest?.classification?.class ?? "unknown";
  log(
    `summary: battery ${latest ? `${scope} ${bclass}${inconcl ? ` +${inconcl} inconclusive` : ""} (${ago(latest.when)})` : "never run"}` +
      ` · ready=${health.readiness?.releaseReady ? "yes" : "no"}` +
      ` · ${health.captures?.length ?? 0} capture(s)${newestNote} · ${health.issues?.open?.length ?? 0} open issue(s)` +
      ` · phase: ${health.declared?.phase ?? health.digest?.phase ?? "?"}`,
  );
}

main().catch((e) => {
  console.error("[dashboard] FATAL:", e instanceof Error ? e.stack : e);
  process.exit(2);
});
