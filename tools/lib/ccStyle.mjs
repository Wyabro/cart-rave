/**
 * ccStyle.mjs — the Command Center's shared visual layer.
 *
 * Four generated HTML surfaces MUST look like one product: the dashboard (tools/dashboard.mjs),
 * the architecture page (tools/lib/archHtml.mjs), the playtest console
 * (tools/lib/playtestConsoleHtml.mjs), and the capture contact sheets (tools/lib/montage.mjs).
 * Their design tokens live here once so the surfaces cannot drift apart. The first three also
 * take BASE_CSS; montage.mjs imports ROOT_TOKENS **only** — the contact sheets keep their own
 * denser shell (14px/1.5 body, tighter chips, no backdrop wash). Each page adds its own
 * page-specific CSS after these shared blocks.
 *
 *   - ROOT_TOKENS — the `:root { … }` custom-property block (colors + surfaces).
 *   - BASE_CSS    — reset + body backdrop + the 2px top-gradient rule + the shared primitives
 *                   (.shell, .chip(+variants), .k, .panel, details.ref, tables, .pill, .links, #stale).
 *   - esc()       — the single HTML-escaper both renderers use for every interpolated string.
 */

/**
 * The design tokens with boosted contrast for high readability.
 *
 * Every colour on a Command Center surface comes from here. Two carve-outs, both
 * deliberate: pure `#fff` / `#000` stay literal (they are contrast absolutes, and a token
 * for white prevents no drift), and `CART_ACCENTS` in archHtml.mjs mirrors the cart hues
 * in src/config.js — those must track the GAME palette, not this one.
 *
 * Alpha tints stay hand-expanded (`rgba(39,224,230,.15)` for a `--cyan` wash) because
 * that is this file's existing convention for `--good` / `--bad` / `--warn`. The triplet
 * must match its token: a wash that disagrees with the border it sits behind is exactly
 * the drift CC-TOKEN-1 was filed for.
 */
export const ROOT_TOKENS = `  :root { --bg:#0a0a11; --panel:#13131c; --panel2:#191926; --edge:#252538; --edge2:#383854;
          --text:#f0eff8; --text2:#c9c7da; --text-hi:#dcd6ff; --dim:#a4a4c4;
          --neon:#ff2d95; --cyan:#27e0e6; --violet:#7c5cff;
          --good:#3ddc84; --bad:#ff5d5d; --warn:#ffc24b;
          --hot:#ff6600; --ink:#0a0c14;
          --fill-violet:#2a1a4a; --panel-violet:#1a1830;
          --fill-good:#123528; --edge-good:#2a5a40; --fill-bad:#3a1520;
          --fill-warn:#3a2e12; --edge-warn:#5a4a20;
          --neon-text:#ff8fc4; --violet-text:#b6a4ff; --warn-text:#ffe6b3; --hot-text:#ffb27a;
          --neon-deep:#d41f78; --violet-deep:#5a3fd6; --cyan-deep:#1aa9ae; }`;

