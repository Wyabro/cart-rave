/**
 * playtestConsoleHtml.mjs — render .diag-captures/playtest-console.html
 *
 * Generated surface (like architecture.html). Card list is baked at generate time from
 * STATUS + BACKLOG; verdicts/notes live in browser localStorage (v2 key).
 */

import { ROOT_TOKENS, BASE_CSS, esc, crossNav } from "./ccStyle.mjs";

const PAGE_CSS = `
  .sticky-bar { position:sticky; top:0; z-index:100; background:rgba(10,10,15,.94);
    backdrop-filter:blur(14px); border-bottom:1px solid var(--edge); padding:10px 0; margin-bottom:4px; }
  .sticky-inner { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;
    max-width:1040px; margin:0 auto; padding:0 16px; }
  .nav-brand { display:flex; align-items:center; gap:8px; font-weight:800; font-size:15px;
    letter-spacing:2px; text-decoration:none; color:var(--text); }
  .nav-brand .neon { color:var(--neon); text-shadow:0 0 12px rgba(255,45,149,.6); }
  .wrap { max-width:1040px; margin:0 auto; padding:20px 24px 80px; }
  header { display:flex; flex-wrap:wrap; gap:12px 20px; align-items:flex-start;
    justify-content:space-between; margin-bottom:18px; border-bottom:1px solid var(--edge); padding-bottom:16px; }
  h1 { margin:0; font-size:20px; letter-spacing:3px; font-weight:800; }
  h1 .neon { color:var(--neon); text-shadow:0 0 12px rgba(255,45,149,.6); }
  h1 .cc { color:var(--dim); margin-left:10px; font-size:12px; letter-spacing:3px; font-weight:700; }
  .stamp { color:var(--dim); font-size:12px; margin-top:5px; }
  .rules { background:linear-gradient(135deg, rgba(124,92,255,.10), var(--panel) 60%);
    border:1px solid rgba(124,92,255,.35); border-radius:12px; padding:14px 16px; margin-bottom:18px;
    font-size:.9rem; line-height:1.45; }
  .rules h2 { margin:0 0 8px; font-size:.85rem; color:var(--violet); text-transform:uppercase; letter-spacing:.08em; }
  .rules ol { margin:0; padding-left:1.2rem; }
  .rules li { margin:4px 0; }
  .meta { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-bottom:14px; }
  .meta label { display:block; font-size:.72rem; color:var(--dim); text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
  .meta input, .meta select, textarea, button {
    font:inherit; color:var(--text); background:var(--panel); border:1px solid var(--edge);
    border-radius:8px; padding:8px 10px; width:100%; }
  .meta input:focus, textarea:focus { outline:2px solid var(--violet); outline-offset:1px; }
  .toolbar { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; align-items:center; }
  button { cursor:pointer; width:auto; background:var(--panel2); }
  button:hover { border-color:var(--cyan); }
  button.primary { background:#2a1a4a; border-color:var(--violet); color:#dcd6ff; }
  button.good { background:#123528; border-color:var(--good); color:var(--good); }
  button.bad { background:#3a1520; border-color:var(--bad); color:var(--bad); }
  button.warn { background:#3a2e12; border-color:var(--warn); color:var(--warn); }
  button.ghost { background:transparent; }
  button:disabled { opacity:.4; cursor:not-allowed; }
  .progress-bar { height:8px; background:var(--panel); border-radius:999px; overflow:hidden;
    border:1px solid var(--edge); margin-bottom:6px; }
  .progress-bar > i { display:block; height:100%; background:linear-gradient(90deg,var(--neon),var(--violet)); width:0%; transition:width .25s; }
  .progress-label { font-size:.8rem; color:var(--dim); margin-bottom:16px; }
  section.phase { margin-bottom:22px; }
  section.phase h2 { margin:0 0 10px; font-size:.95rem; display:flex; align-items:center; gap:8px; }
  section.phase h2 .tag { font-size:.7rem; font-weight:600; padding:2px 8px; border-radius:999px;
    background:var(--panel2); border:1px solid var(--edge); color:var(--dim); }
  section.phase h2 .tag.active { color:#dcd6ff; border-color:var(--violet); background:#241a48; }
  section.phase h2 .tag.done { color:var(--good); border-color:#2a5a40; }
  .card { background:var(--panel); border:1px solid var(--edge); border-radius:12px;
    padding:14px 16px; margin-bottom:10px; opacity:.55; transition:opacity .15s, border-color .15s;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.03); }
  .card.now { opacity:1; border-color:var(--violet);
    box-shadow:0 0 0 1px rgba(124,92,255,.35), 0 8px 28px rgba(0,0,0,.35);
    background:linear-gradient(180deg,#1a1830,var(--panel)); }
  .card.done { opacity:.85; border-color:#2a5a40; }
  .card.fail { opacity:.9; border-color:rgba(255,93,93,.5); }
  .card.skip { opacity:.5; border-color:#4a4020; }
  .card-head { display:flex; flex-wrap:wrap; gap:8px 12px; align-items:baseline; justify-content:space-between; margin-bottom:8px; }
  .card-id { font-family:ui-monospace,Consolas,monospace; font-size:.75rem; color:var(--dim); }
  .card.now .card-id { color:var(--violet); font-weight:700; }
  .card-status { font-size:.72rem; text-transform:uppercase; letter-spacing:.06em;
    padding:2px 8px; border-radius:999px; border:1px solid var(--edge); color:var(--dim); }
  .card.now .card-status { color:#dcd6ff; border-color:var(--violet); }
  .card.done .card-status { color:var(--good); border-color:#2a5a40; }
  .card.fail .card-status { color:var(--bad); border-color:rgba(255,93,93,.5); }
  .card.skip .card-status { color:var(--warn); border-color:#5a4a20; }
  .card h3 { margin:0; font-size:1.05rem; line-height:1.3; }
  .card .do { margin:10px 0 0; font-size:.92rem; line-height:1.45; background:var(--panel2);
    border-radius:8px; padding:10px 12px; border-left:3px solid var(--cyan); }
  .card .expect { margin:8px 0 0; font-size:.88rem; color:var(--dim); line-height:1.4; }
  .card .expect strong { color:var(--text); font-weight:600; }
  .card .f8 { margin:8px 0 0; font-size:.82rem; font-family:ui-monospace,Consolas,monospace;
    color:#b8c0e0; background:#0a0c14; border-radius:8px; padding:8px 10px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .card .f8 code { color:var(--cyan); }
  .card .evidence { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; margin-top:10px; }
  .card .evidence label { font-size:.68rem; color:var(--dim); text-transform:uppercase; letter-spacing:.05em; display:block; margin-bottom:3px; }
  .card .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; align-items:center; }
  .card textarea { margin-top:8px; min-height:72px; resize:vertical; font-size:.9rem; width:100%; }
  .card .note-label { display:block; margin-top:10px; font-size:.72rem; color:var(--dim);
    text-transform:uppercase; letter-spacing:.06em; }
  .export-box { background:var(--panel); border:1px solid var(--edge); border-radius:12px;
    padding:14px 16px; margin-top:24px; }
  .export-box h2 { margin:0 0 8px; font-size:.95rem; }
  .export-box p { margin:0 0 10px; color:var(--dim); font-size:.85rem; line-height:1.4; }
  .export-box textarea { min-height:180px; font-family:ui-monospace,Consolas,monospace; font-size:.78rem; width:100%; }
  .footer-note { margin-top:18px; color:var(--dim); font-size:.8rem; line-height:1.4; }
  .empty-queue { padding:28px 20px; text-align:center; border:1px dashed var(--edge); border-radius:12px; color:var(--dim); }
  .empty-queue code { color:var(--cyan); }
  .src-chip { font-size:.68rem; padding:2px 7px; border-radius:999px; border:1px solid var(--edge); color:var(--dim); }
`;

