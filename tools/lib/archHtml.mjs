/**
 * archHtml.mjs — render .diag-captures/architecture.html, the human-facing architecture page.
 *
 * Companion to the committed docs/ARCHITECTURE.json: the JSON is the agent contract, this page is
 * the daily-driver map for humans. It fuses the structured manifest (systems/edges/notes,
 * important files, pitfalls, backlog, do-not-break) with the stat-bearing live model (per-system
 * file counts, line totals, 30-day churn) that is deliberately NOT in the committed JSON.
 *
 * Tone: "Nintendo dev tool × cyberpunk telemetry" — full-width flow map, full-sized 3-column system cards,
 * interactive edge tracing, file-path copy-to-clipboard, real-time search-as-you-type, category filters, and file lookup.
 */

import { ROOT_TOKENS, BASE_CSS, CHROME_CSS, esc, crossNav } from "./ccStyle.mjs";

/** CART_COLORS (src/config.js) as CSS hex — per-system accent hues only. */
const CART_ACCENTS = ["#ff2d95", "#00f3ff", "#39ff14", "#ffe600", "#ff6600", "#a855f7"];

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

/** @param {number} n */
function fmt(n) {
  return Number(n || 0).toLocaleString("en-US");
}

/**
 * The hand-laid 3-column flow-map layout.
 */
const COLUMNS = [
  {
    key: "presentation",
    title: "Client · Presentation",
    ids: ["ui-hud-menu", "rendering-and-postfx", "arenas-levels", "carts-and-customization", "vfx", "audio-music-announcer", "input-camera"],
  },
  {
    key: "core",
    title: "Client · Core",
    ids: ["boot-and-orchestration", "game-loop-and-flow", "physics-simulation", "networking-client", "state-stores", "scoring-progression", "ai-bots", "diagnostics-observability", "dev-tools"],
  },
  { key: "server", title: "Server · Shared", ids: ["networking-server", "shared-protocol"] },
];

/** via → edge style class. */
const EDGE_CLASS = {
  import: "e-solid",
  "msg-wire": "e-dash",
  "p2p-datachannel": "e-pulse",
  "zustand-subscription": "e-dot",
  "callbacks-object": "e-double",
  "deps-object": "e-double",
  "dom-event": "e-dash",
  "main-closure": "e-solid",
};

/**
 * Build the inline SVG flow map with full-width orthogonal right-angled polyline routing.
 * @param {any[]} systems manifest.systems
 * @param {Record<string,string>} accentOf id → hex
 * @returns {string}
 */
function renderFlowMap(systems, accentOf) {
  const W = 1100;
  const nodeW = 210;
  const nodeH = 40;
  const gap = 12;
  const topPad = 56;
  const botPad = 20;
  const colCenter = { presentation: 185, core: 550, server: 915 };
  const maxN = Math.max(...COLUMNS.map((c) => c.ids.length));
  const H = topPad + maxN * nodeH + (maxN - 1) * gap + botPad;
  const availH = H - topPad - botPad;

  /** @type {Record<string,{cx:number,cy:number}>} */
  const pos = {};
  const nameOf = Object.fromEntries(systems.map((s) => [s.id, s.name]));
  for (const col of COLUMNS) {
    const n = col.ids.length;
    const total = n * nodeH + (n - 1) * gap;
    const startY = topPad + (availH - total) / 2;
    col.ids.forEach((id, i) => {
      pos[id] = { cx: colCenter[col.key], cy: startY + i * (nodeH + gap) + nodeH / 2 };
    });
  }

  // Edges first (behind nodes).
  const seen = new Set();
  const edges = [];
  for (const s of systems) {
    for (const e of s.edges ?? []) {
      if (e.to === s.id || !pos[s.id] || !pos[e.to]) continue;
      const key = `${s.id}>${e.to}:${e.via}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = pos[s.id];
      const b = pos[e.to];
      
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      let startX = 0, startY = a.cy, endX = 0, endY = b.cy;
      let d = "";

      if (Math.abs(dx) < 10) {
        // Same column: route out to the right side of the column
        startX = a.cx + nodeW / 2;
        endX = b.cx + nodeW / 2 + 4;
        const midX = a.cx + nodeW / 2 + 24;
        const dirY = dy > 0 ? 1 : -1;
        const r = Math.min(6, Math.abs(dy) / 2);
        d = `M ${startX} ${startY} L ${midX - r} ${startY} Q ${midX} ${startY}, ${midX} ${startY + dirY * r} L ${midX} ${endY - dirY * r} Q ${midX} ${endY}, ${midX - r} ${endY} L ${endX} ${endY}`;
      } else {
        // Cross-column orthogonal (right-angled) routing
        const isRight = dx > 0;
        startX = isRight ? a.cx + nodeW / 2 : a.cx - nodeW / 2;
        endX = isRight ? b.cx - nodeW / 2 - 4 : b.cx + nodeW / 2 + 4;
        
        if (Math.abs(dy) < 5) {
          // Direct horizontal straight line
          d = `M ${startX} ${startY} L ${endX} ${endY}`;
        } else {
          // Right-angled 90-degree polyline with smooth 6px corners
          const midX = startX + (endX - startX) * 0.5;
          const dirY = dy > 0 ? 1 : -1;
          const dirX = isRight ? 1 : -1;
          const r = Math.min(6, Math.abs(dy) / 2, Math.abs(endX - startX) / 2);

          d = `M ${startX} ${startY} L ${midX - dirX * r} ${startY} Q ${midX} ${startY}, ${midX} ${startY + dirY * r} L ${midX} ${endY - dirY * r} Q ${midX} ${endY}, ${midX + dirX * r} ${endY} L ${endX} ${endY}`;
        }
      }

      const edgeCls = EDGE_CLASS[e.via] ?? "e-solid";
      edges.push(
        `<path class="edge ${edgeCls}" data-from="${esc(s.id)}" data-to="${esc(e.to)}" data-via="${esc(e.via)}" marker-end="url(#arr-def)" d="${d}"><title>${esc(nameOf[s.id] ?? s.id)} → ${esc(nameOf[e.to] ?? e.to)} (${esc(e.via)})&#10;${esc(e.detail)}</title></path>`,
      );
    }
  }

  const colHeads = COLUMNS.map(
    (c) => `<text class="col-head" x="${colCenter[c.key]}" y="32" text-anchor="middle">${esc(c.title.toUpperCase())}</text>`,
  ).join("");

  const nodes = systems
    .filter((s) => pos[s.id])
    .map((s) => {
      const { cx, cy } = pos[s.id];
      const x = cx - nodeW / 2;
      const y = cy - nodeH / 2;
      const acc = accentOf[s.id];
      const fileCount = s.file_count ?? (s.files ?? []).length;
      return `<g class="node" data-sys="${esc(s.id)}" style="--accent:${acc}" tabindex="0" role="button" aria-label="${esc(s.name)}">
      <rect class="node-box" x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="8"></rect>
      <rect class="node-stripe" x="${x}" y="${y}" width="4" height="${nodeH}" rx="2"></rect>
      <text class="node-label" x="${cx + 3}" y="${cy - 2}" text-anchor="middle">${esc(s.name)}</text>
      <text class="node-sub" x="${cx + 3}" y="${cy + 11}" text-anchor="middle">${fileCount} file${fileCount === 1 ? "" : "s"} · ${(s.edges ?? []).length} edges</text>
    </g>`;
    })
    .join("\n");

  return `<svg id="flowmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="System flow map" preserveAspectRatio="xMidYMid meet">
    <defs>
      <marker id="arr-def" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--edge2)" opacity="0.6"/>
      </marker>
      <marker id="arr-in" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--cyan)"/>
      </marker>
      <marker id="arr-out" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--neon)"/>
      </marker>
    </defs>
    <g class="edges">${edges.join("")}</g>
    ${colHeads}
    ${nodes}
  </svg>`;
}