/** Shared base + primitive component classes with optimized font sizes and line spacing. */
export const BASE_CSS = `  * { box-sizing:border-box; }
  body { margin:0; padding:0; background:var(--bg); color:var(--text);
         font:15px/1.6 "Segoe UI", system-ui, -apple-system, sans-serif;
         background-image:radial-gradient(1100px 500px at 50% -180px, rgba(255,45,149,.11), transparent 65%),
                          radial-gradient(700px 400px at 88% -40px, rgba(39,224,230,.07), transparent 60%); }
  body::before { content:""; position:fixed; top:0; left:0; right:0; height:2px; z-index:10;
                 background:linear-gradient(90deg, var(--neon), var(--violet), var(--cyan)); opacity:.85; }
  .shell { max-width:1440px; margin:0 auto; padding:20px 24px 70px; }
  a { color:var(--cyan); text-decoration:none; } a:hover { text-decoration:underline; }
  .dim { color:var(--dim); } .mono { font-family:ui-monospace,"Cascadia Code",Consolas,monospace; font-size:13px; }
  .empty { color:var(--dim); font-style:italic; padding:6px 0; }

  #stale { display:none; margin:0 0 16px; padding:12px 18px; border:1px solid rgba(255,194,75,.5);
           border-radius:10px; background:rgba(255,194,75,.08); color:var(--warn); font-weight:600; }

  .chips { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; }
  .chip { display:inline-block; padding:3px 11px; border-radius:999px; font-size:12.5px; border:1px solid var(--edge);
          background:var(--panel); color:var(--dim); white-space:nowrap; }
  .chip i { font-style:normal; opacity:.8; }
  .chip.good { color:var(--good); border-color:rgba(61,220,132,.35); }
  .chip.bad { color:var(--bad); border-color:rgba(255,93,93,.4); }
  .chip.warn { color:var(--warn); border-color:rgba(255,194,75,.4); }
  .chip.neutral a { color:inherit; }

  .k { font-size:11.5px; letter-spacing:2.5px; font-weight:700; color:var(--dim); text-transform:uppercase; }

  .panel { background:var(--panel); border:1px solid var(--edge); border-radius:12px; padding:16px 20px;
           box-shadow:inset 0 1px 0 rgba(255,255,255,.03); }
  .panel ul, .panel ol { margin:8px 0 0; padding-left:20px; } .panel li { margin:5px 0; }

  h2.sec { font-size:13px; text-transform:uppercase; letter-spacing:2.5px; color:var(--dim); margin:24px 0 10px; font-weight:700; }
  details.ref { background:var(--panel); border:1px solid var(--edge); border-radius:10px; margin:8px 0;
                transition:border-color .15s; }
  details.ref:hover { border-color:var(--edge2); }
  details.ref summary { cursor:pointer; padding:12px 18px; color:var(--dim); font-size:13.5px; letter-spacing:1px;
                        text-transform:uppercase; font-weight:600; list-style:none; }
  details.ref summary::before { content:"▸ "; color:var(--edge2); }
  details.ref[open] summary::before { content:"▾ "; }
  details.ref summary:hover { color:var(--text); }
  details.ref .inner { padding:6px 18px 18px; }
  table { border-collapse:collapse; width:100%; background:var(--panel2); border-radius:8px; overflow:hidden; }
  th, td { text-align:left; padding:9px 14px; border-bottom:1px solid var(--edge); vertical-align:top; font-size:13px; }
  th { color:var(--dim); font-weight:600; font-size:11.5px; text-transform:uppercase; letter-spacing:1px; }
  tr:last-child td { border-bottom:none; }
  .pill { display:inline-block; padding:2px 11px; border-radius:99px; font-weight:700; font-size:12px; }
  .pill.pass { background:rgba(61,220,132,.15); color:var(--good); }
  .pill.fail { background:rgba(255,93,93,.15); color:var(--bad); }
  .pill.setup { background:rgba(255,194,75,.15); color:var(--warn); }
  .links { display:flex; flex-wrap:wrap; gap:8px; }
  .links a { background:var(--panel2); border:1px solid var(--edge); border-radius:6px; padding:5px 12px; font-size:13px; }

  /* Cross-surface switcher — the SAME prominent nav on every Command Center surface
     (dashboard · architecture · playtest console) so switching between them is one obvious
     click, never a hunt. Rendered top-of-page by crossNav(); styled once here so the pages
     cannot drift. */
  .cc-switch { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .cc-switch a { display:inline-flex; align-items:center; gap:7px; padding:9px 17px; border-radius:10px;
                 border:1px solid var(--edge2); background:var(--panel2); color:var(--text);
                 font-size:14px; font-weight:700; letter-spacing:.4px; text-decoration:none; white-space:nowrap;
                 transition:border-color .15s, color .15s, box-shadow .15s; }
  .cc-switch a:hover { border-color:var(--cyan); color:var(--cyan); text-decoration:none; }
  .cc-switch a.active { border-color:var(--neon); color:#fff; cursor:default;
                        background:linear-gradient(180deg, rgba(255,45,149,.22), rgba(124,92,255,.14));
                        box-shadow:0 0 0 1px rgba(255,45,149,.35), 0 0 14px rgba(255,45,149,.25); }
  .cc-switch a.active:hover { border-color:var(--neon); color:#fff; }
  .cc-switch .sw-ico { font-size:15px; line-height:1; }`;