/**
 * @param {{ cards: object[], meta: object, git?: { branch?: string | null, head?: string | null } }} opts
 */
export function renderPlaytestConsoleHtml(opts) {
  const cards = opts.cards || [];
  const meta = opts.meta || {};
  const branch = opts.git?.branch || "cart-clash";
  const head = opts.git?.head || meta.head || "?";
  const gen = meta.generatedAt || new Date().toISOString();
  const payloadJson = JSON.stringify({ cards, meta: { ...meta, branch, head } }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cart Clash — Playtest Console</title>
  <style>
${ROOT_TOKENS}
${BASE_CSS}
${PAGE_CSS}
  </style>
</head>
<body data-generated="${esc(gen)}">
  <div id="stale"></div>
  <div class="sticky-bar">
    <div class="sticky-inner">
      <a href="dashboard.html" class="nav-brand">CART <span class="neon">CLASH</span> PLAYTEST</a>
      ${crossNav("playtest")}
    </div>
  </div>

  <div class="wrap">
    <header>
      <div>
        <h1>CART <span class="neon">CLASH</span><span class="cc">PLAYTEST CONSOLE</span></h1>
        <div class="stamp">generated <span id="gen-ago">…</span> · <span class="mono">${esc(branch)} · ${esc(head)}</span>
          · <span class="mono">npm run dashboard</span> (or <span class="mono">playtest:console</span>) to refresh</div>
      </div>
      <div class="chips">
        <span class="chip neutral mono" id="card-count">${cards.length} cards</span>
        <span class="chip neutral" id="tally">—</span>
      </div>
    </header>

    <div class="rules">
      <h2>How this queue is built</h2>
      <ol>
        <li><b>Auto-seeded</b> from STATUS rows waiting on Wyatt + BACKLOG lines with <code>Owed: Wyatt playtest</code>.</li>
        <li><b>One active card</b> — pass / fail / skip before the next unlocks as focus.</li>
        <li><b>FAIL needs a note</b> + evidence fields (arena · mode · role). Export markdown for agents.</li>
        <li>Agents: one finding at a time. Do not propose a multi-card fix batch.</li>
      </ol>
    </div>

    <div class="meta">
      <div><label for="runNum">Run / label</label><input id="runNum" type="text" placeholder="e.g. pre-ship-1" value="" /></div>
      <div><label for="sessionDate">Session date</label><input id="sessionDate" type="date" /></div>
      <div><label for="prodUrl">Prod URL</label><input id="prodUrl" type="text" value="https://cart-rave.wyabro.workers.dev/?diag=1" /></div>
      <div><label for="bundleHint">Bundle / Version</label><input id="bundleHint" type="text" placeholder="Version from CC or wrangler" /></div>
      <div><label for="mStrongName">Strong machine</label><input id="mStrongName" type="text" placeholder="name / GPU" /></div>
      <div><label for="mWeakName">Weak machine</label><input id="mWeakName" type="text" placeholder="optional 2nd box" /></div>
    </div>

    <div class="toolbar">
      <button type="button" class="primary" id="btn-export-md">Copy agent markdown</button>
      <button type="button" class="ghost" id="btn-export-json">Download JSON</button>
      <button type="button" class="warn" id="btn-reset" title="Clears pass/fail/notes in this browser only">Reset session</button>
    </div>

    <div class="progress-bar"><i id="prog"></i></div>
    <div class="progress-label" id="prog-label">—</div>

    <div id="queue-root"></div>

    <div class="export-box">
      <h2>Agent export</h2>
      <p>Paste into chat after a session (or after any FAIL). Structured so agents can retest one card.</p>
      <textarea id="exportOut" readonly></textarea>
    </div>

    <p class="footer-note">
      Progress: <code>localStorage cartClashPlaytestConsole_v2</code> (this browser only).
      Card list: generated from STATUS + BACKLOG — not hand-edited.
      Contract for agents: when a change needs a human, write <code>Owed: Wyatt playtest — ID — one-line check</code>
      into STATUS or BACKLOG, then <code>npm run dashboard</code>.
    </p>
  </div>

  <script type="application/json" id="pt-data">${payloadJson}</script>
  <script>
(function () {
  const STORAGE_KEY = "cartClashPlaytestConsole_v2";
  const raw = document.getElementById("pt-data").textContent;
  const DATA = JSON.parse(raw);
  const TASKS = DATA.cards || [];

  /** @typedef {'pending'|'pass'|'fail'|'skip'} TaskStatus */

  let taskState = {};
  let activeId = TASKS[0] ? TASKS[0].id : "";

  function el(id) {
    const n = document.getElementById(id);
    if (!n) throw new Error("missing #" + id);
    return n;
  }

  function defaultTaskState() {
    const s = {};
    for (const t of TASKS) {
      s[t.id] = {
        status: "pending",
        note: "",
        arena: "",
        mode: "",
        role: "",
      };
    }
    return s;
  }

  function firstPendingId() {
    const t = TASKS.find((x) => taskState[x.id]?.status === "pending");
    return t ? t.id : null;
  }

  function load() {
    taskState = defaultTaskState();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        activeId = firstPendingId() || (TASKS[0] && TASKS[0].id) || "";
        return;
      }
      const data = JSON.parse(saved);
      if (data.taskState) {
        for (const id of Object.keys(data.taskState)) {
          if (taskState[id]) {
            taskState[id] = Object.assign(taskState[id], data.taskState[id]);
          }
        }
      }
      if (data.meta) applyMeta(data.meta);
      activeId = data.activeId && taskState[data.activeId] ? data.activeId : firstPendingId() || activeId;
      if (taskState[activeId] && taskState[activeId].status !== "pending") {
        activeId = firstPendingId() || activeId;
      }
    } catch (e) {
      activeId = (TASKS[0] && TASKS[0].id) || "";
    }
  }

  function metaFromDom() {
    return {
      runNum: el("runNum").value,
      sessionDate: el("sessionDate").value,
      prodUrl: el("prodUrl").value,
      bundleHint: el("bundleHint").value,
      mStrongName: el("mStrongName").value,
      mWeakName: el("mWeakName").value,
    };
  }

  function applyMeta(m) {
    for (const k of Object.keys(m || {})) {
      const node = document.getElementById(k);
      if (node && m[k] != null) node.value = m[k];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: 2,
      savedAt: new Date().toISOString(),
      activeId,
      meta: metaFromDom(),
      taskState,
    }));
  }

  function counts() {
    let pass = 0, fail = 0, skip = 0, pending = 0;
    for (const t of TASKS) {
      const s = taskState[t.id]?.status || "pending";
      if (s === "pass") pass++;
      else if (s === "fail") fail++;
      else if (s === "skip") skip++;
      else pending++;
    }
    return { pass, fail, skip, pending, total: TASKS.length, done: pass + fail + skip };
  }

  function f8For(task) {
    const run = (el("runNum").value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12);
    const base = (task.f8 || ("pt-" + task.id.toLowerCase())).replace(/\\s+/g, "-");
    if (!run) return base;
    if (base.endsWith("-" + run)) return base;
    return base + "-" + run;
  }

  function setStatus(id, status) {
    const st = taskState[id];
    if (!st) return;
    if (status === "fail" && !(st.note || "").trim()) {
      alert("FAIL needs a note — what broke?");
      return;
    }
    st.status = status;
    // Prefer advancing to next pending
    if (status !== "pending") {
      const idx = TASKS.findIndex((t) => t.id === id);
      let next = null;
      for (let i = idx + 1; i < TASKS.length; i++) {
        if (taskState[TASKS[i].id].status === "pending") { next = TASKS[i].id; break; }
      }
      if (!next) next = firstPendingId() || id;
      activeId = next;
    } else {
      activeId = id;
    }
    save();
    render();
    requestAnimationFrame(function () {
      const nowCard = document.querySelector(".card.now");
      if (nowCard) nowCard.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function buildMarkdown() {
    const m = metaFromDom();
    const c = counts();
    const lines = [];
    lines.push("# Cart Clash playtest export");
    lines.push("");
    lines.push("- **Run/label:** " + (m.runNum || "(unset)"));
    lines.push("- **Date:** " + (m.sessionDate || "(unset)"));
    lines.push("- **URL:** " + (m.prodUrl || ""));
    lines.push("- **Bundle/version:** " + (m.bundleHint || "(unset)"));
    lines.push("- **Strong:** " + (m.mStrongName || "?"));
    lines.push("- **Weak:** " + (m.mWeakName || "—"));
    lines.push("- **Tally:** " + c.pass + " pass / " + c.fail + " fail / " + c.skip + " skip / " + c.pending + " pending");
    lines.push("- **Active card:** " + (activeId || "—"));
    lines.push("- **Generated HEAD:** " + ((DATA.meta && DATA.meta.head) || "?"));
    lines.push("");
    lines.push("## Agent instructions");
    lines.push("");
    lines.push("1. Triage **one finding at a time** — do not propose a fix batch.");
    lines.push("2. Prefer FAIL cards over pending. Retest the same card id after a fix.");
    lines.push("3. Do not re-open closed NET-* / Run 7 evidence without new evidence.");
    lines.push("4. After a fix: mark STATUS/BACKLOG, run \`npm run dashboard\`, Wyatt retests this card.");
    lines.push("");

    const fails = TASKS.filter((t) => taskState[t.id]?.status === "fail");
    const passes = TASKS.filter((t) => taskState[t.id]?.status === "pass");
    const skips = TASKS.filter((t) => taskState[t.id]?.status === "skip");
    const noted = TASKS.filter((t) => {
      const st = taskState[t.id];
      return st && st.status === "pending" && (st.note || "").trim();
    });

    function emitCard(t) {
      const st = taskState[t.id] || {};
      lines.push("### " + t.id + " — " + t.title);
      lines.push("- **Status:** " + String(st.status || "pending").toUpperCase());
      lines.push("- **Source:** " + (t.source || "?") + " · phase " + (t.phase || "?"));
      if (st.arena) lines.push("- **Arena:** " + st.arena);
      if (st.mode) lines.push("- **Mode:** " + st.mode);
      if (st.role) lines.push("- **Role:** " + st.role);
      lines.push("- **F8 label:** \`" + f8For(t) + "\` (or \`?diag=1&captureLabel=" + f8For(t) + "\`)");
      if (st.note) lines.push("- **Note:** " + st.note);
      if (st.status === "fail") {
        lines.push("- **Ask agent:** one fix only for **" + t.id + "**; retest this card on prod after ship.");
      }
      lines.push("");
    }

    if (fails.length) {
      lines.push("## FAIL (action required)");
      lines.push("");
      fails.forEach(emitCard);
    }
    if (passes.length) {
      lines.push("## PASS");
      lines.push("");
      passes.forEach(emitCard);
    }
    if (skips.length) {
      lines.push("## SKIP");
      lines.push("");
      skips.forEach(emitCard);
    }
    if (noted.length) {
      lines.push("## Notes on pending");
      lines.push("");
      noted.forEach(emitCard);
    }

    lines.push("## F8 attachments expected");
    lines.push("");
    for (const t of TASKS) {
      const st = taskState[t.id];
      if (!st || st.status === "skip" || t.id === "EXPORT") continue;
      if (st.status === "pass" || st.status === "fail" || st.status === "pending") {
        lines.push("- \`" + f8For(t) + ".json\` — " + t.id);
      }
    }
    lines.push("");
    lines.push("_Generated playtest console — card list from STATUS + BACKLOG_");
    return lines.join("\\n");
  }

  function refreshExport() {
    el("exportOut").value = buildMarkdown();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      el("exportOut").focus();
      el("exportOut").select();
      return false;
    }
  }

  function phaseGroups() {
    const order = [];
    const map = {};
    for (const t of TASKS) {
      const p = t.phase || "OTHER";
      if (!map[p]) { map[p] = []; order.push(p); }
      map[p].push(t);
    }
    return order.map((p) => ({ phase: p, items: map[p] }));
  }

  function phaseTag(items) {
    const allDone = items.every((t) => taskState[t.id]?.status !== "pending");
    const hasNow = items.some((t) => t.id === activeId);
    if (allDone) return "done";
    if (hasNow) return "active";
    return "";
  }

  function render() {
    const root = el("queue-root");
    const c = counts();
    el("tally").textContent = c.pass + "✓ " + c.fail + "✕ " + c.skip + "△ " + c.pending + "…";
    el("prog").style.width = (c.total ? Math.round((c.done / c.total) * 100) : 0) + "%";
    el("prog-label").textContent = c.done + "/" + c.total + " resolved · active: " + (activeId || "—");

    if (!TASKS.length) {
      root.innerHTML = '<div class="empty-queue"><p><b>No playtest-owed cards right now.</b></p>' +
        "<p>When a change needs a human check, agents write <code>Owed: Wyatt playtest — ID — one-line check</code> " +
        "into STATUS or BACKLOG, then run <code>npm run dashboard</code>.</p></div>";
      refreshExport();
      return;
    }

    let html = "";
    for (const g of phaseGroups()) {
      const tag = phaseTag(g.items);
      html += '<section class="phase"><h2>' + escHtml(g.phase) +
        (tag ? ' <span class="tag ' + tag + '">' + tag + "</span>" : "") + "</h2>";
      for (const t of g.items) {
        const st = taskState[t.id] || { status: "pending", note: "", arena: "", mode: "", role: "" };
        const isNow = t.id === activeId;
        const cls = ["card"];
        if (isNow) cls.push("now");
        if (st.status === "pass") cls.push("done");
        if (st.status === "fail") cls.push("fail");
        if (st.status === "skip") cls.push("skip");
        const statusLabel = st.status === "pending" && isNow ? "NOW" : st.status.toUpperCase();
        const f8 = f8For(t);
        html += '<div class="' + cls.join(" ") + '" data-id="' + escHtml(t.id) + '">';
        html += '<div class="card-head"><span class="card-id">' + escHtml(t.id) +
          ' <span class="src-chip">' + escHtml(t.source || "") + "</span></span>" +
          '<span class="card-status">' + statusLabel + "</span></div>";
        html += "<h3>" + escHtml(t.title) + "</h3>";
        html += '<div class="do">' + escHtml(t.do) + "</div>";
        html += '<div class="expect"><strong>Pass looks like:</strong> ' + escHtml(t.expect) + "</div>";
        html += '<div class="f8">F8 label: <code>' + escHtml(f8) + "</code> " +
          '<button type="button" class="ghost btn-copy-f8" data-f8="' + escHtml(f8) + '">Copy</button> ' +
          '<span class="dim">URL: ?diag=1&amp;captureLabel=' + escHtml(f8) + "</span></div>";

        if (isNow || st.status !== "pending") {
          html += '<div class="evidence">' +
            '<div><label>Arena</label><input data-field="arena" data-id="' + escHtml(t.id) + '" value="' + escAttr(st.arena) + '" placeholder="classicRecord…" /></div>' +
            '<div><label>Mode</label><input data-field="mode" data-id="' + escHtml(t.id) + '" value="' + escAttr(st.mode) + '" placeholder="solo / quickplay / friends" /></div>' +
            '<div><label>Role</label><input data-field="role" data-id="' + escHtml(t.id) + '" value="' + escAttr(st.role) + '" placeholder="host / client" /></div>' +
            "</div>";
          html += '<label class="note-label">' + escHtml(t.notePrompt || "Note") + "</label>";
          html += '<textarea data-field="note" data-id="' + escHtml(t.id) + '" placeholder="What you saw…">' + escHtml(st.note) + "</textarea>";
        }

        if (isNow) {
          html += '<div class="actions">' +
            '<button type="button" class="good btn-status" data-id="' + escHtml(t.id) + '" data-status="pass">PASS</button>' +
            '<button type="button" class="bad btn-status" data-id="' + escHtml(t.id) + '" data-status="fail">FAIL</button>' +
            '<button type="button" class="warn btn-status" data-id="' + escHtml(t.id) + '" data-status="skip">SKIP</button>' +
            "</div>";
        } else if (st.status !== "pending") {
          html += '<div class="actions">' +
            '<button type="button" class="ghost btn-status" data-id="' + escHtml(t.id) + '" data-status="pending">Reopen</button>' +
            '<button type="button" class="ghost btn-focus" data-id="' + escHtml(t.id) + '">Focus</button>' +
            "</div>";
        } else {
          html += '<div class="actions"><button type="button" class="ghost btn-focus" data-id="' + escHtml(t.id) + '">Focus</button></div>';
        }
        html += "</div>";
      }
      html += "</section>";
    }
    root.innerHTML = html;
    refreshExport();
  }

  function escHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function escAttr(s) { return escHtml(s); }

  el("queue-root").addEventListener("click", function (ev) {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.classList.contains("btn-status")) {
      setStatus(t.getAttribute("data-id"), t.getAttribute("data-status"));
    } else if (t.classList.contains("btn-focus")) {
      activeId = t.getAttribute("data-id") || activeId;
      save();
      render();
    } else if (t.classList.contains("btn-copy-f8")) {
      const f8 = t.getAttribute("data-f8") || "";
      copyText(f8).then(function (ok) {
        t.textContent = ok ? "Copied" : "Select";
        setTimeout(function () { t.textContent = "Copy"; }, 1200);
      });
    }
  });

  el("queue-root").addEventListener("input", function (ev) {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const field = t.getAttribute("data-field");
    const id = t.getAttribute("data-id");
    if (!field || !id || !taskState[id]) return;
    taskState[id][field] = t.value;
    save();
    refreshExport();
  });

  ["runNum", "sessionDate", "prodUrl", "bundleHint", "mStrongName", "mWeakName"].forEach(function (id) {
    el(id).addEventListener("change", function () { save(); render(); });
    el(id).addEventListener("input", function () { save(); refreshExport(); });
  });

  el("btn-export-md").addEventListener("click", async function () {
    refreshExport();
    const ok = await copyText(el("exportOut").value);
    el("btn-export-md").textContent = ok ? "Copied ✓" : "Select & copy";
    setTimeout(function () { el("btn-export-md").textContent = "Copy agent markdown"; }, 1500);
  });

  el("btn-export-json").addEventListener("click", function () {
    const blob = new Blob([JSON.stringify({
      v: 2,
      exportedAt: new Date().toISOString(),
      meta: metaFromDom(),
      activeId,
      counts: counts(),
      generated: DATA.meta,
      tasks: TASKS.map(function (t) {
        const st = taskState[t.id] || {};
        return {
          id: t.id,
          phase: t.phase,
          title: t.title,
          source: t.source,
          status: st.status,
          note: st.note,
          arena: st.arena,
          mode: st.mode,
          role: st.role,
          f8: f8For(t),
        };
      }),
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cart-clash-playtest-" + (el("runNum").value || "session") + "-" + Date.now() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  el("btn-reset").addEventListener("click", function () {
    if (!confirm("Clear all pass/fail/notes in this browser for the current card list?")) return;
    taskState = defaultTaskState();
    activeId = firstPendingId() || (TASKS[0] && TASKS[0].id) || "";
    save();
    render();
  });

  // Staleness stamp
  try {
    var gen = document.body.getAttribute("data-generated");
    var ageH = (Date.now() - new Date(gen).getTime()) / 3600000;
    var genAgo = document.getElementById("gen-ago");
    function agoText(iso) {
      var ms = Date.now() - new Date(iso).getTime();
      var min = Math.round(ms / 60000);
      if (min < 60) return min + "m ago";
      var h = Math.round(min / 60);
      if (h < 48) return h + "h ago";
      return Math.round(h / 24) + "d ago";
    }
    if (genAgo && isFinite(ageH)) genAgo.textContent = agoText(gen);
    if (isFinite(ageH) && ageH > 12) {
      var stale = document.getElementById("stale");
      stale.style.display = "block";
      stale.textContent = "⚠ This console was generated " + agoText(gen) + " — run npm run dashboard for current STATUS/BACKLOG cards.";
    }
  } catch (e) { /* ignore */ }

  if (!el("sessionDate").value) {
    try {
      el("sessionDate").value = new Date().toISOString().slice(0, 10);
    } catch (e) { /* ignore */ }
  }

  load();
  render();
})();
  </script>
</body>
</html>`;
}
