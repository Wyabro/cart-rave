/**
 * ccStyle.mjs — the Command Center's shared visual layer.
 *
 * The dashboard (tools/dashboard.mjs) and the architecture page (tools/lib/archHtml.mjs) are two
 * generated HTML surfaces that MUST look like one product. Their design tokens and base component
 * classes live here once so the two pages cannot drift apart. Each page adds its own page-specific
 * CSS after these shared blocks.
 *
 *   - ROOT_TOKENS — the `:root { … }` custom-property block (colors + surfaces).
 *   - BASE_CSS    — reset + body backdrop + the 2px top-gradient rule + the shared primitives
 *                   (.shell, .chip(+variants), .k, .panel, details.ref, tables, .pill, .links, #stale).
 *   - esc()       — the single HTML-escaper both renderers use for every interpolated string.
 */

/** The design tokens with boosted contrast for high readability. */
export const ROOT_TOKENS = `  :root { --bg:#0a0a11; --panel:#13131c; --panel2:#191926; --edge:#252538; --edge2:#383854;
          --text:#f0eff8; --dim:#a4a4c4; --neon:#ff2d95; --cyan:#27e0e6; --violet:#7c5cff;
          --good:#3ddc84; --bad:#ff5d5d; --warn:#ffc24b; }`;

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
  .links a { background:var(--panel2); border:1px solid var(--edge); border-radius:6px; padding:5px 12px; font-size:13px; }`;

/** The single HTML-escaper both generated pages use. @param {unknown} s */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