/**
 * @param {{
 *   manifest: any,
 *   model: { expansion: any, lineCounts: Record<string, number|null>, churn: any },
 *   git: { branch?: string|null, head?: string|null } | null,
 *   generatedAt: string,
 *   commits30d: number,
 *   movedThisWeek: Array<{ id: string, name: string, commits: number }>,
 * }} ctx
 * @returns {string}
 */
export function renderArchHtml(ctx) {
  const { manifest, model, git, generatedAt, commits30d, movedThisWeek, blobBase } = ctx;
  const systems = manifest.systems ?? [];
  // * Deep-link a repo-relative path into its web source view (GitHub blob). When the remote
  // * can't be resolved (blobBase null) every path renders plain — the page still works offline.
  const blobHref = (f) => (blobBase ? `${blobBase}/${f}` : null);
  const fileLink = (f) => {
    const h = blobHref(f);
    return h ? `<a class="flink" href="${esc(h)}" target="_blank" rel="noopener" title="Open ${esc(f)} on GitHub">${esc(f)}</a>` : esc(f);
  };
  const lineCounts = model.lineCounts ?? {};
  const perSystem = model.churn?.perSystem ?? {};
  const perFile = model.churn?.perFile ?? {};
  const unmapped = model.expansion?.unmapped ?? [];

  const accentOf = Object.fromEntries(systems.map((s, i) => [s.id, CART_ACCENTS[i % CART_ACCENTS.length]]));
  const nameOf = Object.fromEntries(systems.map((s) => [s.id, s.name]));
  const fragileWhy = Object.fromEntries((manifest.do_not_break?.fragile_systems ?? []).map((f) => [f.system, f.why]));

  const sysLines = (files) => (files ?? []).reduce((n, f) => n + (lineCounts[f] ?? 0), 0);
  const stat = systems.map((s) => ({
    id: s.id,
    files: s.file_count ?? (s.files ?? []).length,
    lines: sysLines(s.files),
    commits: perSystem[s.id]?.commits ?? 0,
    changed: perSystem[s.id]?.linesChanged ?? 0,
  }));
  const maxFiles = Math.max(1, ...stat.map((x) => x.files));
  const maxLines = Math.max(1, ...stat.map((x) => x.lines));
  const maxCommits = Math.max(1, ...stat.map((x) => x.commits));
  const statOf = Object.fromEntries(stat.map((x) => [x.id, x]));
  const hotIds = new Set(
    [...stat]
      .filter((x) => x.changed > 0)
      .sort((a, b) => b.changed - a.changed)
      .slice(0, 3)
      .map((x) => x.id),
  );

  const totalFiles = (model.expansion?.files ?? []).length || stat.reduce((n, x) => n + x.files, 0);
  const totalLines = stat.reduce((n, x) => n + x.lines, 0);

  // System column domain lookup
  const domainOfSystem = {};
  COLUMNS.forEach((col) => {
    col.ids.forEach((id) => { domainOfSystem[id] = col.key; });
  });

  // ---- header chips --------------------------------------------------------
  const mapChip =
    unmapped.length === 0
      ? `<span class="chip good">✓ MAP COMPLETE</span>`
      : `<span class="chip bad">✕ ${unmapped.length} UNMAPPED</span>`;
  const branchChip = git
    ? `<span class="chip neutral mono">${esc(git.branch ?? "?")} · ${esc(git.head ?? "?")}</span>`
    : "";
  const headChips = `${branchChip}
    <span class="chip neutral">${fmt(totalFiles)} files</span>
    <span class="chip neutral">${fmt(totalLines)} lines</span>
    <span class="chip neutral">${fmt(commits30d)} commits · 30d</span>
    ${mapChip}`;

  // ---- runtime flow strip --------------------------------------------------
  const STAGES = [
    { t: "Boot", s: "module load · Rapier WASM · scene warm", clk: "main() closure" },
    { t: "Menu", s: "DOM menu · cart preview · lobby", clk: "rAF present" },
    { t: "Session connect", s: "partysocket WS · slot/color/ready", clk: "control plane · MSG.*" },
    { t: "Countdown", s: "MSG.gameStart · 3 · 2 · 1 · GO", clk: "host clock domain" },
    { t: "Host physics", s: "Rapier fixed step · collisions", clk: "@60Hz fixed" },
    { t: "P2P snapshots", s: "hostTransform binary · clientInput", clk: "@40Hz P2P" },
    { t: "Round end", s: "150s or Sudden Death · KO reactors", clk: "scoring fan-out" },
  ];
  const flowStrip = STAGES.map(
    (st) =>
      `<div class="rstage"><b>${esc(st.t)}</b><span>${esc(st.s)}</span><em>${esc(st.clk)}</em></div>`,
  ).join("");

  // ---- full-sized system cards ---------------------------------------------
  const bar = (pct, cls) => `<span class="tel-bar"><i class="${cls}" style="width:${Math.max(3, Math.round(pct * 100))}%"></i></span>`;
  const cards = systems
    .map((s) => {
      const st = statOf[s.id];
      const acc = accentOf[s.id];
      const domainKey = domainOfSystem[s.id] ?? "core";
      const isFragile = s.id in fragileWhy;
      const isHot = hotIds.has(s.id);
      const fileRows = (s.files ?? [])
        .map((f) => {
          const ln = lineCounts[f];
          const ch = perFile[f]?.commits ?? 0;
          return `<tr class="file-row" data-filepath="${esc(f)}"><td class="mono fpath">${fileLink(f)} <button type="button" class="copy-btn" data-copy="${esc(f)}" title="Copy file path">📋</button></td><td class="num">${ln == null ? "—" : fmt(ln)}</td><td class="num">${ch ? `${ch}×` : "·"}</td></tr>`;
        })
        .join("");
      const edgeRows = (s.edges ?? [])
        .map(
          (e) =>
            `<li><span class="via ${EDGE_CLASS[e.via] ?? ""}">${esc(e.via)}</span> → <button type="button" class="dep-link" data-jump="${esc(e.to)}">${esc(nameOf[e.to] ?? e.to)}</button><div class="edetail">${esc(e.detail)}</div></li>`,
        )
        .join("");
      const noteRows = (s.notes ?? []).map((n) => `<li>${esc(n)}</li>`).join("");
      const searchBlob = `${s.name} ${s.id} ${s.responsibility} ${(s.entry ?? []).join(" ")} ${(s.files ?? []).join(" ")}`.toLowerCase();

      return `<article class="scard${isFragile ? " fragile" : ""}${isHot ? " hot-sys" : ""}" id="card-${esc(s.id)}" data-sys="${esc(s.id)}" data-domain="${esc(domainKey)}" data-search="${esc(searchBlob)}" style="--accent:${acc}">
      <div class="scard-stripe"></div>
      <header class="scard-head">
        <span class="scard-dot"></span>
        <h3>${esc(s.name)}</h3>
        ${isHot ? `<span class="chip hot" title="top-churn system (30d)">🔥 HOT</span>` : ""}
        ${isFragile ? `<span class="chip caution" title="fragile — silent-failure surface">⚠ FRAGILE</span>` : ""}
        <span class="scard-entry mono" title="entry point">${(s.entry ?? [])[0] ? fileLink(s.entry[0]) : "—"}</span>
      </header>
      <p class="scard-resp">${esc(s.responsibility)}</p>
      <div class="tel">
        <span class="tel-k">files</span>${bar(st.files / maxFiles, "b-files")}<span class="tel-v">${st.files}</span>
        <span class="tel-k">lines</span>${bar(st.lines / maxLines, "b-lines")}<span class="tel-v">${fmt(st.lines)}</span>
        <span class="tel-k">30d</span>${bar(st.commits / maxCommits, "b-churn")}<span class="tel-v">${st.commits} commit${st.commits === 1 ? "" : "s"}</span>
      </div>
      ${isFragile ? `<div class="scard-why">⚠ ${esc(fragileWhy[s.id])}</div>` : ""}
      
      <!-- FULL-SIZED 3-COLUMN ANATOMY ALWAYS VISIBLE -->
      <div class="expanded-grid">
        <div class="eg-col">
          <h4>Member files (${st.files})</h4>
          <div class="eg-scroll"><table class="ftable"><tr><th>file</th><th class="num">lines</th><th class="num">30d</th></tr>${fileRows}</table></div>
        </div>
        <div class="eg-col">
          <h4>Dependencies (${(s.edges ?? []).length})</h4>
          <div class="eg-scroll">${edgeRows ? `<ul class="edges-list">${edgeRows}</ul>` : `<div class="dim">None</div>`}</div>
        </div>
        <div class="eg-col">
          <h4>Notes (${(s.notes ?? []).length})</h4>
          <div class="eg-scroll">${noteRows ? `<ul class="notes-list">${noteRows}</ul>` : `<div class="dim">None</div>`}</div>
        </div>
      </div>
    </article>`;
    })
    .join("\n");

  // ---- risk & debt ---------------------------------------------------------
  const fragileList = (manifest.do_not_break?.fragile_systems ?? [])
    .map(
      (f) =>
        `<li style="--accent:${accentOf[f.system] ?? "var(--warn)"}"><button type="button" class="dep-link" data-jump="${esc(f.system)}"><b>${esc(nameOf[f.system] ?? f.system)}</b></button> — ${esc(f.why)}</li>`,
    )
    .join("");
  const pitfalls = manifest.pitfalls ?? [];
  const pitfallList = pitfalls.map((p) => `<li>${esc(p)}</li>`).join("");
  const techDebt = (manifest.backlog?.sections ?? []).find((s) => /tech debt/i.test(s.title));
  const debtRows = (techDebt?.rows ?? [])
    .map(
      (r) =>
        `<tr><td class="mono">${esc(r.id ?? "·")}</td><td>${esc(r.item)}${r.notes ? ` <span class="dim">— ${esc(r.notes.replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/\*\*/g, ""))}</span>` : ""}</td><td><span class="pri pri-${esc(String(r.pri).toLowerCase())}">${esc(r.pri)}</span></td></tr>`,
    )
    .join("");
  const notDebt = (manifest.backlog?.explicitly_not_tech_debt ?? [])
    .map((n) => `<li><b>${esc(n.topic)}</b> — ${esc(n.why)}</li>`)
    .join("");

  // ---- now panel -----------------------------------------------------------
  const tierA = (manifest.backlog?.ship1_tiers ?? []).find((t) => t.tier === "A");
  const tierARows = (tierA?.rows ?? [])
    .map((r) => `<li><span class="tier-id">${esc(r.col0)}</span> ${esc(r.item)}</li>`)
    .join("");
  const queue = manifest.workstreams?.queue ?? [];
  const activeQueue = queue.filter((q) => q.state === "active" || q.state === "waiting");
  const queueRows = activeQueue
    .map((q) => {
      const cls = q.state === "active" ? "q-active" : "q-wait";
      // * touches_systems (archRender) links the card in flight to the systems it names — the
      // * what-to-do → what-not-to-break hop. Chips jump to the system card (and its fragility).
      const touches = (q.touches_systems ?? [])
        .map((t) => `<button type="button" class="chip touches dep-link" data-jump="${esc(t.id)}" style="--accent:${accentOf[t.id] ?? "var(--dim)"}">${esc(nameOf[t.id] ?? t.id)}</button>`)
        .join("");
      return `<li class="${cls}"><b>${esc(q.id)}</b> ${esc(q.what)} <i>${esc(q.status)}</i>${touches ? `<div class="touch-row"><span class="touch-lbl">touches</span>${touches}</div>` : ""}</li>`;
    })
    .join("");
  const movedChips = (movedThisWeek ?? []).length
    ? movedThisWeek
        .map(
          (m) =>
            `<button type="button" class="chip moved dep-link" data-jump="${esc(m.id)}" style="--accent:${accentOf[m.id] ?? "var(--dim)"}"><span class="moved-dot"></span>${esc(m.name)} <i>${m.commits}×</i></button>`,
        )
        .join("")
    : `<span class="empty">No src/ commits in the last 7 days.</span>`;

  // ---- legend --------------------------------------------------------------
  const legend = `<div class="legend">
    <span class="lg"><svg width="34" height="10"><line class="edge e-solid" x1="2" y1="5" x2="32" y2="5"/></svg> import</span>
    <span class="lg"><svg width="34" height="10"><line class="edge e-dash" x1="2" y1="5" x2="32" y2="5"/></svg> msg-wire / DOM</span>
    <span class="lg"><svg width="34" height="10"><line class="edge e-pulse" x1="2" y1="5" x2="32" y2="5"/></svg> P2P DataChannel</span>
    <span class="lg"><svg width="34" height="10"><line class="edge e-dot" x1="2" y1="5" x2="32" y2="5"/></svg> zustand</span>
    <span class="lg"><svg width="34" height="10"><line class="edge e-double" x1="2" y1="5" x2="32" y2="5"/></svg> callbacks / deps</span>
    <span class="lg badge-cyan">Cyber Cyan = INCOMING (depends on me)</span>
    <span class="lg badge-pink">Neon Pink = OUTGOING (I depend on)</span>
  </div>`;

  const proj = manifest.project ?? {};

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cart Clash — Architecture Intelligence Map</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🗺️</text></svg>">
<style>
${ROOT_TOKENS}
${BASE_CSS}

  /* Global Layout & Sticky Navbar.
     The body element is deliberately NOT re-declared here (CC-COHERE-1). BASE_CSS owns the
     backdrop wash, --bg and --text; the override that used to sit on this line set background
     as a SHORTHAND, which resets background-image, so this was the only Command Center surface
     rendering without the radial wash — and its #e0e0ec was a fourth text value dimmer than
     --text. Add page-specific body rules as individual properties, never the shorthand. */
  .shell { max-width:1440px; margin:0 auto; padding:16px 24px 40px; }

