/**
 * playtestConsoleHtml.mjs — render .diag-captures/playtest-console.html
 *
 * Thin checklist: one NOW card → PASS/FAIL/SKIP → auto-copy report → next.
 * Card list baked at generate time from STATUS + BACKLOG; verdicts in localStorage (v3).
 */

import { ROOT_TOKENS, BASE_CSS, CHROME_CSS, esc, crossNav } from "./ccStyle.mjs";

const PAGE_CSS = `
  /* Narrow reading column — one checklist, not a dashboard (CC-COHERE-1). */
  :root { --measure:720px; --chrome-gap:4px; --chrome-pad:16px; }
  .wrap { max-width:var(--measure); margin:0 auto; padding:20px 20px 100px; }
  header { margin-bottom:14px; border-bottom:1px solid var(--edge); padding-bottom:14px; }
  .progress-bar { height:6px; background:var(--panel); border-radius:999px; overflow:hidden;
    border:1px solid var(--edge); margin-bottom:6px; }
  .progress-bar > i { display:block; height:100%; background:linear-gradient(90deg,var(--neon),var(--violet)); width:0%; transition:width .25s; }
  .progress-label { font-size:.8rem; color:var(--dim); margin-bottom:18px; }
  .card { background:var(--panel); border:1px solid var(--edge); border-radius:12px;
    padding:14px 16px; margin-bottom:8px; opacity:.45; transition:opacity .15s, border-color .15s;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.03); }
  .card.now { opacity:1; border-color:var(--violet);
    box-shadow:0 0 0 1px rgba(124,92,255,.35), 0 8px 28px rgba(0,0,0,.35);
    background:linear-gradient(180deg,var(--panel-violet),var(--panel)); }
  .card.done { opacity:.7; border-color:var(--edge-good); }
  .card.fail { opacity:.85; border-color:rgba(255,93,93,.5); }
  .card.skip { opacity:.5; border-color:var(--edge-warn); }
  .card.upnext { opacity:.55; }
  .card-head { display:flex; flex-wrap:wrap; gap:8px 12px; align-items:baseline; justify-content:space-between; margin-bottom:6px; }
  .card-id { font-family:ui-monospace,Consolas,monospace; font-size:.75rem; color:var(--dim); }
  .card.now .card-id { color:var(--violet); font-weight:700; }
  .card-status { font-size:.72rem; text-transform:uppercase; letter-spacing:.06em;
    padding:2px 8px; border-radius:999px; border:1px solid var(--edge); color:var(--dim); }
  .card.now .card-status { color:var(--text-hi); border-color:var(--violet); }
  .card.done .card-status { color:var(--good); border-color:var(--edge-good); }
  .card.fail .card-status { color:var(--bad); border-color:rgba(255,93,93,.5); }
  .card.skip .card-status { color:var(--warn); border-color:var(--edge-warn); }
  /* Only two-machine cards are badged — solo is the sorted-first default, so a badge
     on every card would be noise. This one marks where a one-desk sitting stops. */
  .card-rig { font-size:.72rem; text-transform:uppercase; letter-spacing:.06em;
    padding:2px 8px; border-radius:999px; border:1px solid var(--edge-warn);
    color:var(--warn); white-space:nowrap; }
  .card h3 { margin:0; font-size:1.1rem; line-height:1.3; }
  .card .do { margin:10px 0 0; font-size:.95rem; line-height:1.45; background:var(--panel2);
    border-radius:8px; padding:10px 12px; border:1px solid rgba(39,224,230,.35); }
  .card .do-goal { margin:0; font-weight:600; color:var(--text-hi); }
  .card .do-context { margin:6px 0 0; font-size:.88rem; color:var(--dim); }
  .card .do-steps { margin:8px 0 0; padding-left:1.35em; display:flex; flex-direction:column; gap:6px; }
  .card .do-steps li { line-height:1.45; }
  .card .do-tail { margin:8px 0 0; font-size:.88rem; color:var(--dim); }
  .card .expect { margin:8px 0 0; font-size:.88rem; color:var(--dim); line-height:1.4; }
  .card .expect strong { color:var(--text); font-weight:600; }
  .card .note-label { display:block; margin-top:12px; font-size:.72rem; color:var(--dim); letter-spacing:.01em; }
  .card textarea { margin-top:6px; min-height:64px; resize:vertical; font:inherit; font-size:.9rem;
    width:100%; color:var(--text); background:var(--panel); border:1px solid var(--edge);
    border-radius:8px; padding:8px 10px; }
  .card textarea:focus { outline:2px solid var(--violet); outline-offset:1px; }
  .card .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; align-items:center; }
  button { font:inherit; color:var(--text); background:var(--panel2); border:1px solid var(--edge);
    border-radius:8px; padding:8px 12px; cursor:pointer; }
  button:hover { border-color:var(--cyan); }
  button.primary { background:var(--fill-violet); border-color:var(--violet); color:var(--text-hi); }
  button.good { background:var(--fill-good); border-color:var(--good); color:var(--good); }
  button.bad { background:var(--fill-bad); border-color:var(--bad); color:var(--bad); }
  button.warn { background:var(--fill-warn); border-color:var(--warn); color:var(--warn); }
  button.ghost { background:transparent; }
  button:disabled { opacity:.4; cursor:not-allowed; }
  .sticky-actions { position:fixed; bottom:0; left:0; right:0; z-index:20;
    background:rgba(10,10,17,.92); border-top:1px solid var(--edge);
    backdrop-filter:blur(8px); padding:10px 16px; }
  .sticky-inner-actions { max-width:var(--measure); margin:0 auto;
    display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; }
  .sticky-inner-actions .hint { font-size:.8rem; color:var(--dim); }
  .toast { position:fixed; bottom:64px; left:50%; transform:translateX(-50%);
    background:var(--panel2); border:1px solid var(--edge-good); color:var(--good);
    padding:8px 14px; border-radius:999px; font-size:.85rem; opacity:0; pointer-events:none;
    transition:opacity .2s; z-index:30; }
  .toast.show { opacity:1; }
  .empty-queue { padding:28px 20px; text-align:center; border:1px dashed var(--edge); border-radius:12px; color:var(--dim); }
  .empty-queue code { color:var(--cyan); }
  .footer-note { margin-top:18px; color:var(--dim); font-size:.8rem; line-height:1.4; }
  .upnext-label { font-size:.78rem; color:var(--dim); margin:18px 0 8px; }
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
${CHROME_CSS}
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
        <h1>CART <span class="neon">CLASH</span><span class="cc">PLAYTEST</span></h1>
        <div class="stamp">check → mark → report copies → next · <span class="mono">${esc(branch)} · ${esc(head)}</span>
          · refresh with <span class="mono">npm run dashboard</span></div>
      </div>
      <div class="chips">
        <span class="chip neutral mono" id="card-count">${cards.length} cards</span>
        <span class="chip neutral" id="tally">—</span>
      </div>
    </header>

    <div class="progress-bar"><i id="prog"></i></div>
    <div class="progress-label" id="prog-label">—</div>

    <div id="queue-root"></div>

    <p class="footer-note">
      Progress stays in this browser (<code>cartClashPlaytestConsole_v3</code>).
      Cards come from STATUS / BACKLOG <code>Owed: Wyatt playtest</code> — not hand-edited here.
    </p>
  </div>

  <div class="sticky-actions">
    <div class="sticky-inner-actions">
      <span class="hint" id="copy-hint">Report auto-copies on PASS / FAIL / SKIP</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="primary" id="btn-export-md">Copy report</button>
        <button type="button" class="ghost" id="btn-reset" title="Clears pass/fail/notes in this browser only">Reset</button>
      </div>
    </div>
  </div>
  <div class="toast" id="toast" role="status">Copied</div>

  <script type="application/json" id="pt-data">${payloadJson}</script>
  <script>
(function () {
  const STORAGE_KEY = "cartClashPlaytestConsole_v3";
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
      s[t.id] = { status: "pending", note: "" };
    }
    return s;
  }

  function firstPendingId() {
    const t = TASKS.find((x) => taskState[x.id]?.status === "pending");
    return t ? t.id : null;
  }

  /** First pending card after \`id\`, wrapping; excludes \`id\` itself. */
  function nextPendingAfter(id) {
    if (!TASKS.length) return null;
    const idx = Math.max(0, TASKS.findIndex((t) => t.id === id));
    for (let i = 1; i <= TASKS.length; i++) {
      const t = TASKS[(idx + i) % TASKS.length];
      if (t.id === id) continue;
      if (taskState[t.id]?.status === "pending") return t.id;
    }
    return null;
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
            taskState[id].status = data.taskState[id].status || "pending";
            taskState[id].note = data.taskState[id].note || "";
          }
        }
      }
      activeId = data.activeId && taskState[data.activeId] ? data.activeId : firstPendingId() || activeId;
      if (taskState[activeId] && taskState[activeId].status !== "pending") {
        activeId = firstPendingId() || activeId;
      }
    } catch (e) {
      activeId = (TASKS[0] && TASKS[0].id) || "";
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: 3,
      savedAt: new Date().toISOString(),
      activeId,
      taskState,
    }));
  }

  // * PREFLIGHT and EXPORT are setup and handoff, not work. Scoring them inflated the
  // * tally (17 pass really meant 15 cards) and invited "why is this a card?".
  function isScoreable(t) {
    return t && t.source !== "system";
  }

  function counts() {
    let pass = 0, fail = 0, skip = 0, pending = 0;
    for (const t of TASKS) {
      if (!isScoreable(t)) continue;
      const s = taskState[t.id]?.status || "pending";
      if (s === "pass") pass++;
      else if (s === "fail") fail++;
      else if (s === "skip") skip++;
      else pending++;
    }
    return { pass, fail, skip, pending, total: TASKS.filter(isScoreable).length, done: pass + fail + skip };
  }

  function f8For(task) {
    return (task.f8 || ("pt-" + task.id.toLowerCase())).replace(/\\s+/g, "-");
  }

  function toast(msg) {
    const n = el("toast");
    n.textContent = msg;
    n.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { n.classList.remove("show"); }, 1400);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  }

  function buildMarkdown() {
    const c = counts();
    const lines = [];
    lines.push("# Cart Clash playtest export");
    lines.push("");
    lines.push("- **Tally:** " + c.pass + " pass / " + c.fail + " fail / " + c.skip + " skip / " + c.pending + " pending");
    lines.push("- **Active card:** " + (activeId || "—"));
    lines.push("- **Generated HEAD:** " + ((DATA.meta && DATA.meta.head) || "?"));
    lines.push("");
    lines.push("Agents: triage **one FAIL at a time**. Retest the same card id after a fix.");
    lines.push("");

    const fails = TASKS.filter((t) => taskState[t.id]?.status === "fail");
    const passes = TASKS.filter((t) => taskState[t.id]?.status === "pass");
    const skips = TASKS.filter((t) => taskState[t.id]?.status === "skip");

    // * A PASS used to have no write-back path: the verdict lived in this browser's
    // * localStorage while the source row still said "Owed: Wyatt playtest", so every
    // * regeneration reseeded cards that were already done and they got re-run by hand.
    // * The export has to ask for the close explicitly, before any FAIL work starts.
    const closable = passes.filter((t) => t.source !== "system");
    if (closable.length) {
      lines.push("## CLOSE THESE FIRST (agent action, before any FAIL)");
      lines.push("");
      lines.push(
        "These " + closable.length + " cards PASSED. Close them **in this session**, or they " +
        "reseed the console and get played again:",
      );
      lines.push("");
      for (const t of closable) lines.push("- \`" + t.id + "\` — " + t.title);
      lines.push("");
      lines.push("1. Delete each row from \`docs/planning/BACKLOG.md\` (\`## Playtest owed\`), or");
      lines.push("   rewrite its Notes to \`Wyatt playtest PASS <date> — …\` if the row carries");
      lines.push("   engineering detail worth keeping.");
      lines.push("2. Record them in \`docs/planning/completed-work.md\`.");
      lines.push("3. Update any STATUS row the pass closes.");
      lines.push("4. Regenerate: \`npm run playtest:console\`. The listed ids must be gone.");
      lines.push("");
    }

    function emitCard(t) {
      const st = taskState[t.id] || {};
      lines.push("### " + t.id + " — " + t.title);
      lines.push("- **Status:** " + String(st.status || "pending").toUpperCase());
      lines.push("- **Check:** " + (t.do || ""));
      if (t.context) lines.push("- **Context:** " + t.context);
      if (t.steps && t.steps.length) {
        lines.push("- **Steps:**");
        t.steps.forEach((s, i) => lines.push("  " + (i + 1) + ". " + s));
      }
      if (t.tail) lines.push("- **Also:** " + t.tail);
      lines.push("- **F8:** \`" + f8For(t) + "\`");
      if (st.note) lines.push("- **Note:** " + st.note);
      if (st.status === "fail") {
        lines.push("- **Ask agent:** one fix only for **" + t.id + "**; retest this card after ship.");
      }
      lines.push("");
    }

    if (fails.length) {
      lines.push("## FAIL (action required)");
      lines.push("");
      fails.forEach(emitCard);
    }
    if (closable.length) {
      // Only real cards — PREFLIGHT/EXPORT reprinting their own steps is noise.
      lines.push("## PASS");
      lines.push("");
      closable.forEach(emitCard);
    }
    if (skips.length) {
      lines.push("## SKIP");
      lines.push("");
      skips.forEach(emitCard);
    }
    if (!fails.length && !passes.length && !skips.length) {
      lines.push("_No cards marked yet._");
      lines.push("");
    }
    lines.push("_Playtest console — cards from STATUS + BACKLOG_");
    return lines.join("\\n");
  }

  async function copyReport(flashBtn) {
    const md = buildMarkdown();
    const ok = await copyText(md);
    toast(ok ? "Report copied — paste into chat" : "Copy failed — use Copy report");
    if (flashBtn) {
      const btn = el("btn-export-md");
      btn.textContent = ok ? "Copied ✓" : "Copy failed";
      setTimeout(function () { btn.textContent = "Copy report"; }, 1500);
    }
    return ok;
  }

  async function setStatus(id, status) {
    const st = taskState[id];
    if (!st) return;
    if (status === "fail" && !(st.note || "").trim()) {
      alert("FAIL needs a note — what broke?");
      return;
    }
    st.status = status;
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
    if (status === "pass" || status === "fail" || status === "skip") {
      await copyReport(false);
    }
    requestAnimationFrame(function () {
      const nowCard = document.querySelector(".card.now");
      if (nowCard) nowCard.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function render() {
    const root = el("queue-root");
    const c = counts();
    el("tally").textContent = c.pass + "✓ " + c.fail + "✕ " + c.skip + "△ · " + c.pending + " left";
    el("prog").style.width = (c.total ? Math.round((c.done / c.total) * 100) : 0) + "%";
    el("prog-label").textContent = c.pending
      ? c.pending + " left · now: " + (activeId || "—")
      : "Queue clear · " + c.pass + " pass / " + c.fail + " fail";

    if (!TASKS.length) {
      root.innerHTML = '<div class="empty-queue"><p><b>Nothing owed right now.</b></p>' +
        "<p>When a change needs eyes, agents write <code>Owed: Wyatt playtest — ID — one-line check</code> " +
        "into STATUS or BACKLOG, then <code>npm run dashboard</code>.</p></div>";
      return;
    }

    const upNextId = activeId ? nextPendingAfter(activeId) : firstPendingId();
    let html = "";

    // * The goal is one sentence; the steps are a real list. Nothing is truncated —
    // * cutting the string at 200 chars used to drop whole instructions.
    function renderCheck(t) {
      let out = '<p class="do-goal">' + escHtml(t.do || "") + "</p>";
      if (t.context) out += '<p class="do-context">' + escHtml(t.context) + "</p>";
      if (t.steps && t.steps.length) {
        out += '<ol class="do-steps">';
        for (const step of t.steps) out += "<li>" + escHtml(step) + "</li>";
        out += "</ol>";
      }
      if (t.tail) out += '<p class="do-tail">' + escHtml(t.tail) + "</p>";
      return out;
    }

    // * Resolved first (reopen), then NOW, then one up-next teaser — hide the rest of the queue.
    function renderCard(t, kind) {
      const st = taskState[t.id] || { status: "pending", note: "" };
      const isNow = kind === "now";
      const isUpNext = kind === "upnext";
      const cls = ["card"];
      if (isNow) cls.push("now");
      if (st.status === "pass") cls.push("done");
      if (st.status === "fail") cls.push("fail");
      if (st.status === "skip") cls.push("skip");
      if (isUpNext) cls.push("upnext");
      const statusLabel = isNow ? "NOW" : st.status.toUpperCase();
      let out = "";
      if (isUpNext) out += '<div class="upnext-label">Up next</div>';
      out += '<div class="' + cls.join(" ") + '" data-id="' + escHtml(t.id) + '">';
      const rigBadge = t.rig === "mp" ? '<span class="card-rig">2 PC</span>' : "";
      out += '<div class="card-head"><span class="card-id">' + escHtml(t.id) + "</span>" +
        rigBadge + '<span class="card-status">' + statusLabel + "</span></div>";
      out += "<h3>" + escHtml(t.title) + "</h3>";
      if (isNow) {
        out += '<div class="do">' + renderCheck(t) + "</div>";
        out += '<div class="expect"><strong>Pass looks like:</strong> ' + escHtml(t.expect) + "</div>";
        out += '<label class="note-label">' + escHtml(t.notePrompt || "Note (required on FAIL)") + "</label>";
        out += '<textarea data-field="note" data-id="' + escHtml(t.id) + '" placeholder="What you saw…">' +
          escHtml(st.note) + "</textarea>";
        out += '<div class="actions">';
        if (isScoreable(t)) {
          out += '<button type="button" class="good btn-status" data-id="' + escHtml(t.id) + '" data-status="pass">PASS</button>' +
            '<button type="button" class="bad btn-status" data-id="' + escHtml(t.id) + '" data-status="fail">FAIL</button>' +
            '<button type="button" class="warn btn-status" data-id="' + escHtml(t.id) + '" data-status="skip">SKIP</button>';
        } else {
          // Setup / handoff: advance without recording a verdict.
          out += '<button type="button" class="ghost btn-status" data-id="' + escHtml(t.id) + '" data-status="pass">Done — next</button>';
        }
        out += "</div>";
      } else if (st.status !== "pending") {
        if (st.note) out += '<div class="expect">' + escHtml(st.note) + "</div>";
        out += '<div class="actions">' +
          '<button type="button" class="ghost btn-status" data-id="' + escHtml(t.id) + '" data-status="pending">Reopen</button>' +
          "</div>";
      } else {
        out += '<div class="expect">' + escHtml(t.do) + "</div>";
      }
      out += "</div>";
      return out;
    }

    for (const t of TASKS) {
      if (taskState[t.id]?.status !== "pending") html += renderCard(t, "done");
    }
    const nowTask = TASKS.find((t) => t.id === activeId);
    if (nowTask && taskState[nowTask.id]?.status === "pending") {
      html += renderCard(nowTask, "now");
    }
    if (upNextId && upNextId !== activeId) {
      const up = TASKS.find((t) => t.id === upNextId);
      if (up) html += renderCard(up, "upnext");
    }
    root.innerHTML = html;
  }

  function escHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  el("queue-root").addEventListener("click", function (ev) {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.classList.contains("btn-status")) {
      setStatus(t.getAttribute("data-id"), t.getAttribute("data-status"));
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
  });

  el("btn-export-md").addEventListener("click", function () {
    copyReport(true);
  });

  el("btn-reset").addEventListener("click", function () {
    if (!confirm("Clear all pass/fail/notes in this browser for the current card list?")) return;
    taskState = defaultTaskState();
    activeId = firstPendingId() || (TASKS[0] && TASKS[0].id) || "";
    save();
    render();
  });

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

  load();
  render();
})();
  </script>
</body>
</html>`;
}