/**
 * Shared page chrome for the three Command Center surfaces: the sticky bar, the wordmark, the
 * nav links, the h1 lockup and the stamp line.
 *
 * Hoisted here (CC-COHERE-1) because dashboard.mjs and archHtml.mjs carried BYTE-IDENTICAL
 * copies of this block while playtestConsoleHtml.mjs carried a drifted one — a dimmer, tighter
 * h1 glow, a different `.cc` treatment, a 1px stamp offset. Three copies of the same furniture
 * is *why* these pages drift: someone edits one of them.
 *
 * The three DELIBERATE differences are parameterized rather than duplicated. Defaults are the
 * dashboard/architecture values; the playtest console overrides them in its own `:root`:
 *   --measure     content width — 1440px for the two dashboards, 1040px for the console's
 *                 single reading column of queue cards. That split is a typographic decision,
 *                 not drift; do not "fix" it into uniformity.
 *   --chrome-gap  space under the sticky bar
 *   --chrome-pad  horizontal padding inside the sticky bar
 *
 * Opt-in like BASE_CSS — montage.mjs takes ROOT_TOKENS only and is unaffected.
 */
export const CHROME_CSS = `  .sticky-bar { position:sticky; top:0; z-index:100; background:rgba(10,10,17,0.94);
               backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
               border-bottom:1px solid var(--edge); padding:10px 0; margin-bottom:var(--chrome-gap, 20px); }
  .sticky-inner { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;
                  max-width:var(--measure, 1440px); margin:0 auto; padding:0 var(--chrome-pad, 8px); }
  .nav-brand { display:flex; align-items:center; gap:8px; font-weight:800; font-size:15px;
               letter-spacing:2px; text-decoration:none; color:var(--text); }
  .nav-brand .neon { color:var(--neon); text-shadow:0 0 12px rgba(255,45,149,0.6); }
  .nav-links { display:flex; gap:16px; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:1px; }
  .nav-links a { color:var(--dim); text-decoration:none; transition:color .15s; }
  .nav-links a:hover { color:var(--cyan); }
  h1 { margin:0; font-size:20px; letter-spacing:3px; font-weight:800; }
  h1 .neon { color:var(--neon); text-shadow:0 0 18px rgba(255,45,149,.55); }
  h1 .cc { color:var(--dim); font-weight:600; letter-spacing:4px; font-size:13px; margin-left:10px; }
  .stamp { color:var(--dim); font-size:12px; margin-top:4px; }`;

/** The single HTML-escaper both generated pages use. @param {unknown} s */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/**
 * The three Command Center surfaces, in fixed order. All three generated pages sit in
 * `.diag-captures/` (dashboard · architecture · playtest-console), so the defaults are
 * correct for them. docs/playtest/console.html is a redirect stub only.
 */
export const CC_SURFACES = [
  { id: "command-center", icon: "🛒", label: "Command Center", href: "dashboard.html" },
  { id: "architecture", icon: "🗺", label: "Architecture", href: "architecture.html" },
  { id: "playtest", icon: "🎮", label: "Playtest Console", href: "playtest-console.html" },
];

/**
 * Render the shared cross-surface switcher. `active` is the current surface's id (rendered as
 * a non-link highlighted button); `hrefs` optionally overrides paths for a page whose relative
 * location differs from `.diag-captures/`.
 * @param {"command-center"|"architecture"|"playtest"} active
 * @param {{ [id: string]: string }} [hrefs]
 * @returns {string}
 */
export function crossNav(active, hrefs = {}) {
  return `<nav class="cc-switch" aria-label="Command Center surfaces">${CC_SURFACES.map((s) => {
    const label = `<span class="sw-ico">${s.icon}</span>${s.label}`;
    return s.id === active
      ? `<a class="active" aria-current="page">${label}</a>`
      : `<a href="${esc(hrefs[s.id] ?? s.href)}">${label}</a>`;
  }).join("")}</nav>`;
}