${CHROME_CSS}
  
  .controls-row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; width:100%; margin-top:4px; }
  .search-box { position:relative; flex:1 1 240px; max-width:420px; }
  .search-box input { width:100%; box-sizing:border-box; background:rgba(255,255,255,0.05); border:1px solid var(--edge2); border-radius:8px; padding:7px 12px 7px 32px; color:var(--text); font-size:13px; outline:none; transition:border-color .15s, box-shadow .15s; }
  .search-box input:focus { border-color:var(--cyan); box-shadow:0 0 0 3px rgba(0,243,255,0.15); }
  .search-box::before { content:"🔍"; position:absolute; left:9px; top:50%; transform:translateY(-50%); font-size:12px; opacity:0.6; }

  .filter-pills { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
  .fpill { background:rgba(255,255,255,0.04); border:1px solid var(--edge); border-radius:999px; padding:4px 12px; font-size:11px; font-weight:600; color:var(--dim); cursor:pointer; transition:all .15s; user-select:none; }
  .fpill:hover { border-color:var(--edge2); color:var(--text); }
  .fpill.active { background:var(--cyan); border-color:var(--cyan); color:#000; font-weight:700; box-shadow:0 0 10px rgba(0,243,255,0.3); }

  /* Header Section */
  header.arch { display:flex; flex-wrap:wrap; gap:12px 18px; align-items:flex-end; justify-content:space-between; margin-bottom:12px; }
  header.arch .chips { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; max-width:640px; }
  .oneliner { color:#a3a3c2; font-size:13px; margin:0 0 22px; max-width:820px; line-height:1.5; }

  .kick { font-size:11px; letter-spacing:3px; font-weight:800; text-transform:uppercase; color:var(--violet); margin:32px 0 12px; display:flex; align-items:center; gap:8px; }
  .kick::after { content:""; flex:1; height:1px; background:linear-gradient(90deg, var(--edge), transparent); }

  /* Runtime flow strip */
  .rstrip { display:flex; flex-wrap:wrap; gap:8px; align-items:stretch; }
  .rstage { position:relative; flex:1 1 120px; min-width:120px; background:linear-gradient(180deg, rgba(124,92,255,.09), var(--panel)); border:1px solid var(--edge); border-radius:12px; padding:10px 12px; box-shadow:0 2px 8px rgba(0,0,0,0.2); }
  .rstage b { display:block; font-size:12px; letter-spacing:.6px; color:var(--text); }
  .rstage span { display:block; color:var(--dim); font-size:11px; line-height:1.35; margin:3px 0 6px; }
  .rstage em { font-style:normal; font-size:10px; letter-spacing:.5px; text-transform:uppercase; color:var(--cyan); font-weight:700; }

  /* Full-Width Flow Map Container (Spans 100% of Shell) */
  .map-container { position:relative; border:1px solid var(--edge); border-radius:16px; background:var(--panel); padding:14px; box-shadow:0 4px 20px rgba(0,0,0,0.3); width:100%; box-sizing:border-box; }
  .map-toolbar { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:10px; padding:0 8px 8px; border-bottom:1px solid var(--edge); margin-bottom:8px; }
  .map-toolbar-title { font-size:11px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; color:var(--dim); }
  .edge-toggles { display:flex; flex-wrap:wrap; gap:6px; }
  .etoggle { font-size:10px; padding:2px 8px; border-radius:4px; border:1px solid var(--edge); background:rgba(255,255,255,0.03); color:var(--dim); cursor:pointer; user-select:none; }
  .etoggle.active { border-color:var(--cyan); color:var(--cyan); font-weight:700; background:rgba(0,243,255,0.1); }

  .mapwrap { overflow-x:auto; }
  #flowmap { width:100%; height:auto; display:block; }
  .col-head { fill:var(--dim); font:800 11px/1 system-ui,sans-serif; letter-spacing:2.5px; }
  .node .node-box { fill:rgba(20,20,32,0.92); stroke:var(--edge2); stroke-width:1.2; transition:all .15s; }
  .node .node-stripe { fill:var(--accent); opacity:.9; }
  .node .node-label { fill:var(--text); font:700 11px/1 system-ui,sans-serif; pointer-events:none; }
  .node .node-sub { fill:var(--dim); font:500 9px/1 system-ui,sans-serif; pointer-events:none; }
  .node { cursor:pointer; }
  .node:hover .node-box, .node:focus .node-box { stroke:var(--accent); fill:rgba(30,30,50,0.95); filter:drop-shadow(0 0 10px var(--accent)); outline:none; }
  
  .node.active .node-box { stroke:#ffffff; stroke-width:2.5; fill:#242436; filter:drop-shadow(0 0 14px var(--accent)); }
  .node.conn-in .node-box { stroke:var(--cyan); fill:rgba(0,243,255,0.12); filter:drop-shadow(0 0 8px var(--cyan)); }
  .node.conn-out .node-box { stroke:var(--neon); fill:rgba(255,45,149,0.12); filter:drop-shadow(0 0 8px var(--neon)); }
  .node.faded { opacity:.18; }

  .edge { fill:none; stroke:var(--edge2); stroke-width:1.4; opacity:.28; transition:opacity .15s, stroke .15s, stroke-width .15s; }
  .edge.e-dash { stroke-dasharray:6 4; }
  .edge.e-dot { stroke-dasharray:2 4; stroke-linecap:round; }
  .edge.e-pulse { stroke-dasharray:8 4; animation:dashFlow 1.2s linear infinite; stroke:var(--neon); }
  .edge.e-double { stroke-width:2.8; stroke:var(--edge2); }
  
  .edge.lit-in { opacity:1; stroke:var(--cyan) !important; stroke-width:2.5 !important; filter:drop-shadow(0 0 6px var(--cyan)); }
  .edge.lit-out { opacity:1; stroke:var(--neon) !important; stroke-width:2.5 !important; filter:drop-shadow(0 0 6px var(--neon)); }
  .edge.dimmed { opacity:.04; }
  @keyframes dashFlow { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }

  /* Map Inspector Floating Panel */
  .map-inspector { position:absolute; top:52px; right:16px; width:290px; background:rgba(15,15,24,0.96); backdrop-filter:blur(12px); border:1px solid var(--edge2); border-radius:14px; padding:14px 16px; box-shadow:0 8px 30px rgba(0,0,0,0.5); z-index:10; display:none; }
  .map-inspector-head { display:flex; justify-content:space-between; align-items:center; font-size:13.5px; font-weight:800; border-bottom:1px solid var(--edge); padding-bottom:6px; margin-bottom:8px; }
  .map-inspector-head .title { color:var(--text); }
  .map-inspector-body { font-size:11.5px; color:#c9c7da; line-height:1.4; }
  .map-inspector-section { margin:8px 0; }
  .map-inspector-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1px; margin-bottom:3px; }
  .map-inspector-label.in { color:var(--cyan); }
  .map-inspector-label.out { color:var(--neon); }
  .map-inspector-list { list-style:none; padding:0; margin:0; font-size:11px; max-height:120px; overflow-y:auto; }
  .map-inspector-list li { margin:3px 0; display:flex; align-items:center; gap:5px; }
  .map-inspector-btn { margin-top:10px; width:100%; background:rgba(0,243,255,0.12); border:1px solid rgba(0,243,255,0.35); border-radius:8px; color:var(--cyan); font-size:11.5px; font-weight:700; padding:6px; cursor:pointer; text-align:center; transition:all .15s; }
  .map-inspector-btn:hover { background:var(--cyan); color:#000; box-shadow:0 0 10px rgba(0,243,255,0.3); }

  .legend { display:flex; flex-wrap:wrap; gap:8px 20px; margin:12px 4px 0; font-size:12px; color:var(--dim); align-items:center; }
  .legend .lg { display:inline-flex; align-items:center; gap:6px; }
  .legend svg .edge { opacity:1; stroke:var(--dim); }
  .badge-cyan { color:var(--cyan); font-weight:700; }
  .badge-pink { color:var(--neon); font-weight:700; }

  /* File Explorer Bar */
  .explorer-panel { background:var(--panel); border:1px solid var(--edge); border-radius:14px; padding:16px; margin-bottom:24px; }
  .explorer-title { font-size:13px; font-weight:700; color:var(--cyan); letter-spacing:1px; margin-bottom:8px; display:flex; align-items:center; gap:6px; }
  .explorer-input { width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); border:1px solid var(--edge2); border-radius:8px; padding:8px 14px; color:var(--text); font-family:ui-monospace,Consolas,monospace; font-size:12.5px; }
  .explorer-results { margin-top:10px; max-height:160px; overflow-y:auto; font-size:12px; }
  .explorer-item { display:flex; justify-content:space-between; padding:4px 8px; border-radius:4px; cursor:pointer; }
  .explorer-item:hover { background:rgba(0,243,255,0.1); color:var(--cyan); }

  /* FULL-SIZED SYSTEM CARDS LAYOUT */
  .cardgrid { display:flex; flex-direction:column; gap:20px; }
  .scard { position:relative; background:var(--panel); border:1px solid var(--edge); border-radius:14px; padding:18px 20px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.25); transition:border-color .2s, box-shadow .2s; scroll-margin-top:70px; }
  .scard:hover { border-color:var(--edge2); box-shadow:0 6px 22px rgba(0,0,0,0.35); }
  .scard.highlighted { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent), 0 0 26px -4px var(--accent); }
  
  .scard-stripe { position:absolute; left:0; top:0; bottom:0; width:5px; background:var(--accent); opacity:.85; }
  .scard.fragile { border-color:rgba(255,194,75,.45); }
  .scard.fragile .scard-stripe { background:repeating-linear-gradient(135deg, var(--warn) 0 6px, rgba(255,194,75,.35) 6px 12px); opacity:1; }
  .scard-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .scard-dot { width:10px; height:10px; border-radius:50%; background:var(--accent); box-shadow:0 0 10px var(--accent); flex:none; }
  .scard-head h3 { margin:0; font-size:17px; font-weight:750; letter-spacing:.3px; }
  .scard-entry { color:var(--dim); margin-left:auto; font-size:11.5px; }
  .chip.hot { color:#ffb27a; border-color:rgba(255,102,0,.5); background:rgba(255,102,0,.12); font-weight:700; }
  .chip.caution { color:var(--warn); border-color:rgba(255,194,75,.5); background:rgba(255,194,75,.1); font-weight:700; }
  .scard-resp { color:#c9c7da; font-size:13.5px; line-height:1.45; margin:10px 0 14px; }

  /* Telemetry Progress Bars */
  .tel { display:grid; grid-template-columns:auto 1fr auto; gap:6px 10px; align-items:center; background:rgba(0,0,0,0.25); padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.03); max-width:640px; }
  .tel-k { font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:var(--dim); font-weight:700; }
  .tel-v { font-size:11.5px; color:var(--text); white-space:nowrap; font-weight:600; }
  .tel-bar { display:block; height:7px; border-radius:999px; background:rgba(255,255,255,0.06); border:1px solid var(--edge); overflow:hidden; }
  .tel-bar i { display:block; height:100%; border-radius:999px; }
  .tel-bar .b-files { background:linear-gradient(90deg, var(--cyan), #1aa9ae); }
  .tel-bar .b-lines { background:linear-gradient(90deg, var(--violet), #5a3fd6); }
  .tel-bar .b-churn { background:linear-gradient(90deg, var(--neon), #d41f78); }

  .scard-why { margin:12px 0 4px; padding:9px 12px; border-radius:8px; background:rgba(255,194,75,.09); border:1px solid rgba(255,194,75,.35); color:#ffe6b3; font-size:12px; line-height:1.4; }

  /* 3-COLUMN FULL-SIZED EXPANDED ANATOMY */
  .expanded-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px; margin-top:14px; background:rgba(0,0,0,0.3); padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.05); }
  .eg-col { min-width:0; }
  .eg-col h4 { margin:0 0 8px; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:var(--dim); font-weight:800; border-bottom:1px solid var(--edge); padding-bottom:4px; }
  .eg-scroll { max-height:260px; overflow-y:auto; padding-right:6px; }

  .ftable { font-size:11.5px; width:100%; border-collapse:collapse; } 
  .ftable td, .ftable th { padding:5px 8px; border-bottom:1px solid rgba(255,255,255,0.03); }
  .ftable .fpath { word-break:break-all; display:flex; align-items:center; justify-content:space-between; gap:6px; } 
  .ftable .num { text-align:right; white-space:nowrap; color:var(--dim); }
  .copy-btn { background:none; border:none; color:var(--dim); cursor:pointer; font-size:11px; opacity:0.6; padding:0 2px; transition:opacity .15s; }
  .copy-btn:hover { opacity:1; color:var(--cyan); }
  
  .edges-list, .notes-list { list-style:none; margin:0; padding:0; }
  .edges-list li { margin:8px 0; font-size:12px; }
  .edges-list .edetail { color:var(--dim); font-size:11px; line-height:1.4; margin-top:2px; }
  .notes-list li { margin:6px 0; font-size:12px; color:#c9c7da; line-height:1.45; padding-left:14px; position:relative; }
  .notes-list li::before { content:"›"; position:absolute; left:0; color:var(--cyan); font-weight:bold; }
  
  .dep-link { background:none; border:none; padding:0; color:var(--cyan); font-weight:600; cursor:pointer; text-decoration:underline; text-decoration-color:rgba(0,243,255,0.3); text-underline-offset:2px; font-size:inherit; }
  .dep-link:hover { color:var(--neon); text-decoration-color:var(--neon); }

  .via { display:inline-block; font-family:ui-monospace,Consolas,monospace; font-size:10px; padding:1px 7px; border-radius:999px; border:1px solid var(--edge2); color:var(--dim); }
  .via.e-double { border-color:var(--neon); color:#ff8fc4; }
  .via.e-dash { border-color:var(--cyan); color:var(--cyan); }
  .via.e-pulse { border-color:var(--neon); color:var(--neon); font-weight:700; }
  .via.e-dot { border-color:var(--violet); color:#b6a4ff; }

  /* Risk & Debt */
  .riskcols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width:840px) { .riskcols { grid-template-columns:1fr; } }
  .risk-frag { list-style:none; margin:8px 0 0; padding:0; }
  .risk-frag li { position:relative; margin:10px 0; padding-left:16px; font-size:12.5px; color:#c9c7da; line-height:1.45; }
  .risk-frag li::before { content:""; position:absolute; left:0; top:6px; width:7px; height:7px; border-radius:2px; background:var(--accent); }
  .pit-list { margin:8px 0 0; padding-left:18px; font-size:12.5px; color:#c9c7da; }
  .pit-list li { margin:6px 0; line-height:1.4; }
  .debt-table { font-size:12px; width:100%; border-collapse:collapse; } 
  .debt-table td { padding:6px 10px; border-bottom:1px solid rgba(255,255,255,0.03); }
  .pri { display:inline-block; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; }
  .pri-medium { background:rgba(255,194,75,.15); color:var(--warn); }
  .pri-low { background:rgba(141,141,166,.15); color:var(--dim); }
  .pri-high { background:rgba(255,93,93,.15); color:var(--bad); }

  /* Now Panel */
  .nowcols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width:840px) { .nowcols { grid-template-columns:1fr; } }
  .now-arch { border-left:4px solid var(--cyan); }
  .prio-list { list-style:none; margin:8px 0 0; padding:0; }
  .prio-list li { margin:8px 0; font-size:12.5px; line-height:1.4; }
  .tier-id { display:inline-block; font-family:ui-monospace,Consolas,monospace; font-size:10px; font-weight:700; color:var(--neon); background:rgba(255,45,149,.15); border:1px solid rgba(255,45,149,.35); border-radius:5px; padding:1px 6px; margin-right:6px; }
  .q-active { color:var(--text); } .q-active b { color:var(--violet); }
  .q-wait { color:var(--dim); } .prio-list i { font-style:normal; color:var(--dim); font-size:11px; }
  .moved-wrap { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  button.chip.moved { color:#c9c7da; display:inline-flex; align-items:center; gap:6px; cursor:pointer; }
  button.chip.moved:hover { text-decoration:none; border-color:var(--accent); background:rgba(255,255,255,0.06); }
  .moved-dot { width:8px; height:8px; border-radius:50%; background:var(--accent); }
  button.chip.moved i { color:var(--dim); }
  .flink { color:var(--cyan); text-decoration:none; } .flink:hover { text-decoration:underline; }
  .touch-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:6px; }
  .touch-lbl { font-size:10px; text-transform:uppercase; letter-spacing:1px; color:var(--dim); }
  button.chip.touches { cursor:pointer; font-size:11px; padding:2px 9px; border-color:var(--edge2);
                        border-left:3px solid var(--accent); color:#c9c7da; }
  button.chip.touches:hover { text-decoration:none; border-color:var(--accent); background:rgba(255,255,255,0.06); }

  footer { margin-top:40px; padding-top:20px; border-top:1px solid var(--edge); color:var(--dim); font-size:12px; display:flex; flex-wrap:wrap; justify-content:space-between; gap:12px; }
  footer .links { display:flex; gap:16px; }
  footer .links a { color:var(--cyan); text-decoration:none; }
  footer .links a:hover { text-decoration:underline; }
</style>
</head>
<body data-generated="${esc(generatedAt)}">

<!-- Sticky Navigation & Search Toolbar -->
<div class="sticky-bar">
  <div class="sticky-inner">
    <a href="#" class="nav-brand">CART <span class="neon">CLASH</span> MAP</a>
    ${crossNav("architecture")}
    <nav class="nav-links">
      <a href="#section-flow">Flow Map</a>
      <a href="#section-explorer">File Explorer</a>
      <a href="#section-systems">Systems Grid</a>
      <a href="#section-risk">Risk & Debt</a>
      <a href="#section-priorities">Priorities</a>
    </nav>
    <div class="controls-row">
      <div class="search-box">
        <input type="text" id="arch-search" placeholder="Search systems, files, edges, or keywords..." autocomplete="off">
      </div>
      <div class="filter-pills" id="filter-pills">
        <span class="fpill active" data-filter="all">All (18)</span>
        <span class="fpill" data-filter="presentation">Presentation</span>
        <span class="fpill" data-filter="core">Core</span>
        <span class="fpill" data-filter="server">Server</span>
        <span class="fpill" data-filter="fragile">⚠ Fragile</span>
        <span class="fpill" data-filter="hot">🔥 Hot</span>
      </div>
    </div>
  </div>
</div>

<div class="shell">

<div id="stale"></div>

<header class="arch">
  <div>
    <h1>CART <span class="neon">CLASH</span><span class="cc">ARCHITECTURE MAP</span></h1>
    <div class="stamp">generated <span id="gen-ago">${esc(ago(generatedAt))}</span> · <span class="mono">npm run arch</span> to refresh · agents read <a href="../docs/ARCHITECTURE.json">docs/ARCHITECTURE.json</a></div>
  </div>
  <div class="chips">${headChips}</div>
</header>
<p class="oneliner">${esc(proj.one_liner ?? "")}</p>

<div class="kick">Runtime flow · clock domains</div>
<div class="rstrip">${flowStrip}</div>

<div class="kick" id="section-flow">System flow map · click a node to inspect relationships in place</div>
<div class="map-container">
  <div class="map-toolbar">
    <div class="map-toolbar-title">Edge Filters</div>
    <div class="edge-toggles" id="edge-toggles">
      <span class="etoggle active" data-via="all">All Types</span>
      <span class="etoggle" data-via="e-solid">Imports / Closure</span>
      <span class="etoggle" data-via="e-dash">Msg Wire / DOM</span>
      <span class="etoggle" data-via="e-pulse">P2P DataChannel</span>
      <span class="etoggle" data-via="e-dot">Zustand</span>
      <span class="etoggle" data-via="e-double">Callbacks / Deps</span>
    </div>
  </div>
  <div class="mapwrap">${renderFlowMap(systems, accentOf)}</div>
  
  <!-- Map Inspector Floating Card -->
  <div class="map-inspector" id="map-inspector">
    <div class="map-inspector-head">
      <span class="title" id="insp-name">System Name</span>
      <button type="button" style="background:none;border:none;color:var(--dim);cursor:pointer;" id="insp-close">✕</button>
    </div>
    <div class="map-inspector-body">
      <div id="insp-resp" style="margin-bottom:8px;"></div>
      <div class="map-inspector-section">
        <div class="map-inspector-label in">Incoming Dependencies (<span id="insp-in-cnt">0</span>)</div>
        <ul class="map-inspector-list" id="insp-in-list"></ul>
      </div>
      <div class="map-inspector-section">
        <div class="map-inspector-label out">Outgoing Dependencies (<span id="insp-out-cnt">0</span>)</div>
        <ul class="map-inspector-list" id="insp-out-list"></ul>
      </div>
      <button type="button" class="map-inspector-btn" id="insp-jump-btn">Scroll to Full Details ↓</button>
    </div>
  </div>
</div>
${legend}

<div class="kick" id="section-explorer">File Explorer · Instant Lookup</div>
<div class="explorer-panel">
  <div class="explorer-title">🔍 Quick File-to-System Lookup</div>
  <input type="text" id="file-search-input" class="explorer-input" placeholder="Type any source filename (e.g. p2p.js, main.js, rapier.js)...">
  <div id="file-search-results" class="explorer-results"></div>
</div>

<div class="kick" id="section-systems">Systems · ${systems.length} mapped</div>
<div class="cardgrid" id="cardgrid">${cards}</div>

<div class="kick" id="section-risk">Risk &amp; debt</div>
<div class="riskcols">
  <section class="panel">
    <div class="k" style="color:var(--warn)">⚠ Fragile systems &amp; pitfalls</div>
    <ul class="risk-frag">${fragileList || `<li class="dim">none flagged</li>`}</ul>
    <details class="ref" style="margin-top:12px"><summary>Pitfalls (${pitfalls.length}) — looks-right-but-isn't</summary><div class="inner"><ul class="pit-list">${pitfallList}</ul></div></details>
  </section>
  <section class="panel">
    <div class="k">🧾 Tech debt (${(techDebt?.rows ?? []).length})</div>
    <table class="debt-table"><tr><th>id</th><th>item</th><th>pri</th></tr>${debtRows || `<tr><td colspan="3" class="dim">none parsed</td></tr>`}</table>
    <details class="ref" style="margin-top:12px"><summary>Explicitly NOT tech debt (${(manifest.backlog?.explicitly_not_tech_debt ?? []).length}) — the guardrail</summary><div class="inner"><ul class="pit-list">${notDebt}</ul></div></details>
  </section>
</div>

<div class="kick" id="section-priorities">Now · priorities &amp; what moved</div>
<div class="nowcols">
  <section class="panel now-arch">
    <div class="k" style="color:var(--cyan)">▶ Pre-ship priorities (SHIP-1 tier A)</div>
    <ul class="prio-list">${tierARows || `<li class="dim">no tier A rows parsed</li>`}</ul>
    ${queueRows ? `<div class="k" style="color:var(--violet); margin-top:14px">Active queue</div><ul class="prio-list">${queueRows}</ul>` : ""}
  </section>
  <section class="panel">
    <div class="k">📈 What moved this week</div>
    <div class="moved-wrap">${movedChips}</div>
    <div class="note dim" style="margin-top:10px; font-size:11.5px">Systems touched by src/ · party/ · shared/ commits in the last 7 days.</div>
  </section>
</div>

<footer>
  <div>Sources: <span class="mono">tools/lib/archMap.mjs</span> (curated taxonomy) · live tree (file counts · line totals · git churn) · docs/STATUS.md.</div>
  <div class="links">
    <a href="../docs/BRIEFING.md">BRIEFING.md</a>
    <a href="../docs/ARCHITECTURE.json">ARCHITECTURE.json</a>
    <a href="../docs/reference/control-flow.md">control-flow.md</a>
  </div>
</footer>

</div>

<script>
// View-time behaviors: Interactive filtering, search-as-you-type, non-scrolling flow map inspection, copy-to-clipboard
(function () {
  function agoText(iso) {
    var min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (!isFinite(min)) return "?";
    if (min < 60) return min + "m ago";
    var h = Math.round(min / 60);
    return h < 48 ? h + "h ago" : Math.round(h / 24) + "d ago";
  }

  // 1) Staleness guard
  try {
    var gen = document.body.getAttribute("data-generated");
    var ageH = (Date.now() - new Date(gen).getTime()) / 3600000;
    var genAgo = document.getElementById("gen-ago");
    if (genAgo && isFinite(ageH)) genAgo.textContent = agoText(gen);
    if (isFinite(ageH) && ageH > 24) {
      var stale = document.getElementById("stale");
      stale.style.display = "block";
      stale.textContent = "⚠ This map was generated " + agoText(gen) + " — run npm run arch to refresh.";
    }
  } catch (e) {}

  // 2) Flow map interactive tracing without viewport auto-scroll
  var svg = document.getElementById("flowmap");
  var nodes = svg ? Array.prototype.slice.call(svg.querySelectorAll(".node")) : [];
  var edges = svg ? Array.prototype.slice.call(svg.querySelectorAll(".edge")) : [];
  var activeId = null;

  var inspector = document.getElementById("map-inspector");
  var inspName = document.getElementById("insp-name");
  var inspResp = document.getElementById("insp-resp");
  var inspInCnt = document.getElementById("insp-in-cnt");
  var inspOutCnt = document.getElementById("insp-out-cnt");
  var inspInList = document.getElementById("insp-in-list");
  var inspOutList = document.getElementById("insp-out-list");
  var inspJumpBtn = document.getElementById("insp-jump-btn");
  var inspClose = document.getElementById("insp-close");

  function nameOfSys(id) {
    var card = document.getElementById("card-" + id);
    return card ? card.querySelector("h3").textContent : id;
  }

  function clearMapSelection() {
    nodes.forEach(function (n) { n.classList.remove("active", "conn-in", "conn-out", "faded"); });
    edges.forEach(function (e) {
      e.classList.remove("lit-in", "lit-out", "dimmed");
      e.setAttribute("marker-end", "url(#arr-def)");
    });
    activeId = null;
    if (inspector) inspector.style.display = "none";
  }

  function selectSystemOnMap(id) {
    if (activeId === id) { clearMapSelection(); return; }
    activeId = id;

    var incoming = [];
    var outgoing = [];

    edges.forEach(function (e) {
      var f = e.getAttribute("data-from");
      var t = e.getAttribute("data-to");
      var via = e.getAttribute("data-via") || "";

      if (t === id) {
        e.classList.add("lit-in");
        e.classList.remove("lit-out", "dimmed");
        e.setAttribute("marker-end", "url(#arr-in)");
        incoming.push({ id: f, via: via });
      } else if (f === id) {
        e.classList.add("lit-out");
        e.classList.remove("lit-in", "dimmed");
        e.setAttribute("marker-end", "url(#arr-out)");
        outgoing.push({ id: t, via: via });
      } else {
        e.classList.add("dimmed");
        e.classList.remove("lit-in", "lit-out");
        e.setAttribute("marker-end", "url(#arr-def)");
      }
    });

    var inSet = {}; incoming.forEach(function (x) { inSet[x.id] = true; });
    var outSet = {}; outgoing.forEach(function (x) { outSet[x.id] = true; });

    nodes.forEach(function (n) {
      var nid = n.getAttribute("data-sys");
      n.classList.remove("active", "conn-in", "conn-out", "faded");
      if (nid === id) {
        n.classList.add("active");
      } else if (inSet[nid]) {
        n.classList.add("conn-in");
      } else if (outSet[nid]) {
        n.classList.add("conn-out");
      } else {
        n.classList.add("faded");
      }
    });

    // Populate Inspector panel in place
    if (inspector) {
      var targetCard = document.getElementById("card-" + id);
      inspName.textContent = nameOfSys(id);
      inspResp.textContent = targetCard ? targetCard.querySelector(".scard-resp").textContent : "";
      inspInCnt.textContent = incoming.length;
      inspOutCnt.textContent = outgoing.length;

      inspInList.innerHTML = incoming.length === 0 ? '<li class="dim">None</li>' : incoming.map(function (x) {
        return '<li><span class="badge-cyan">←</span> ' + nameOfSys(x.id) + ' <i class="dim">(' + x.via + ')</i></li>';
      }).join("");

      inspOutList.innerHTML = outgoing.length === 0 ? '<li class="dim">None</li>' : outgoing.map(function (x) {
        return '<li><span class="badge-pink">→</span> ' + nameOfSys(x.id) + ' <i class="dim">(' + x.via + ')</i></li>';
      }).join("");

      inspector.style.display = "block";
    }
  }

  function scrollToSystemCard(id) {
    var card = document.getElementById("card-" + id);
    if (card) {
      document.querySelectorAll(".scard").forEach(function (c) { c.classList.remove("highlighted"); });
      card.classList.add("highlighted");
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  nodes.forEach(function (n) {
    n.addEventListener("click", function () { selectSystemOnMap(n.getAttribute("data-sys")); });
    n.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectSystemOnMap(n.getAttribute("data-sys")); }
    });
  });
  if (svg) svg.addEventListener("click", function (ev) { if (ev.target === svg) clearMapSelection(); });
  if (inspClose) inspClose.addEventListener("click", clearMapSelection);
  if (inspJumpBtn) inspJumpBtn.addEventListener("click", function () { if (activeId) scrollToSystemCard(activeId); });

  // 3) Dependency jump links
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-jump]");
    if (btn) {
      ev.preventDefault();
      var targetId = btn.getAttribute("data-jump");
      selectSystemOnMap(targetId);
      scrollToSystemCard(targetId);
    }
  });

  // 4) Copy-to-clipboard for file paths
  document.addEventListener("click", function (ev) {
    var copyBtn = ev.target.closest(".copy-btn");
    if (copyBtn) {
      var text = copyBtn.getAttribute("data-copy");
      if (text && navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          var orig = copyBtn.textContent;
          copyBtn.textContent = "✓";
          setTimeout(function () { copyBtn.textContent = orig; }, 1200);
        });
      }
    }
  });

  // 5) Edge Type Filters
  var edgeToggles = Array.prototype.slice.call(document.querySelectorAll("#edge-toggles .etoggle"));
  edgeToggles.forEach(function (tog) {
    tog.addEventListener("click", function () {
      edgeToggles.forEach(function (t) { t.classList.remove("active"); });
      tog.classList.add("active");
      var viaClass = tog.getAttribute("data-via");

      edges.forEach(function (e) {
        if (viaClass === "all" || e.classList.contains(viaClass)) {
          e.style.display = "";
        } else {
          e.style.display = "none";
        }
      });
    });
  });

  // 6) Live Search & Filter Controls
  var searchInput = document.getElementById("arch-search");
  var filterPills = Array.prototype.slice.call(document.querySelectorAll("#filter-pills .fpill"));
  var cards = Array.prototype.slice.call(document.querySelectorAll(".scard"));
  var currentFilter = "all";

  function applyFilters() {
    var query = (searchInput.value || "").toLowerCase().trim();

    cards.forEach(function (card) {
      var searchBlob = card.getAttribute("data-search") || "";
      var domain = card.getAttribute("data-domain") || "";
      var isFragile = card.classList.contains("fragile");
      var isHot = card.classList.contains("hot-sys");

      var matchesQuery = !query || searchBlob.indexOf(query) !== -1;
      var matchesCategory = currentFilter === "all" ||
        (currentFilter === domain) ||
        (currentFilter === "fragile" && isFragile) ||
        (currentFilter === "hot" && isHot);

      if (matchesQuery && matchesCategory) {
        card.style.display = "";
      } else {
        card.style.display = "none";
      }
    });

    nodes.forEach(function (node) {
      var sysId = node.getAttribute("data-sys");
      var card = document.getElementById("card-" + sysId);
      if (card && card.style.display === "none") {
        node.classList.add("faded");
      } else {
        node.classList.remove("faded");
      }
    });
  }

  if (searchInput) searchInput.addEventListener("input", applyFilters);

  filterPills.forEach(function (pill) {
    pill.addEventListener("click", function () {
      filterPills.forEach(function (p) { p.classList.remove("active"); });
      pill.classList.add("active");
      currentFilter = pill.getAttribute("data-filter");
      applyFilters();
    });
  });

  // 7) Quick File Explorer Lookup
  var fileInput = document.getElementById("file-search-input");
  var fileResults = document.getElementById("file-search-results");
  var allFileRows = Array.prototype.slice.call(document.querySelectorAll(".file-row"));

  if (fileInput && fileResults) {
    fileInput.addEventListener("input", function () {
      var q = (fileInput.value || "").toLowerCase().trim();
      fileResults.innerHTML = "";
      if (!q) return;

      var matches = [];
      allFileRows.forEach(function (row) {
        var path = row.getAttribute("data-filepath") || "";
        if (path.toLowerCase().indexOf(q) !== -1) {
          var card = row.closest(".scard");
          var sysName = card ? card.querySelector("h3").textContent : "Unknown";
          var sysId = card ? card.getAttribute("data-sys") : "";
          matches.push({ path: path, sysName: sysName, sysId: sysId });
        }
      });

      if (matches.length === 0) {
        fileResults.innerHTML = '<div style="padding:6px; color:var(--dim)">No matching source files found</div>';
      } else {
        matches.slice(0, 15).forEach(function (m) {
          var item = document.createElement("div");
          item.className = "explorer-item";
          item.innerHTML = '<span class="mono">' + m.path + '</span> <span class="chip neutral">' + m.sysName + '</span>';
          item.addEventListener("click", function () {
            selectSystemOnMap(m.sysId);
            scrollToSystemCard(m.sysId);
          });
          fileResults.appendChild(item);
        });
      }
    });
  }
})();
</script>
</body>
</html>`;
}
