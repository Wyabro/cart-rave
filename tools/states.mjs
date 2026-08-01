#!/usr/bin/env node
/**
 * states.mjs — `npm run states`, the hover / press / focus-visible contact sheet
 * (FIGHT-VERIFY-1 Phase B).
 *
 * ~85 lines of interactive-state CSS across six files had never been driven by anything.
 * `npm run sheet` structurally cannot reach it: a still frame has no pointer, and most of
 * these rules live on the MENU, which the sheet never visits.
 *
 * ── THE INVENTORY IS ENUMERATED, NEVER HAND-WRITTEN ────────────────────────────────────
 * Every rule swept here comes from the live CSSOM at runtime: recurse
 * `document.styleSheets[].cssRules`, descend `CSSMediaRule`/`CSSSupportsRule`, keep every
 * `CSSStyleRule` whose `selectorText` mentions `:hover` / `:active` / `:focus-visible`. That
 * is "prove your subject is present" applied to CSS — a deleted rule becomes a zero-match
 * FAILURE instead of a silent pass, and a newly added rule is swept for free the day it
 * lands. Each rule also reports `Object.keys(rule.style)`, so the properties watched for a
 * delta are the ones the rule itself declares, not a guessed watch list.
 *
 * ── FINGERPRINT THE SUBTREE, NOT `self + ::before` ─────────────────────────────────────
 * `.cr-btn.cr-cmd:hover` / `:focus-visible` / `:active` (`cart-rave-menu.css:3411-3416`) set
 * `transform: skewX(-8deg); box-shadow: none` — BYTE-IDENTICAL to their rest state
 * (`:3362-3376`), deliberately, as a defensive override against `.cr-btn:hover`'s higher
 * specificity (the reasoning is in the comment at `:3406-3410`). The only hover delta on the
 * main menu's primary control is on a DESCENDANT: `.cr-cmd:hover .cr-btn-label { color }`
 * (`:3405`). A self-or-`::before` fingerprint reports a false failure there, so this walks
 * the element, its `::before`/`::after`, every descendant, and each descendant's pseudos.
 *
 * ── HOVER AND PRESS USE REAL POINTER INPUT; ONLY FOCUS IS FORCED ───────────────────────
 * `:hover` is a real `locator.hover()` and `:active` a real `mouse.down()`, because both
 * independently prove the element is HIT-TESTABLE at its centre — an invisible overlay eating
 * pointer events is a live bug class that CDP forcing would mask. `:focus-visible` is the one
 * exception: `el.focus()` does not reliably match it in Chromium (the heuristic keys on last
 * input modality), so it goes through CDP `CSS.forcePseudoState`. `DOM.enable` must be sent
 * BEFORE `CSS.enable` or the CSS agent rejects with "DOM agent needs to be enabled first."
 *
 * The press release happens OFF the element (`mouse.move` away, then `mouse.up`) so no
 * `click` is ever synthesised — otherwise sweeping the menu would press PLAY.
 *
 * ── THIS IS ALSO THE PERMANENT REGRESSION GUARD FOR `e5efbfe` ──────────────────────────
 * That commit removed three `!important` flags from `src/ui/loadingScreen.css` so the
 * designed Fight Night focus rings render at all. `DESIGNED_FOCUS_RING` below encodes the
 * DESIGNED expectation (the yellow token, dashed, no cyan glow) rather than merely "something
 * changed", which is what makes it a guard instead of a smoke test. `tools/focusring.mjs`
 * existed only until this landed and is deleted.
 *
 * EXIT CONTRACT (CheckTally, harness.mjs:529-534): `finish()` exits 1 on ANY `pass:false` and
 * can never exit 3. So surfaces this tool provably cannot reach — the three multiplayer-only
 * selectors, which need a party session — are held in `DECLARED_UNREACHABLE`, excluded from
 * the reachability family entirely, and declared in the montage banner. They get NO check row
 * in either direction: a `pass:false` row would make every clean run exit 1 forever, and a
 * `pass:true` row would be a lie.
 *
 * NO IMAGE GATING, EVER (D-SHEET-1): the crops are for eyeballing whether a delta is
 * VISIBLE, whether a moved slab overlaps its own label, and whether contrast survives. The
 * computed-style assertions are the gate.
 *
 * Usage:
 *   npm run states
 *   npm run states -- --screens menu,customize          # subset
 *   npm run states -- --url http://127.0.0.1:3000/      # attach to a running dev stack
 *   npm run states -- --headed
 */

import { mkdir, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CAPTURE_DIR,
  CLIENT_PORT,
  CheckTally,
  ensurePlaywright,
  holdKey,
  killDevStack,
  launchClientBrowser,
  makeClient,
  makeLogger,
  maybeStartDevStack,
  normalizeArgv,
  parseArgs,
  preflightStack,
  releaseKey,
  sleep,
  str,
  waitForState,
} from "./lib/harness.mjs";
import { STATE_PSEUDOS, parseRuleSelectors } from "./lib/selectors.mjs";
import { esc, montagePage } from "./lib/montage.mjs";

const log = makeLogger("states");

/* ─────────────────────────────── expectations (the gate) ─────────────────────────────── */

/**
 * The floor of properties fingerprinted on every node, unioned with whatever each rule
 * actually declares. Deliberately narrow: every extra property is another chance for an
 * unrelated animation to read as a state delta.
 */
const FLOOR_PROPS = [
  "transform",
  "box-shadow",
  "background-color",
  "background-image",
  "color",
  "opacity",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "outline-style",
  "outline-width",
  "outline-offset",
  "filter",
  "text-shadow",
];

/**
 * Selectors this tool provably cannot reach, with the reason. Excluded from the reachability
 * family ENTIRELY — see the exit contract in the file header. Keyed by `fullBase`.
 *
 * All three need a connected party session with a second client; `?room=solo` never opens
 * one, and the CHECKOUT LINE lobby has never rendered anywhere in this toolkit.
 */
const DECLARED_UNREACHABLE = {
  // ── needs a second client ──────────────────────────────────────────────────────────
  ".cr-friends-copy": { kind: "party", why: "menu Friends lobby — needs a live party room code (two clients)" },
  ".hud-lobby-copy": { kind: "party", why: "in-match lobby room-code chip — multiplayer lobby only" },
  ".cc-btn.hud-lobby-btn": { kind: "party", why: "in-match lobby action button — multiplayer lobby only" },
  "#hud .hud-ready-btn": { kind: "party", why: "lobby ready-up button — never mounts in `?room=solo`" },

  // ── the rule matches nothing because the element does not exist ────────────────────
  // * Each of these is FILED, not hidden. They sit here rather than as failing rows because
  // * `finish()` exits 1 on any `pass:false`: leaving months-old dead CSS red forever would
  // * make `npm run states` a tool everyone learns to skip, and then a genuinely NEW
  // * zero-match — the regression this family exists to catch — would arrive unnoticed in a
  // * sea of expected reds. Every entry is printed on stdout and in the montage banner on
  // * every run, and if one ever starts matching again the run says so out loud.
  ".cr-touch-btn": {
    kind: "dead",
    why: "DEAD CSS — `cr-touch-btn` appears in ZERO .js/.ts/.html files repo-wide; the class "
      + "exists only in cart-rave-menu.css. Filed as STATES-DEAD-1.",
  },
  ".cr-kbm-toast-close": {
    kind: "dead",
    why: "DEAD CSS — `cr-kbm-toast-close` appears in ZERO .js/.ts/.html files repo-wide. "
      + "Filed as STATES-DEAD-1.",
  },
  ".cr-level-btn": {
    kind: "dead",
    why: "the arena radiogroup at index.html:703 carries the `hidden` attribute — its own "
      + "comment calls it a 'hidden radiogroup: arena data source'. The visible arena control "
      + "is the `.cr-arena-page` pager. Filed as STATES-DEAD-1.",
  },
  ".cr-level-btn:not(.cr-level-btn--disabled)": {
    kind: "dead",
    why: "same permanently-`hidden` radiogroup (index.html:703). Filed as STATES-DEAD-1.",
  },
  a: {
    kind: "dead",
    why: "the unscoped fallback ring (loadingScreen.css:577) lists five element types; no "
      + "<a> is ever rendered as UI — the only ones created are transient download links "
      + "(main.js:5604, postFxDebug.js:190/241). Filed as STATES-DEAD-1.",
  },
  select: {
    kind: "dead",
    why: "no <select> exists anywhere in the app. Filed as STATES-DEAD-1.",
  },
  '[role="button"]': {
    kind: "dead",
    why: "no element carries role=\"button\"; the only occurrence is a selector string in "
      + "gamepadNav.js:52. Filed as STATES-DEAD-1.",
  },
};

/**
 * The Phase 0 regression guard, stated as the DESIGNED expectation.
 *
 * `src/cart-rave-menu.css:2398-2409` declares a nine-selector `outline: 2px dashed
 * var(--color-yellow)` ring and `:3423` a tenth for `.cr-cmd`. Until `e5efbfe` none of them
 * rendered: `src/ui/loadingScreen.css:577-584` declared an unscoped
 * `button:focus-visible, a:focus-visible, [role="button"]:focus-visible, …` ring with
 * `!important` on outline/outline-offset/box-shadow, and author `!important` beats every
 * non-important author declaration regardless of specificity or source order. Transforms were
 * untouched (not `!important`), so the slabs still MOVED — which is exactly why a DOM +
 * computed-geometry sign-off passed this for four months.
 *
 * Mirrored here on purpose rather than read from the stylesheet: an assertion that imports its
 * own expected value proves nothing. `--color-yellow` is `#ffe53d` and `--color-cyan`
 * `#22e6ff` (`tokens.css:34-35`); the P3 `oklch` re-declaration at `:246-251` is gated on
 * `@media (color-gamut: p3)`, which headless Chromium does not match, so these are the sRGB
 * strings the harness reads.
 */
const DESIGNED_YELLOW = "rgb(255, 229, 61)";
const CYAN_RE = /34,\s*230,\s*255/;
const DESIGNED_FOCUS_RING = [
  ".cr-btn",
  ".cr-level-btn",
  ".cr-color-chip",
  ".cr-sunglasses-chip",
  ".cr-pattern-chip",
  ".cr-reroll",
  ".cr-friends-copy",
  ".cr-overlay-done",
  ".cr-overlay-back",
  ".cr-cmd",
];

/**
 * Settle window before every fingerprint read.
 *
 * Longer than BOTH tween families in play: the 120ms CSS `var(--ease-slap)` transitions on
 * `.cc-btn` / `.cr-btn` / `#results-overlay .results-btn::before` (already neutralised by the
 * zero-duration tag, belt and braces) AND the anime.js press/hover feedback the menu wires on
 * top of them — `animateButtonPress({ duration: 70, scale: 0.94 })` plus a 130ms release
 * (cart-rave-menu.js:2001-2007). Without this the rest-A / rest-B noise floor catches
 * `.cr-btn-inner`'s transform mid-tween, subtracts it as drift, and the tool reports the main
 * menu's primary controls as having NO press feedback whatsoever. Measured: it did exactly
 * that before this existed.
 */
const SETTLE_MS = 320;

/** Fingerprint walk limits — menu controls are shallow; a runaway subtree is not worth it. */
const MAX_DEPTH = 4;
const MAX_NODES = 120;

/** Podium pin, copied from tools/podium.mjs. See its PIN_TOP comment for why 20 vs 1. */
const PIN_TOP = 20;
const PIN_RUNNER_UP = 1;
const PIN_REMAIN_MS = 800;
const SKIP_GRACE_SLEEP_MS = 600;

/* ─────────────────────────────── page-side functions ─────────────────────────────── */

/**
 * Enumerate every interactive-state rule from the LIVE CSSOM.
 *
 * Provenance comes from `data-vite-dev-id` on the injected `<style>` node: Vite dev serves
 * CSS through JS, so `sheet.href` is null for every one of the game's stylesheets and a
 * failure would otherwise be unattributable to a file.
 */
const enumerateStateRules = () => {
  const RE = /:(hover|active|focus-visible)(?![-\w(])/;
  /** @type {any[]} */
  const out = [];
  let scanned = 0;

  const walk = (rules, src, media) => {
    for (const r of rules) {
      const sel = /** @type {any} */ (r).selectorText;
      if (typeof sel === "string") {
        scanned += 1;
        if (RE.test(sel)) {
          const style = /** @type {any} */ (r).style;
          const props = [];
          for (let i = 0; i < (style?.length ?? 0); i += 1) props.push(style.item(i));
          out.push({
            selectorText: sel,
            props,
            src,
            media: media.slice(),
            cssText: String(/** @type {any} */ (r).cssText ?? "").slice(0, 300),
          });
        }
      }
      // * Descend CSSMediaRule / CSSSupportsRule — and a CSSStyleRule too, since modern
      // * Chrome gives style rules a (usually empty) cssRules list for native nesting. Two
      // * live @media (prefers-reduced-motion) blocks carry state rules; skipping them would
      // * under-report the override that neutralises the base hover transforms.
      const kids = /** @type {any} */ (r).cssRules;
      if (kids && kids.length) {
        const cond = /** @type {any} */ (r).conditionText;
        walk(kids, src, cond ? [...media, cond] : media);
      }
    }
  };

  /** @type {string[]} */
  const foreign = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet — unreadable by design
    }
    if (!rules) continue;
    const node = /** @type {any} */ (sheet).ownerNode;
    const devId = node && node.getAttribute ? node.getAttribute("data-vite-dev-id") : null;
    // * KEEP ONLY THE APP'S OWN STYLESHEETS. Eruda — the mobile dev console, CDN-injected
    // * 4000ms after boot behind an `isLocal` hostname gate (index.html:36-55) — ships a
    // * `.luna-*` component library with its own :hover rules. Removing `#eruda` (which this
    // * tool does) does NOT remove its <style> from document.styleSheets, so without this
    // * filter the sweep enumerates four selectors belonging to a dev tool, fails their
    // * reachability, and the run exits 1 on a clean tree — and WHETHER it does is a race
    // * against that 4s timer, so the same commit passes or fails depending on how long the
    // * menu entrance took. Vite dev stamps every src/**\/*.css sheet with data-vite-dev-id;
    // * a production build serves them as same-origin <link href>. index.html's own inline
    // * <style> carries neither, and contains zero state rules (verified), so nothing of the
    // * app is lost here.
    let sameOrigin = false;
    try {
      sameOrigin = Boolean(sheet.href) && new URL(sheet.href).origin === location.origin;
    } catch {
      sameOrigin = false;
    }
    // * An id means the app injected it deliberately (`#game-touch-styles`, touchControls.js:378
    // * — zero state rules today, but a `:active` added there tomorrow must NOT be silently
    // * dropped from the sweep). Eruda's three sheets carry no id, no dev-id and no href.
    if (!devId && !sameOrigin && !(node && node.id)) {
      const first = rules.length ? String(/** @type {any} */ (rules[0]).cssText ?? "").slice(0, 60) : "(empty)";
      foreign.push(`${node?.tagName ?? "?"}${node?.id ? `#${node.id}` : ""} — ${first}`);
      continue;
    }
    walk(rules, String(devId || sheet.href), []);
  }
  return { rules: out, scanned, sheets: document.styleSheets.length, foreign };
};

/**
 * Locate the first VISIBLE, on-screen match for a selector and describe it.
 *
 * Visibility is computed style + rect, never `offsetParent !== null`: several subjects live
 * inside `position: fixed` overlays, and per CSSOM-View `offsetParent` is null for every
 * fixed element, so an offsetParent probe can never see them.
 */
const findSubject = ({ sel, want, within }) => {
  /** @type {any[]} */
  let els;
  try {
    els = Array.from(document.querySelectorAll(sel));
  } catch (e) {
    return { ok: false, reason: "bad-selector", total: 0, index: -1, candidates: [], message: String(e) };
  }
  const total = els.length;
  // * SCOPE TO THE SCREEN'S OWN CONTAINER. The menu stays rendered underneath every overlay,
  // * so `.cr-btn` has visible matches on the customize screen — they are just buried under a
  // * full-screen panel. Sweeping them there produces two lies at once: `page.hover()` times
  // * out (reported as "not hit-testable", when the truth is "not on this screen"), and the
  // * zero delta that follows reads as a dead state.
  //
  // * `index` STAYS GLOBAL, i.e. the position in `document.querySelectorAll(sel)`. Node side
  // * drives the element with `page.locator(sel).nth(index)`, which counts in whole-document
  // * order and knows nothing about this scope — handing it a scope-relative index silently
  // * hovers a DIFFERENT element (there are five `.cr-overlay-done`, one per overlay screen)
  // * and every reading after that describes the wrong node.
  const scoped = [];
  const box = within ? document.querySelector(within) : null;
  for (let i = 0; i < els.length; i += 1) {
    if (within && !(box && box.contains(els[i]))) continue;
    scoped.push({ el: els[i], globalIndex: i });
  }
  const n = (v) => Math.round(v * 10) / 10;
  const describe = (el, i) => {
    const r = el.getBoundingClientRect();
    return {
      index: i,
      tag: el.tagName.toLowerCase(),
      cls: typeof el.className === "string" ? el.className.trim() : "",
      rect: { top: n(r.top), left: n(r.left), width: n(r.width), height: n(r.height), bottom: n(r.bottom), right: n(r.right) },
      cx: Math.round(r.left + r.width / 2),
      cy: Math.round(r.top + r.height / 2),
    };
  };
  /** @type {any[]} */
  const visible = [];
  for (const { el, globalIndex } of scoped) {
    if (visible.length >= (want ?? 5)) break;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.02) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= window.innerHeight || r.left >= window.innerWidth) continue;
    visible.push(describe(el, globalIndex));
  }
  if (!visible.length) {
    return {
      ok: false,
      reason: total === 0 ? "no-match" : scoped.length === 0 ? "no-match-inside-this-screen" : "no-visible-match",
      total,
      inScope: scoped.length,
      index: -1,
      candidates: [],
    };
  }
  return { ok: true, total, inScope: scoped.length, ...visible[0], candidates: visible };
};

/** Poll until a selector has a visible on-screen match, or the deadline passes. */
const anyVisible = ({ sel }) => {
  try {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.9) continue;
      const r = el.getBoundingClientRect();
      if (r.width >= 2 && r.height >= 2) return true;
    }
  } catch {
    /* an unqueryable selector is simply not visible */
  }
  return false;
};

/**
 * Snapshot the computed style of an element's whole subtree, pseudo-elements included.
 *
 * `content` is read on the pseudos because a `::before` appearing or vanishing is a state
 * delta that no colour/transform property would register.
 */
const fingerprintSubtree = ({ sel, index, props, maxDepth, maxNodes }) => {
  const els = Array.from(document.querySelectorAll(sel));
  const el = /** @type {any} */ (els[index]);
  if (!el) return null;
  /** @type {any[]} */
  const out = [];
  let count = 0;
  const walk = (node, path, depth) => {
    if (count >= maxNodes) return;
    count += 1;
    for (const pe of [null, "::before", "::after"]) {
      const cs = getComputedStyle(node, pe);
      /** @type {Record<string, string>} */
      const v = {};
      for (const p of props) v[p] = cs.getPropertyValue(p);
      if (pe) v.content = cs.getPropertyValue("content");
      // * Which of these values were written INLINE. The menu wires anime.js hover/press
      // * feedback on top of the CSS (`wireMenuPressFeedback`, cart-rave-menu.js:1997-2019 —
      // * `animateButtonPress(target, { scale: 0.94 })` on pointerdown), and anime writes an
      // * inline transform on `.cr-btn-inner`. Without this flag a JS-only reaction and a CSS
      // * one are indistinguishable in the output, and "this control reacts" would be true
      // * while "this CSS rule works" was false.
      out.push({
        path: `${path}${pe ?? ""}`,
        v,
        inline: pe ? [] : props.filter((p) => node.style && node.style.getPropertyValue(p) !== ""),
      });
    }
    if (depth >= maxDepth) return;
    let i = 0;
    for (const c of Array.from(node.children)) {
      const child = /** @type {any} */ (c);
      const cls = typeof child.className === "string" && child.className.trim()
        ? `.${child.className.trim().split(/\s+/).join(".")}`
        : "";
      walk(child, `${path}>${i}:${child.tagName.toLowerCase()}${cls}`, depth + 1);
      i += 1;
    }
  };
  walk(el, "self", 0);
  return out;
};

/**
 * Park every running animation so an idle menu loop cannot masquerade as a state delta.
 * Pausing (rather than zeroing `animation-duration`) leaves the frame looking exactly as the
 * app painted it, which keeps the crops honest.
 */
const pauseAllAnimations = () => {
  let n = 0;
  for (const a of document.getAnimations()) {
    try {
      a.pause();
      n += 1;
    } catch {
      /* a finished/cancelled animation can refuse */
    }
  }
  return n;
};

/**
 * Strip the two things the DEV SERVER puts on screen that production never has — the
 * SwiftShader advisory (fires on every headless cell) and the CDN-injected Eruda console
 * (localhost-gated, `index.html:36-55`, a cog in the corner that looks like a real control).
 * Same removal their own dismiss handlers use. Idempotent.
 */
const clearDevServerChrome = () => {
  document.getElementById("cr-softgl-notice")?.remove();
  document.getElementById("eruda")?.remove();
};

/** Hide the WebGL canvas + CSS2D nametags so attract-render drift never lands in a crop. */
const hideSceneChrome = () => {
  for (const c of Array.from(document.querySelectorAll("canvas"))) {
    const el = /** @type {any} */ (c);
    if (el.classList.contains("results-confetti") || el.classList.contains("results-defeat-wilt")) continue;
    el.style.visibility = "hidden";
  }
  let tag = document.getElementById("cr-states-hide");
  if (!tag) {
    tag = document.createElement("style");
    tag.id = "cr-states-hide";
    tag.textContent = ".cart-nametag { visibility: hidden !important; }";
    document.head.appendChild(tag);
  }
};

/**
 * Kill transition tweens for the assertion pass. A read taken straight after a state change
 * otherwise catches a tween mid-flight — `.cc-btn`, `.cr-btn` and
 * `#results-overlay .results-btn::before` all carry `transition: … 120ms var(--ease-slap)`.
 * Applied for the WHOLE run: zeroing a transition changes when a value arrives, never what it
 * ends up being, so the crops show the same pixels the app settles on.
 */
const zeroTransitions = () => {
  if (document.getElementById("cr-states-notween")) return false;
  const st = document.createElement("style");
  st.id = "cr-states-notween";
  st.textContent = "*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; }";
  document.head.appendChild(st);
  return true;
};

/**
 * Shut a CDP session down cleanly.
 *
 * `CSS.enable` + `DOM.enable` turn on two firehoses — every stylesheet added, every DOM
 * mutation — and Tweakpane plus the app mutate constantly. Those events ride the SAME
 * transport Playwright uses for everything else, so a session left enabled while later
 * clients boot starves them: observed twice, once as a `page.goto` timeout and once as a
 * `waitForFunction` timeout, both on the NEXT context and both with no page error to explain
 * it. Disable the domains, then detach.
 */
async function closeCdp(cdp) {
  if (!cdp) return;
  for (const cmd of ["CSS.disable", "DOM.disable"]) {
    // eslint-disable-next-line no-await-in-loop
    await cdp.send(cmd).catch(() => {});
  }
  await cdp.detach().catch(() => {});
}

/** Read the round phase for the in-match screens. */
const readRound = () => /** @type {any} */ (window).__ccDiag.snapshot("round");

/* ─────────────────────────────── Node-side helpers ─────────────────────────────── */

/**
 * Diff two subtree fingerprints. Returns one entry per changed property per node, plus
 * entries for nodes that appeared or vanished.
 */
function diffFingerprints(a, b) {
  if (!a || !b) return [];
  /** @type {{ path: string, prop: string, from: string, to: string, inline: boolean }[]} */
  const out = [];
  const bmap = new Map(b.map((n) => [n.path, n]));
  const amap = new Map(a.map((n) => [n.path, n]));
  for (const n of a) {
    const other = bmap.get(n.path);
    if (!other) {
      out.push({ path: n.path, prop: "(node)", from: "present", to: "absent", inline: false });
      continue;
    }
    for (const k of Object.keys(n.v)) {
      if (n.v[k] !== other.v[k]) {
        out.push({
          path: n.path,
          prop: k,
          from: n.v[k],
          to: other.v[k],
          // * True ⇒ JS wrote this, not the stylesheet.
          inline: Boolean(other.inline?.includes(k)) && !n.inline?.includes(k),
        });
      }
    }
  }
  for (const n of b) {
    if (!amap.has(n.path)) out.push({ path: n.path, prop: "(node)", from: "absent", to: "present", inline: false });
  }
  return out;
}

/** Poll until `sel` has a fully-opaque, on-screen match. Returns whether it arrived. */
async function waitVisible(page, sel, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    if (await page.evaluate(anyVisible, { sel })) return true;
    if (Date.now() > deadline) return false;
    // eslint-disable-next-line no-await-in-loop
    await sleep(200);
  }
}

/** Poll a page-side predicate until truthy or the deadline passes. Never throws. */
async function waitReady(page, predFn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await page.evaluate(predFn).catch(() => false);
    if (ok) return true;
    if (Date.now() > deadline) return false;
    // eslint-disable-next-line no-await-in-loop
    await sleep(250);
  }
}

/**
 * Filesystem-safe id from a CSS selector. `:`, `(`, `)` and `>` are all legal in a selector
 * and all illegal (or path-significant) in a Windows filename —
 * `.cr-customize-tab:not(.active)` crashed the first run with ENOENT before this existed.
 */
const slug = (s) =>
  String(s)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "sel";

/** `path|prop` keys, for subtracting one diff from another. */
const diffKeys = (d) => new Set(d.map((x) => `${x.path}|${x.prop}`));

/** Human-readable one-liner for a diff, truncated. */
function describeDiff(d, max = 3) {
  if (!d.length) return "NO CHANGE";
  return d
    .slice(0, max)
    .map((x) => `${x.path === "self" ? "self" : x.path}·${x.prop}: ${x.from} → ${x.to}${x.inline ? " [INLINE — written by JS, not the stylesheet]" : ""}`)
    .join(" | ") + (d.length > max ? ` (+${d.length - max} more)` : "");
}

/* ─────────────────────────────── screen definitions ─────────────────────────────── */

/**
 * Where the subjects live. Three client shapes, ten screens.
 *
 * `gate` is the D-SHEET-1 proof that the screen is really up — a green delta row underneath a
 * screen that never opened would be a check that proved nothing.
 */
const MENU_OVERLAYS = [
  { key: "customize", label: "customize overlay", id: "cr-customize-screen", open: "openCustomize" },
  { key: "settings", label: "settings overlay", id: "cr-settings-screen", open: "openSettings" },
  { key: "challenges", label: "challenges overlay", id: "cr-challenges-screen", open: "openChallenges" },
  { key: "howto", label: "how-to overlay", id: "cr-howto-screen", open: "openHowTo" },
];

/** Is a menu overlay open, by id? (`display:flex` is what the menu's own open/close writes.) */
const overlayShown = (id) => {
  const el = document.getElementById(id);
  if (!el) return { present: false, shown: false };
  const cs = getComputedStyle(el);
  return { present: true, shown: cs.display === "flex" && cs.visibility !== "hidden" };
};

/** Pause-overlay / results-overlay gates. */
const overlayShownBySelector = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return { present: false, shown: false, display: null };
  const cs = getComputedStyle(el);
  return {
    present: true,
    shown: cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.01,
    display: cs.display,
  };
};

/* ─────────────────────────────── the sweep ─────────────────────────────── */

/**
 * Drive one subject through rest → hover → active → focus-visible, fingerprinting each and
 * shooting a padded crop.
 *
 * REST IS READ TWICE — once before the cycle and once after — and anything that moved between
 * the two identical reads is subtracted from every state's diff as noise. The menu runs
 * anime.js loops that write inline styles outside the Web Animations API, so
 * `pauseAllAnimations()` alone cannot make the page still; without the noise floor a drifting
 * gradient reads as "press feedback works".
 */
async function sweepSubject(page, cdp, { subject, screen, outDir, tally, cards }) {
  const { queryBase, states, props } = subject;
  const id = `${screen.key}--${slug(subject.queryBase)}`;
  /** @type {Record<string, any>} */
  const card = {
    id,
    screen: screen.key,
    screenLabel: screen.label,
    selector: queryBase,
    fullBase: subject.fullBase,
    declaredOn: subject.declaredOn,
    descendantDelta: subject.descendantDelta,
    src: subject.src,
    states: {},
    shots: {},
  };

  const scope = { sel: queryBase, within: screen.within };
  const found = await page.evaluate(findSubject, scope);
  card.matches = found.total;
  if (!found.ok) {
    card.error = `${found.reason} (${found.total} match(es) in the DOM)`;
    cards.push(card);
    return card;
  }

  const shoot = async (cand, stateKey) => {
    const f = await page.evaluate(findSubject, scope);
    const r = (f.candidates || []).find((c) => c.index === cand.index)?.rect ?? cand.rect;
    const pad = 14; // enough to show a 2px ring at outline-offset 4px, plus a shadow
    const vp = page.viewportSize() || { width: 1280, height: 800 };
    const clip = { x: Math.max(0, Math.round(r.left - pad)), y: Math.max(0, Math.round(r.top - pad)), width: 0, height: 0 };
    clip.width = Math.max(4, Math.min(vp.width - clip.x, Math.round(r.width + pad * 2)));
    clip.height = Math.max(4, Math.min(vp.height - clip.y, Math.round(r.height + pad * 2)));
    const name = `${id}-${stateKey}.png`;
    await page.screenshot({ path: resolve(outDir, name), clip });
    card.shots[stateKey] = name;
  };

  /**
   * One full rest → hover → active → focus cycle against ONE matched element.
   *
   * REST IS READ TWICE and anything that moved between the two identical reads is subtracted
   * from every state's diff as noise: the menu runs anime.js loops that write inline styles
   * OUTSIDE the Web Animations API, so `pauseAllAnimations()` alone cannot make the page
   * still, and without a noise floor a drifting gradient reads as "press feedback works".
   */
  const cycle = async (cand) => {
    const fpArgs = { sel: queryBase, index: cand.index, props, maxDepth: MAX_DEPTH, maxNodes: MAX_NODES };
    /** @type {Record<string, any>} */
    const r = { raw: {}, hoverHitTestable: null, hoverError: null, focusError: null, focusRing: null };

    /** CDP node handle for this candidate; re-resolved per use because the DOM moves. */
    const nodeIdFor = async () => {
      try {
        const { root } = await cdp.send("DOM.getDocument", { depth: 1 });
        const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: queryBase });
        return nodeIds?.[cand.index] ?? null;
      } catch (e) {
        r.focusError = e instanceof Error ? e.message : String(e);
        return null;
      }
    };
    // * CLEAR THE NODE YOU FORCED, not whatever `DOM.querySelectorAll` returns next time.
    // * Re-resolving on the way out is how a forced state gets stranded: the DOM moves during
    // * a live round, the second lookup hands back a different nodeId, the clear lands on the
    // * wrong element and the real one stays pinned in `:active`. The rest-B baseline then
    // * reads the PRESSED values, they enter the drift set, and the `:active` delta is
    // * subtracted to zero — observed on the HUD mute and menu buttons, whose noise floor was
    // * exactly `transform` + `box-shadow`, precisely the two properties `:active` declares.
    let forcedNodeId = null;
    const force = async (pseudos) => {
      if (pseudos.length === 0) {
        if (forcedNodeId == null) return null;
        await cdp.send("CSS.forcePseudoState", { nodeId: forcedNodeId, forcedPseudoClasses: [] }).catch(() => {});
        const cleared = forcedNodeId;
        forcedNodeId = null;
        return cleared;
      }
      const nodeId = await nodeIdFor();
      if (!nodeId) return null;
      await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: pseudos });
      forcedNodeId = nodeId;
      return nodeId;
    };

    await sleep(SETTLE_MS);
    const restA = await page.evaluate(fingerprintSubtree, fpArgs);
    await shoot(cand, "rest");

    // * ON TOUCH SCREENS THE POINTER STATES ARE FORCED, NOT DRIVEN.
    // * Chromium under `hasTouch + isMobile` routes synthetic mouse input through the touch
    // * pipeline, so `mouse.move()` / `mouse.down()` produce neither `:hover` nor `:active` —
    // * measured: the HUD mute and menu buttons read a flat zero delta on touch-match while
    // * the SAME rules measured fine on the desktop match screen, and `locator.hover()` timed
    // * out rather than landing. Forcing costs the hit-testability signal, but that signal is
    // * about mouse targeting: it is already proven on desktop for every subject reachable
    // * there, and for a touch-only control it was never meaningful to begin with.
    const forced = screen.forceStates === true;
    r.forced = forced;

    if (states.includes("hover")) {
      if (forced) {
        await force(["hover"]);
      } else {
        try {
          await page.locator(queryBase).nth(cand.index).hover({ timeout: 3000 });
          r.hoverHitTestable = true;
        } catch (e) {
          // * A real signal, not a tool failure: `locator.hover()` only resolves once the
          // * element actually receives the pointer at its centre. An overlay eating the event
          // * fails HERE — exactly the bug class CDP forcing would have hidden.
          r.hoverHitTestable = false;
          r.hoverError = e instanceof Error ? e.message.split("\n")[0] : String(e);
          await page.mouse.move(cand.cx, cand.cy);
        }
      }
      await sleep(SETTLE_MS);
      r.raw.hover = await page.evaluate(fingerprintSubtree, fpArgs);
      await shoot(cand, "hover");
      if (forced) await force([]);
    }

    const vp = page.viewportSize() || { width: 1280, height: 800 };
    if (states.includes("active")) {
      // * `:active` implies `:hover` under a real press, so the forced form asserts both —
      // * otherwise the two paths would not be measuring the same thing.
      if (forced) {
        await force(["hover", "active"]);
      } else {
        await page.mouse.move(cand.cx, cand.cy);
        await page.mouse.down();
      }
      await sleep(SETTLE_MS);
      r.raw.active = await page.evaluate(fingerprintSubtree, fpArgs);
      await shoot(cand, "active");
      if (forced) {
        await force([]);
      } else {
        // * Release OFF the element. A down+up on the same node synthesises a `click`, and
        // * sweeping the menu would then press PLAY, open overlays and change audio settings.
        await page.mouse.move(vp.width - 2, vp.height - 2);
        await page.mouse.up();
      }
    }
    // * Park the pointer somewhere harmless before the focus read, so a lingering :hover
    // * cannot contaminate the focus-visible fingerprint — then let the release tween finish.
    await page.mouse.move(vp.width - 2, vp.height - 2);
    await sleep(SETTLE_MS);

    if (states.includes("focus-visible")) {
      let nodeId = null;
      try {
        const { root } = await cdp.send("DOM.getDocument", { depth: 1 });
        const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: queryBase });
        nodeId = nodeIds?.[cand.index] ?? null;
      } catch (e) {
        r.focusError = e instanceof Error ? e.message : String(e);
      }
      if (nodeId) {
        await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["focus-visible"] });
        await sleep(SETTLE_MS);
        r.raw["focus-visible"] = await page.evaluate(fingerprintSubtree, fpArgs);
        r.focusRing = await page.evaluate(
          ({ sel, index }) => {
            const el = /** @type {any} */ (Array.from(document.querySelectorAll(sel))[index]);
            if (!el) return null;
            const cs = getComputedStyle(el);
            return {
              outlineColor: cs.outlineColor,
              outlineStyle: cs.outlineStyle,
              outlineWidth: cs.outlineWidth,
              outlineOffset: cs.outlineOffset,
              boxShadow: cs.boxShadow,
            };
          },
          { sel: queryBase, index: cand.index },
        );
        await shoot(cand, "focus-visible");
        await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
      } else if (!r.focusError) {
        r.focusError = "CDP DOM.querySelectorAll returned no node for this selector";
      }
    }

    await sleep(SETTLE_MS);
    const restB = await page.evaluate(fingerprintSubtree, fpArgs);
    // * SUBTRACT DRIFT BY VALUE, NOT BY PROPERTY NAME. Blanking a whole `path|prop` the
    // * moment it moved between the two rest reads is too blunt: `#hud .hud-mute-btn:hover`
    // * declares `transform: translate(-1px,-1px)` (hud.css:860) on an element whose
    // * transform also drifts at rest, so a name-only filter erased a live hover and called
    // * the button dead. A value that matches EITHER rest reading is drift; anything else is
    // * the state doing something neither rest read ever showed.
    const noise = new Map();
    for (const d of diffFingerprints(restA, restB)) {
      const k = `${d.path}|${d.prop}`;
      if (!noise.has(k)) noise.set(k, new Set());
      noise.get(k).add(d.from);
      noise.get(k).add(d.to);
    }
    const isDrift = (x) => noise.get(`${x.path}|${x.prop}`)?.has(x.to) ?? false;
    r.noise = noise.size;
    r.isDrift = isDrift;
    // * Printed with every delta row: a subtracted property is a property this tool has made
    // * itself blind to, so which ones they were has to be visible rather than a bare count.
    r.noiseList = [...noise.keys()].slice(0, 5);
    r.deltas = {};
    for (const s of STATE_PSEUDOS) {
      if (!r.raw[s]) continue;
      const d = diffFingerprints(restA, r.raw[s]).filter((x) => !isDrift(x));
      r.deltas[s] = {
        changes: d.length,
        // * WHERE the delta landed is the point, not just that there was one.
        onSelf: d.filter((x) => x.path === "self").length,
        onSelfPseudo: d.filter((x) => x.path.startsWith("self::")).length,
        onDescendant: d.filter((x) => x.path !== "self" && !x.path.startsWith("self::")).length,
        summary: describeDiff(d),
        full: d.slice(0, 24),
      };
    }
    r.total = Object.values(r.deltas).reduce((n, x) => n + x.changes, 0);
    return r;
  };

  // * TRY EVERY VISIBLE MATCH before declaring a state dead. The first match in document
  // * order is very often the one carrying `.active` / `.is-selected`, and that rule outranks
  // * the hover rule at EQUAL specificity by source order — `.cr-context .cr-diff-btn.active`
  // * (:3550) over `.cr-context .cr-diff-btn:hover` (:3547), `.cr-cmd.is-selected .cr-btn-label`
  // * (:3427) over `.cr-cmd:hover .cr-btn-label` (:3405). So "the first difficulty chip does
  // * not react to hover" is a true reading and a false finding. Retry until every declared
  // * state has been seen alive on SOME instance; a zero that survives all of them is a fact
  // * about the screen, not about one unlucky node.
  const coveredStates = (r) => states.filter((s) => (r.deltas[s]?.changes ?? 0) > 0).length;
  const score = (r) => coveredStates(r) * 100_000 + Math.min(99_999, r.total);
  let best = null;
  let tried = 0;
  let lastIndex = -1;
  for (const cand of found.candidates) {
    tried += 1;
    lastIndex = cand.index;
    // eslint-disable-next-line no-await-in-loop
    const r = await cycle(cand);
    if (!best || score(r) > score(best.r)) best = { cand, r };
    if (coveredStates(r) === states.length) break;
  }
  // * The winning candidate's crops must be the ones on disk — a later, worse retry would
  // * otherwise leave a picture of the wrong element behind a green row.
  if (best && best.cand.index !== lastIndex) await cycle(best.cand);

  const { cand, r } = best;
  card.tag = cand.tag;
  card.cls = cand.cls;
  card.rect = cand.rect;
  card.candidateIndex = cand.index;
  card.candidatesTried = tried;
  card.candidatesVisible = found.candidates.length;
  card.noise = r.noise;
  card.noiseList = r.noiseList;
  card.forced = r.forced;
  card.hoverHitTestable = r.hoverHitTestable;
  card.hoverError = r.hoverError;
  card.focusError = r.focusError;
  card.focusRing = r.focusRing;
  card.states = r.deltas;

  // * `:active` implies `:hover` — the mouse is on the element — so "active differs from rest"
  // * can be satisfied entirely by the hover delta. Recorded separately so a press that adds
  // * NOTHING over hover shows up as such instead of hiding behind a green row.
  if (r.raw.active && r.raw.hover) {
    const extra = diffFingerprints(r.raw.hover, r.raw.active).filter((x) => !r.isDrift(x));
    card.pressAddsOverHover = extra.length;
    card.pressExtraSummary = describeDiff(extra, 2);
  }

  cards.push(card);
  return card;
}

/**
 * Enter a screen, sweep every subject reachable on it, and emit its checks.
 */
async function runScreen(page, cdp, { screen, subjects, outDir, tally, cards, reached }) {
  log(`[screen] ${screen.key} — ${screen.label}`);
  const gate = await screen.enter(page);
  tally.check(
    `screen ${screen.key} · ${screen.gateName}`,
    gate.ok === true,
    gate.detail,
  );
  if (!gate.ok) return;

  await page.evaluate(clearDevServerChrome);
  await page.evaluate(hideSceneChrome);
  await page.evaluate(zeroTransitions);
  const paused = await page.evaluate(pauseAllAnimations);
  log(`[screen] ${screen.key} — paused ${paused} running animation(s)`);

  let swept = 0;
  let shots = 0;
  for (const subject of subjects) {
    // eslint-disable-next-line no-await-in-loop
    const found = await page.evaluate(findSubject, { sel: subject.fullBase, within: screen.within });
    if (!found.ok) continue;
    // eslint-disable-next-line no-await-in-loop
    const card = await sweepSubject(page, cdp, { subject, screen, outDir, tally, cards });
    if (card.error) continue;
    swept += 1;
    shots += Object.keys(card.shots).length;
    reached.set(subject.key, { screen: screen.key, matches: found.total });

    for (const s of subject.states) {
      const r = card.states[s];
      if (!r) {
        tally.check(
          `${subject.slug} · ${s} · delta`,
          false,
          `the ${s} state was never driven — ${card.hoverError || card.focusError || "no reading taken"}`,
        );
        continue;
      }
      const where = r.onDescendant > 0 && r.onSelf === 0 && r.onSelfPseudo === 0 ? "DESCENDANT ONLY" : "self";
      tally.check(
        `${subject.slug} · ${s} · shows a presentation delta`,
        r.changes > 0,
        `${r.changes} changed propert${r.changes === 1 ? "y" : "ies"} on ${screen.key} `
          + `(self ${r.onSelf} / self-pseudo ${r.onSelfPseudo} / descendant ${r.onDescendant} — ${where}) · `
          + `${r.summary}${card.noise ? ` · noise floor ${card.noise} prop(s) subtracted: ${(card.noiseList || []).join(", ")}` : ""} · `
          + `subject <${card.tag} class="${card.cls}"> match ${card.candidateIndex + 1}/${card.matches}, `
          + `${card.candidatesTried} of ${card.candidatesVisible} visible match(es) tried`
          + `${card.forced ? " · state FORCED via CDP (touch client — synthetic mouse input does not produce :hover/:active under mobile emulation)" : ""}`,
      );
    }

    if (subject.states.includes("hover") && screen.forceStates !== true) {
      tally.check(
        `${subject.slug} · hit-testable at its centre`,
        card.hoverHitTestable === true,
        card.hoverHitTestable
          ? `real page.hover() landed at (${card.rect.left + card.rect.width / 2}, ${card.rect.top + card.rect.height / 2})`
          : `page.hover() never resolved — ${card.hoverError}`,
      );
    }

    // * The Phase 0 guard. Only for selectors that DECLARE a designed ring — for everything
    // * else the unscoped cyan fallback (loadingScreen.css:577) is the correct result.
    if (subject.states.includes("focus-visible") && DESIGNED_FOCUS_RING.includes(subject.queryBase)) {
      const f = card.focusRing;
      const ok =
        Boolean(f)
        && f.outlineColor === DESIGNED_YELLOW
        && f.outlineStyle === "dashed"
        && !CYAN_RE.test(f.boxShadow ?? "")
        && !CYAN_RE.test(f.outlineColor ?? "");
      tally.check(
        `${subject.slug} · focus ring is the designed yellow dashed`,
        ok,
        f
          ? `outlineColor=${f.outlineColor} (want ${DESIGNED_YELLOW}) outlineStyle=${f.outlineStyle} `
            + `outlineWidth=${f.outlineWidth} outlineOffset=${f.outlineOffset} boxShadow=${f.boxShadow} · `
            + "regression guard for e5efbfe (the unscoped !important cyan ring in loadingScreen.css:577)"
          : "no computed ring was read",
      );
      card.designedRing = ok;
    }
  }

  tally.check(
    `screen ${screen.key} · crops written`,
    swept > 0 && shots > 0,
    `${swept} subject(s) swept, ${shots} crop(s) → ${outDir}`,
  );

  if (screen.leave) await screen.leave(page);
  return { swept, shots };
}

/* ─────────────────────────────── touch hover-latch survey ─────────────────────────────── */

/**
 * The aggregate touch advisory.
 *
 * There is genuinely no `@media (hover: hover)` guard on ANY interactive-state rule in this
 * repo — zero occurrences of the media feature in `src/**\/*.css`; the only three `hover`
 * capability checks live in JS (`touchControls.js:580`, `rotatePrompt.js:124`,
 * `device.js:36`). So on a coarse-pointer device every one of these hover rules still applies,
 * and a tap latches it until the user taps elsewhere. That is ONE fact about ONE missing media
 * query, so it is reported as ONE row with a count — 30-odd individual failures would drown
 * the tally and teach everyone to skim it.
 */
async function touchHoverSurvey(page, cdp, { subjects, tally, screenKey }) {
  let applies = 0;
  let measured = 0;
  /** @type {string[]} */
  const names = [];
  for (const subject of subjects) {
    // eslint-disable-next-line no-await-in-loop
    const found = await page.evaluate(findSubject, { sel: subject.queryBase });
    if (!found.ok || !subject.states.includes("hover")) continue;
    const fpArgs = {
      sel: subject.queryBase,
      index: found.index,
      props: subject.props,
      maxDepth: MAX_DEPTH,
      maxNodes: MAX_NODES,
    };
    // eslint-disable-next-line no-await-in-loop
    await sleep(SETTLE_MS);
    // eslint-disable-next-line no-await-in-loop
    const rest = await page.evaluate(fingerprintSubtree, fpArgs);

    // * FORCED, not moused. Under `hasTouch + isMobile` Chromium routes synthetic mouse input
    // * through the touch pipeline and `mouse.move()` produces no `:hover` at all — a survey
    // * built on it reported 1/6 when the real answer is far higher, i.e. it understated the
    // * very thing it exists to measure. The question here is a pure CSS one anyway: does the
    // * hover rule still apply on a coarse-pointer device? Forcing asks exactly that.
    let nodeId = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      const { root } = await cdp.send("DOM.getDocument", { depth: 1 });
      // eslint-disable-next-line no-await-in-loop
      const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
        nodeId: root.nodeId,
        selector: subject.queryBase,
      });
      nodeId = nodeIds?.[found.index] ?? null;
    } catch {
      nodeId = null;
    }
    if (!nodeId) continue;
    // eslint-disable-next-line no-await-in-loop
    await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover"] });
    // eslint-disable-next-line no-await-in-loop
    await sleep(SETTLE_MS);
    // eslint-disable-next-line no-await-in-loop
    const hov = await page.evaluate(fingerprintSubtree, fpArgs);
    // eslint-disable-next-line no-await-in-loop
    await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] }).catch(() => {});
    measured += 1;
    if (diffFingerprints(rest, hov).length > 0) {
      applies += 1;
      names.push(subject.slug);
    }
  }
  tally.check(
    `touch · hover-latch survey ran on ${screenKey}`,
    measured > 0,
    `${applies}/${measured} hover rule(s) still repaint on a coarse-pointer / hasTouch client `
      + `(${names.slice(0, 6).join(", ")}${names.length > 6 ? `, +${names.length - 6}` : ""}). `
      + "There is NO `@media (hover: hover)` guard anywhere in src/**/*.css — zero occurrences — "
      + "so on a real touchscreen these latch on tap until the user taps elsewhere. "
      + "ONE advisory, not one failure per selector: it is one missing media query.",
  );
  return { applies, measured, names };
}

/* ─────────────────────────────── montage ─────────────────────────────── */

function montageHtml(cards, meta) {
  const byScreen = new Map();
  for (const c of cards) {
    if (!byScreen.has(c.screen)) byScreen.set(c.screen, []);
    byScreen.get(c.screen).push(c);
  }

  const stateCell = (c, key, label) => {
    const shot = c.shots?.[key];
    const r = c.states?.[key];
    const dead = key !== "rest" && r && r.changes === 0;
    return `<div class="st${dead ? " dead" : ""}">
            <div class="stlabel">${esc(label)}${dead ? " · NO CHANGE" : ""}</div>
            ${shot ? `<a href="${esc(shot)}"><img src="${esc(shot)}" alt="${esc(`${c.id} ${key}`)}" loading="lazy"></a>` : `<div class="nostate">not declared</div>`}
            ${r ? `<div class="stdim">${r.changes} prop${r.changes === 1 ? "" : "s"}${r.onDescendant && !r.onSelf && !r.onSelfPseudo ? " · descendant" : ""}</div>` : ""}
          </div>`;
  };

  const body = [...byScreen.entries()]
    .map(([screenKey, list]) => {
      const rows = list
        .map((c) => {
          const bad = c.error || Object.values(c.states || {}).some((s) => s.changes === 0);
          return `      <div class="card${bad ? " bad" : ""}">
        <div class="cardbody">
          <b>${esc(c.selector)}</b>${c.descendantDelta ? ` <span class="chip warn">delta on ${esc(c.declaredOn)}</span>` : ""}
          ${c.designedRing === true ? '<span class="chip">designed ring ✓</span>' : ""}
          ${c.designedRing === false ? '<span class="chip warn">designed ring ✗</span>' : ""}
          ${c.hoverHitTestable === false ? '<span class="chip warn">not hit-testable</span>' : ""}
          ${c.pressAddsOverHover === 0 ? '<span class="chip warn">press adds nothing over hover</span>' : ""}
          <br><span class="dim">${esc(c.src)} · ${esc(String(c.matches ?? 0))} match(es) · noise floor ${esc(String(c.noise ?? 0))}</span>
          ${c.error ? `<br><span class="err">${esc(c.error)}</span>` : ""}
        </div>
        <div class="states">
          ${stateCell(c, "rest", "rest")}
          ${stateCell(c, "hover", "hover")}
          ${stateCell(c, "active", "active")}
          ${stateCell(c, "focus-visible", "focus-visible")}
        </div>
      </div>`;
        })
        .join("\n");
      return `    <h2>${esc(screenKey)} <span class="dim">— ${esc(list[0]?.screenLabel ?? "")} · ${list.length} subject(s)</span></h2>
    <div class="cards">
${rows}
    </div>`;
    })
    .join("\n");

  const li = (kind) =>
    Object.entries(DECLARED_UNREACHABLE)
      .filter(([, d]) => d.kind === kind)
      .map(([sel, d]) => `<li><code>${esc(sel)}</code> — ${esc(d.why)}</li>`)
      .join("");
  const unreachable = li("party");
  const deadCss = li("dead");

  const page = montagePage({
    title: "interactive states contact sheet",
    stamp: `${esc(meta.when)} · ${cards.length} subject(s) across ${byScreen.size} screen(s) · `
      + `${esc(String(meta.ruleCount))} state rule(s) enumerated from the live CSSOM · `
      + `${esc(String(meta.selectorCount))} state selector(s), ${esc(String(meta.subjectCount))} distinct subjects`,
    banner: `      <b>THE INVENTORY ON THIS PAGE IS ENUMERATED FROM THE LIVE CSSOM, NOT HAND-WRITTEN.</b>
      Every subject below came from walking <code>document.styleSheets</code> at runtime and
      keeping each rule whose selector mentions <code>:hover</code>, <code>:active</code> or
      <code>:focus-visible</code> — <code>@media</code> and <code>@supports</code> blocks
      included. A deleted rule therefore shows up as a zero-match <b>failure</b> rather than a
      silent pass, and a rule added tomorrow is swept the day it lands. The properties watched
      for a delta are the ones each rule declares, unioned with a floor of transform / shadow /
      colour / outline / filter.
      <br><br>
      <b>The delta is measured over the whole SUBTREE.</b>
      <code>.cr-btn.cr-cmd:hover</code>, <code>:focus-visible</code> and <code>:active</code>
      (<code>cart-rave-menu.css:3411-3416</code>) are byte-identical to their rest state on
      purpose — a defensive override against <code>.cr-btn:hover</code>'s higher specificity.
      The main menu's primary control only reacts through a descendant,
      <code>.cr-cmd:hover .cr-btn-label { color }</code> (<code>:3405</code>), so a
      self-or-<code>::before</code> fingerprint would report a false failure on it. Cards whose
      delta lands off the driven node are tagged <span class="chip warn">delta on …</span>.
      <br><br>
      <b>Hover and press are real pointer input; only focus is forced.</b>
      <code>page.hover()</code> and <code>mouse.down()</code> independently prove the element is
      hit-testable at its centre — an invisible overlay eating pointer events is a real bug class
      that CDP forcing would mask. <code>:focus-visible</code> is the sole exception
      (<code>CSS.forcePseudoState</code>), because <code>el.focus()</code> does not reliably match
      it in Chromium. The press is released OFF the element so no <code>click</code> is ever
      synthesised. Transitions are zeroed for the whole run, so these crops show the settled
      look, not a 120ms tween; running animations are paused rather than removed.
      <br><br>
      <b>Regression guard for <code>e5efbfe</code>.</b> That commit dropped three
      <code>!important</code> flags from <code>src/ui/loadingScreen.css:577-584</code>, whose
      unscoped cyan ring had been overriding <i>every</i> designed Fight Night focus state since
      the redesign — transforms were unaffected, so the slabs still moved and a DOM/geometry
      sign-off passed it. The <code>focus ring is the designed yellow dashed</code> rows below
      assert the <i>designed</i> value (<code>${esc(DESIGNED_YELLOW)}</code>, dashed, no cyan
      glow), not merely "something changed". <code>tools/focusring.mjs</code> existed only until
      this landed and has been deleted.
      <br><br>
      <b>UNVERIFIED — the multiplayer-only states.</b> These three need a connected party
      session with a second client, which this tool never opens, so they are excluded from the
      reachability family and carry <b>no check row on this page in either direction</b>:
      <ul>${unreachable}</ul>
      A failing row for a surface the tool cannot reach would make every clean run exit non-zero;
      a passing one would be a lie. Treat them as owed.
      <br><br>
      <b>DEAD CSS — these rules match nothing because their element does not render.</b> Found
      by this tool's reachability family and filed rather than fixed; they are excluded from the
      check rows for the same exit-code reason as above, and every one is re-printed on stdout
      on every run. If any of them ever starts matching again, the run says so out loud.
      <ul>${deadCss}</ul>
      <br>
      Cells run headless with no GPU flags (SwiftShader) and the WebGL canvas is hidden in every
      crop, so what you are looking at is DOM chrome only. <b>Image diffs can never gate this
      tool</b> (D-SHEET-1) — the computed-style assertions are the gate; the crops are here to
      answer what assertions cannot: is the delta actually <i>visible</i>, does a moved slab
      overlap its own label, does contrast survive.`,
    cardsHtml: body,
    footer: "Generated by <code>npm run states</code> (tools/states.mjs) — FIGHT-VERIFY-1 Phase B.",
  });

  // * The 4-up state strip is this tool's own layout; montage.mjs owns the shell only.
  return page.replace(
    "</style>",
    `  h2 { margin:26px 0 10px; font-size:14px; letter-spacing:2px; text-transform:uppercase; color:var(--cyan); }
  .cards { grid-template-columns:repeat(auto-fill, minmax(430px, 1fr)); }
  .card { display:flex; flex-direction:column; }
  .states { display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; padding:0 10px 10px; }
  .st { background:#0d0d14; border:1px solid var(--edge); border-radius:6px; padding:4px; }
  .st.dead { border-color:#7a5326; }
  .st img { width:100%; height:auto; aspect-ratio:auto; object-fit:contain; background:#000; border-radius:3px; }
  .stlabel { font-size:10px; letter-spacing:1px; text-transform:uppercase; color:var(--dim); margin-bottom:3px; }
  .st.dead .stlabel { color:#ffb45c; }
  .stdim { font-size:10px; color:var(--dim); margin-top:3px; }
  .nostate { font-size:10px; color:var(--dim); padding:12px 2px; text-align:center; }
  .banner ul { margin:6px 0 0; padding-left:20px; }
  .banner code { color:var(--cyan); }
</style>`,
  );
}

/* ─────────────────────────────── main ─────────────────────────────── */

/** Turn the enumerated rules into deduped, driveable subjects. */
function buildSubjects(rules, tally) {
  /** @type {Map<string, any>} */
  const byBase = new Map();
  let selectorCount = 0;
  let skippedCount = 0;
  let parseFailures = 0;
  /** @type {string[]} */
  const animationDeclarers = [];

  for (const rule of rules) {
    const { parsed, skipped } = parseRuleSelectors(rule.selectorText);
    skippedCount += skipped.length;
    if (!parsed.length) {
      // * A rule the pre-filter matched but the parser found nothing drivable in. Today that
      // * only happens for `:not(:hover)`-style negations; anything else is a parser gap.
      parseFailures += 1;
      log(`[parse] no drivable state in: ${rule.selectorText}`);
      continue;
    }
    if (rule.props.some((p) => p.startsWith("animation"))) animationDeclarers.push(rule.selectorText);
    for (const p of parsed) {
      selectorCount += 1;
      const key = p.queryBase;
      if (!byBase.has(key)) {
        byBase.set(key, {
          key,
          queryBase: p.queryBase,
          fullBase: p.fullBase,
          declaredOn: p.declaredOn,
          descendantDelta: p.descendantDelta,
          slug: p.queryBase,
          states: [],
          props: new Set(FLOOR_PROPS),
          srcs: new Set(),
          selectors: [],
        });
      }
      const s = byBase.get(key);
      if (!s.states.includes(p.state)) s.states.push(p.state);
      // * A descendant delta on ANY of a base's rules makes the whole subject's fullBase the
      // * deeper one, so reachability asserts the node the declarations actually land on.
      if (p.descendantDelta) {
        s.descendantDelta = true;
        s.fullBase = p.fullBase;
        s.declaredOn = p.declaredOn;
      }
      for (const prop of rule.props) s.props.add(prop);
      s.srcs.add(String(rule.src).replace(/\\/g, "/").split("/src/").pop());
      s.selectors.push(p.selector);
    }
  }

  tally.check(
    "inventory · every enumerated state rule parsed into a drivable subject",
    parseFailures === 0 && byBase.size > 0,
    `${rules.length} rule(s) → ${selectorCount} state selector(s) → ${byBase.size} distinct subject(s); `
      + `${skippedCount} list entr(ies) carried no state pseudo (normal — mixed rules like `
      + `loadingScreen.css's .gamepad-focused twins); ${parseFailures} unparsed`,
  );
  if (animationDeclarers.length) {
    log(`[warn] ${animationDeclarers.length} state rule(s) declare an animation property — the paused-animation floor may hide their delta: ${animationDeclarers.join(" ; ")}`);
  }

  const subjects = [...byBase.values()].map((s) => ({
    ...s,
    props: [...s.props],
    src: [...s.srcs].join(", "),
    states: STATE_PSEUDOS.filter((p) => s.states.includes(p)),
  }));
  return { subjects, selectorCount, skippedCount };
}

async function main() {
  const args = parseArgs(normalizeArgv(process.argv.slice(2)));
  const baseUrl = str(args.url) || `http://127.0.0.1:${CLIENT_PORT}/`;
  const outDir = resolve(str(args.out) || resolve(CAPTURE_DIR, "states"));
  const only = str(args.screens)
    ? new Set(String(str(args.screens)).split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  const tally = new CheckTally("states", log);
  let devProc = null;
  let browser = null;
  /** @type {any[]} */
  const cards = [];
  /** @type {Map<string, any>} */
  const reached = new Map();

  try {
    devProc = await maybeStartDevStack(args, log);
    await preflightStack(baseUrl, log);
  } catch (err) {
    log(err instanceof Error ? err.message : err);
    killDevStack(devProc);
    process.exit(2);
  }

  let meta = { ruleCount: 0, selectorCount: 0, subjectCount: 0 };

  try {
    await mkdir(outDir, { recursive: true });
    const { chromium } = await ensurePlaywright(log);
    /**
     * A FRESH BROWSER PER CLIENT GROUP, not one browser for the whole run.
     *
     * The menu group alone takes ~113 element crops plus several hundred `evaluate` round
     * trips against a single page over about five minutes, and after that the browser process
     * stops answering: every later `page.goto` / `waitForFunction` hit its 60s timeout while
     * the SAME touch client booted fine in isolation, and the same failure reproduced against
     * an independently started dev stack — so it is the browser, not Vite, and not the dev
     * stack's lifetime. Relaunching costs about a second per group and makes each group's
     * result independent of how much work ran before it.
     */
    const newBrowser = async () => {
      await browser?.close().catch(() => {});
      browser = await launchClientBrowser(chromium, { headed: args.headed === true });
      return browser;
    };

    /* ── 1 · desktop menu client: menu + the four overlays ────────────────────────── */
    const menu = await makeClient(await newBrowser(), {
      baseUrl,
      label: "states:menu",
      username: "StateBot",
      // * No `room` param → boots to the menu, where most of these rules live.
      params: { diag: "1" },
      viewport: { width: 1280, height: 800 },
      // * Wait for the SHEETS, not just the markup: `.cr-btn` is static in index.html and
      // * exists at first parse, but loadingScreen.css rides the JS bundle — a markup-only
      // * gate would enumerate an inventory that is missing a whole file.
      readyExpr: () =>
        Boolean(document.querySelector(".cr-btn"))
        && Array.from(document.styleSheets).some((s) => {
          try {
            return Array.from(s.cssRules).some((r) =>
              String(/** @type {any} */ (r).selectorText || "").includes("button.gamepad-focused"),
            );
          } catch {
            return false;
          }
        }),
      log,
    });

    // * THE INVENTORY. Read once, from the menu client, because every stylesheet in the app is
    // * loaded globally — hud.css/results.css/pauseOverlay.css are in the CSSOM on the menu
    // * even though their elements are not in the DOM yet.
    const inv = await menu.page.evaluate(enumerateStateRules);
    log(`[inventory] ${inv.rules.length} state rule(s) in ${inv.sheets} sheet(s) (${inv.scanned} style rules scanned)`);
    for (const f of inv.foreign) log(`[inventory] skipped a non-app stylesheet: ${f}`);
    const { subjects, selectorCount } = buildSubjects(inv.rules, tally);
    meta = { ruleCount: inv.rules.length, selectorCount, subjectCount: subjects.length };
    for (const s of subjects) {
      log(`[inventory]   ${s.queryBase}  [${s.states.join(" ")}]  ${s.src}${s.descendantDelta ? `  → delta on ${s.declaredOn}` : ""}`);
    }

    const menuCdp = await menu.context.newCDPSession(menu.page);
    // * DOM.enable FIRST — CSS.enable rejects with "DOM agent needs to be enabled first."
    await menuCdp.send("DOM.enable");
    await menuCdp.send("CSS.enable");

    /** @type {any[]} */
    const screens = [
      {
        key: "menu",
        label: "main menu",
        // * Every overlay is closed here, so the menu root IS the screen.
        within: "#cr-root",
        gateName: "main menu is up",
        enter: async (page) => {
          await page.evaluate(() => /** @type {any} */ (window).CartRave?.closeActiveOverlay?.());
          // * WAIT OUT THE ENTRANCE, do not just sleep. `.cr-root.cr-menu-enter-pending`
          // * (cart-rave-menu.css:75-80) parks the command rows, plate and context panel at
          // * opacity 0 until `playMenuEntrance()` finishes; sweeping before that silently
          // * SKIPS the main menu's primary controls — .cr-btn, .cr-cmd and .cr-btn.cr-cmd
          // * all read as "no visible match" — and the run still goes green on what is left.
          // * AND wait out `.cr-btn--boot-pending` (cart-rave-menu.css:85-87), which holds the
          // * command rows at `opacity: 0.45; pointer-events: none` until the world is
          // * bootstrapped. Sweeping through that window measures a DISABLED control: every
          // * hover is a no-op because the element cannot receive the pointer at all, so the
          // * primary menu buttons would report dead states with a straight face. On headless
          // * SwiftShader the arena build alone runs ~12s (LOAD-PROGRESS-1), hence 90s.
          await waitReady(
            page,
            () => {
              const root = document.getElementById("cr-root");
              if (!root || root.classList.contains("cr-menu-enter-pending")) return false;
              if (document.querySelectorAll(".cr-btn--boot-pending").length) return false;
              const c = document.querySelector(".cr-commandlist .cr-cmd");
              return Boolean(c) && c.getBoundingClientRect().width > 2;
            },
            90_000,
          );
          const g = await page.evaluate(() => {
            const root = document.getElementById("cr-root");
            const cs = root ? getComputedStyle(root) : null;
            const c = document.querySelector(".cr-commandlist .cr-cmd");
            return {
              shown: Boolean(cs && cs.display !== "none" && cs.visibility !== "hidden"),
              pending: root ? root.classList.contains("cr-menu-enter-pending") : null,
              bootPending: document.querySelectorAll(".cr-btn--boot-pending").length,
              cmds: document.querySelectorAll(".cr-cmd").length,
              btns: document.querySelectorAll(".cr-btn").length,
              cmdOpacity: c ? getComputedStyle(c).opacity : null,
              cmdPointer: c ? getComputedStyle(c).pointerEvents : null,
            };
          });
          return {
            ok: g.shown && g.cmds > 0 && g.pending === false && g.bootPending === 0 && g.cmdPointer !== "none",
            detail: `#cr-root shown=${g.shown} enter-pending=${g.pending} · ${g.cmds} .cr-cmd row(s), `
              + `${g.btns} .cr-btn · ${g.bootPending} still .cr-btn--boot-pending · `
              + `first row opacity=${g.cmdOpacity} pointer-events=${g.cmdPointer}`,
          };
        },
      },
      ...MENU_OVERLAYS.map((o) => ({
        key: o.key,
        label: o.label,
        // * The menu stays rendered UNDER each overlay. Without this scope the sweep would
        // * try to hover buried menu controls, time out, and call them dead.
        within: `#${o.id}`,
        gateName: `${o.label} is open`,
        enter: async (page) => {
          await page.evaluate(() => /** @type {any} */ (window).CartRave?.closeActiveOverlay?.());
          await sleep(250);
          await page.evaluate((fn) => /** @type {any} */ (window).CartRave?.[fn]?.(), o.open);
          // * `animateMenuReveal` fades the panel in from opacity 0; a fixed sleep would
          // * sometimes photograph — and fingerprint — a half-arrived overlay.
          await waitVisible(page, `#${o.id} .cr-screen-actions, #${o.id} button`, 8000);
          const g = await page.evaluate(overlayShown, o.id);
          return { ok: g.shown === true, detail: `#${o.id} present=${g.present} shown=${g.shown} (CartRave.${o.open}())` };
        },
        leave: async (page) => {
          await page.evaluate(() => /** @type {any} */ (window).CartRave?.closeActiveOverlay?.());
          await sleep(250);
        },
      })),
    ];

    // * The customize overlay's other two TABS. `.cr-sunglasses-chip` and `.cr-pattern-chip`
    // * are built by the menu into `#cr-customize-section-sunglasses` / `-pattern`, which the
    // * default `body` tab never shows — so without these the two chip families would report
    // * as zero-match dead CSS when they are simply one tab click away. There is no
    // * `CartRave` API for the tabs, so this clicks the real `[data-tab]` control; that is a
    // * click INSIDE an already-open overlay, with no navigation consequence.
    for (const t of [
      { key: "customize-shades", label: "customize · sunglasses tab", tab: "sunglasses", probe: ".cr-sunglasses-chip" },
      { key: "customize-patterns", label: "customize · patterns tab", tab: "pattern", probe: ".cr-pattern-chip" },
    ]) {
      screens.push({
        key: t.key,
        label: t.label,
        within: "#cr-customize-screen",
        gateName: `${t.label} is showing its chips`,
        enter: async (page) => {
          await page.evaluate(() => /** @type {any} */ (window).CartRave?.closeActiveOverlay?.());
          await sleep(250);
          await page.evaluate(() => /** @type {any} */ (window).CartRave?.openCustomize?.());
          await waitVisible(page, "#cr-customize-screen .cr-customize-tab", 8000);
          const clicked = await page.evaluate((tab) => {
            const el = /** @type {any} */ (
              document.querySelector(`#cr-customize-screen .cr-customize-tab[data-tab="${tab}"]`)
            );
            if (!el) return { found: false, soon: false };
            const soon = el.classList.contains("cr-customize-tab--soon");
            el.click();
            return { found: true, soon };
          }, t.tab);
          await sleep(600);
          const g = await page.evaluate((probe) => ({
            chips: document.querySelectorAll(probe).length,
            selected:
              document.querySelector("#cr-customize-screen .cr-customize-tab.active")?.getAttribute("data-tab") ?? null,
          }), t.probe);
          return {
            ok: clicked.found === true && g.chips > 0,
            detail: `tab [data-tab="${t.tab}"] found=${clicked.found} coming-soon=${clicked.soon} · `
              + `active tab now "${g.selected}" · ${g.chips} ${t.probe}`,
          };
        },
        leave: async (page) => {
          await page.evaluate(() => /** @type {any} */ (window).CartRave?.closeActiveOverlay?.());
          await sleep(250);
        },
      });
    }

    for (const screen of screens) {
      if (only && !only.has(screen.key)) continue;
      // eslint-disable-next-line no-await-in-loop
      await runScreen(menu.page, menuCdp, { screen, subjects, outDir, tally, cards, reached });
    }

    await closeCdp(menuCdp);
    // * CLOSE EACH CLIENT BEFORE OPENING THE NEXT. Every context here runs a live Three.js
    // * scene on SwiftShader; holding the menu open while a second, third and fourth booted
    // * starved the new ones badly enough that `.cr-btn` — static markup in index.html,
    // * present at first parse — had still not appeared after 60s, and the run died on a
    // * `waitForFunction` timeout with no page error to explain it.
    await menu.context.close().catch(() => {});

    /* ── 2 · touch menu client: the hover-latch survey ─────────────────────────────── */
    if (!only || only.has("touch-menu")) {
      const t = await makeClient(await newBrowser(), {
        baseUrl,
        label: "states:touch-menu",
        username: "StateBot",
        params: { diag: "1" },
        viewport: { width: 390, height: 844 },
        // * BOTH flags. isTouchLikeDevice() (device.js:22) needs a touch point AND
        // * `(pointer: coarse)`, and only mobile emulation makes the pointer coarse.
        hasTouch: true,
        isMobile: true,
        readyExpr: () => Boolean(document.querySelector(".cr-btn")),
        log,
      });
      const tCdp = await t.context.newCDPSession(t.page);
      // * DOM.enable FIRST — CSS.enable rejects with "DOM agent needs to be enabled first."
      await tCdp.send("DOM.enable");
      await tCdp.send("CSS.enable");
      try {
        await t.page.evaluate(clearDevServerChrome);
        await t.page.evaluate(hideSceneChrome);
        await t.page.evaluate(zeroTransitions);
        await t.page.evaluate(pauseAllAnimations);
        const g = await t.page.evaluate(() => document.querySelectorAll(".cr-cmd").length);
        tally.check(
          "screen touch-menu · main menu is up under hasTouch + isMobile",
          g > 0,
          `${g} .cr-cmd row(s) at 390×844 with a coarse pointer`,
        );
        await touchHoverSurvey(t.page, tCdp, { subjects, tally, screenKey: "touch-menu (390×844)" });
      } finally {
        await closeCdp(tCdp);
        await t.context.close().catch(() => {});
      }
    }

    /* ── 3 · in-match client: HUD, pause overlay, results podium ──────────────────── */
    if (!only || ["match", "pause", "podium"].some((k) => only.has(k))) {
      const m = await makeClient(await newBrowser(), {
        baseUrl,
        label: "states:match",
        username: "StateBot",
        // * The sheet's exact flags. harness=1 is REQUIRED — installVisualHarness only runs
        // * behind a debug flag and without it __cartRave.settle is undefined.
        params: { room: "solo", diag: "1", perfPump: "1", harness: "1" },
        storage: { cartRaveLevel: "classicRecord" },
        viewport: { width: 1280, height: 800 },
        log,
      });
      const matchCdp = await m.context.newCDPSession(m.page);
      await matchCdp.send("DOM.enable");
      await matchCdp.send("CSS.enable");
      try {
        await waitForState(m.page, (s) => s?.phase === "running", {
          read: readRound,
          timeout: 90_000,
          label: "states:match",
        });

        /** @type {any[]} */
        const matchScreens = [
          {
            key: "match",
            label: "in-match HUD",
            gateName: "round is running with the HUD up",
            enter: async (page) => {
              await page.evaluate(clearDevServerChrome);
              const s = await page.evaluate(readRound);
              const g = await page.evaluate(overlayShownBySelector, "#hud");
              return {
                ok: s?.phase === "running" && g.shown === true,
                detail: `phase=${s?.phase} remainingMs=${s?.remainingMs} · #hud shown=${g.shown} display=${g.display}`,
              };
            },
          },
          {
            key: "pause",
            label: "pause overlay",
            within: "#esc-overlay",
            gateName: "pause overlay is open",
            enter: async (page) => {
              await holdKey(page, "Escape");
              await releaseKey(page, "Escape");
              await sleep(700);
              const g = await page.evaluate(overlayShownBySelector, "#esc-overlay");
              const btns = await page.evaluate(() => document.querySelectorAll("#esc-overlay .esc-btn").length);
              return {
                ok: g.shown === true && btns > 0,
                detail: `#esc-overlay present=${g.present} shown=${g.shown} display=${g.display} · ${btns} .esc-btn`,
              };
            },
            leave: async (page) => {
              await holdKey(page, "Escape");
              await releaseKey(page, "Escape");
              await sleep(500);
            },
          },
          {
            key: "podium",
            label: "results podium",
            within: "#results-overlay",
            gateName: "results overlay is up after a decided round",
            enter: async (page) => {
              // * Same recipe as tools/podium.mjs: pin a decided scoreline 800ms from expiry
              // * and let the real timer-expiry path end the round. No tie at the top (a tie
              // * enters Sudden Death and the phase stays `running`), top score > 0
              // * (pickTimerWinner returns "draw" at 0 and neither outcome class applies).
              const running = await page.evaluate(readRound);
              const localSlot = Number(running?.localSlotIndex);
              if (!Number.isInteger(localSlot) || localSlot < 0 || localSlot > 3) {
                return { ok: false, detail: `local player is unseated (localSlotIndex=${running?.localSlotIndex})` };
              }
              const scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
              scores[localSlot] = PIN_TOP;
              scores[[0, 1, 2, 3].filter((s) => s !== localSlot)[0]] = PIN_RUNNER_UP;
              const pin = await page.evaluate(
                ({ s, remainMs }) => {
                  const c = /** @type {any} */ (window).__ccDiag?.control;
                  const a = c?.setScores?.(s);
                  if (!a?.ok) return { ok: false, message: a?.message ?? "setScores unavailable" };
                  const b = c?.rewindRoundClock?.(remainMs);
                  if (!b?.ok) return { ok: false, message: b?.message ?? "rewindRoundClock unavailable" };
                  return { ok: true, message: `${a.message} ${b.message}` };
                },
                { s: scores, remainMs: PIN_REMAIN_MS },
              );
              if (!pin.ok) return { ok: false, detail: `score pin refused — ${pin.message}` };

              await waitForState(
                page,
                (s) => {
                  if (s?.isSuddenDeath) throw new Error("entered Sudden Death — the score pin tied the top");
                  return s?.phase === "podium";
                },
                { read: readRound, timeout: 15_000, label: "states:podium" },
              );
              // * PODIUM_SKIP_GRACE_MS is 450 (main.js:595-599): a skip dispatched at the
              // * instant of the phase flip is silently discarded and NOTHING re-arms, so the
              // * tool would sit through the whole 3000ms cam believing its skip worked.
              await sleep(SKIP_GRACE_SLEEP_MS);
              const deadline = Date.now() + 6000;
              let g = await page.evaluate(overlayShownBySelector, "#results-overlay");
              while (!g.shown && Date.now() < deadline) {
                // eslint-disable-next-line no-await-in-loop
                await holdKey(page, "Space");
                // eslint-disable-next-line no-await-in-loop
                await releaseKey(page, "Space");
                // eslint-disable-next-line no-await-in-loop
                await sleep(120);
                // eslint-disable-next-line no-await-in-loop
                g = await page.evaluate(overlayShownBySelector, "#results-overlay");
              }
              // * Gate the entrance on OPACITY (animateResultsPodiumShow zeroes the buttons
              // * then fades them in); a crop taken mid-fade is a picture of nothing.
              const entrance = Date.now() + 4000;
              for (;;) {
                // eslint-disable-next-line no-await-in-loop
                const o = await page.evaluate(() => {
                  const btn = document.querySelector("#results-overlay .results-actions .cc-btn--primary");
                  return btn ? getComputedStyle(btn).opacity : null;
                });
                if (o === "1" || Date.now() > entrance) break;
                // eslint-disable-next-line no-await-in-loop
                await sleep(120);
              }
              const btns = await page.evaluate(() => document.querySelectorAll("#results-overlay .results-btn").length);
              return {
                ok: g.shown === true && btns > 0,
                detail: `#results-overlay shown=${g.shown} display=${g.display} · ${btns} .results-btn · `
                  + `pin ${PIN_TOP} vs ${PIN_RUNNER_UP} at ${PIN_REMAIN_MS}ms, winner cam skipped`,
              };
            },
          },
        ];

        for (const screen of matchScreens) {
          if (only && !only.has(screen.key)) continue;
          // eslint-disable-next-line no-await-in-loop
          await runScreen(m.page, matchCdp, { screen, subjects, outDir, tally, cards, reached });
        }
      } finally {
        await closeCdp(matchCdp);
        await m.context.close().catch(() => {});
      }
    }

    /* ── 4 · touch in-match client: the on-screen touch controls ──────────────────── */
    if (!only || only.has("touch-match")) {
      const tm = await makeClient(await newBrowser(), {
        baseUrl,
        label: "states:touch-match",
        username: "StateBot",
        params: { room: "solo", diag: "1", perfPump: "1", harness: "1" },
        storage: { cartRaveLevel: "classicRecord" },
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        log,
      });
      const tmCdp = await tm.context.newCDPSession(tm.page);
      await tmCdp.send("DOM.enable");
      await tmCdp.send("CSS.enable");
      try {
        await waitForState(tm.page, (s) => s?.phase === "running", {
          read: readRound,
          timeout: 90_000,
          label: "states:touch-match",
        });
        const screen = {
          key: "touch-match",
          label: "in-match touch controls (390×844, coarse pointer)",
          forceStates: true,
          gateName: "touch controls are mounted in a running round",
          enter: async (page) => {
            await page.evaluate(clearDevServerChrome);
            const s = await page.evaluate(readRound);
            // * NOT gated on `.cr-touch-btn` — that class renders nowhere (see
            // * DECLARED_UNREACHABLE). `#hud.hud-touch` is the real proof the app took its
            // * touch branch: isTouchLikeDevice() needs a touch point AND (pointer: coarse).
            const g = await page.evaluate(() => ({
              hudTouch: document.getElementById("hud")?.classList.contains("hud-touch") ?? false,
              joystick: document.querySelectorAll("#game-touch-controls, .gtc-joy, .gtc-btn").length,
              hudBtns: document.querySelectorAll("#hud button").length,
            }));
            return {
              ok: s?.phase === "running" && g.hudTouch === true && g.hudBtns > 0,
              detail: `phase=${s?.phase} · #hud.hud-touch=${g.hudTouch} · ${g.hudBtns} button(s) in #hud `
                + `· ${g.joystick} touch-control node(s)`,
            };
          },
        };
        await runScreen(tm.page, tmCdp, { screen, subjects, outDir, tally, cards, reached });
      } finally {
        await closeCdp(tmCdp);
        await tm.context.close().catch(() => {});
      }
    }

    /* ── 5 · reachability (family 2) ──────────────────────────────────────────────── */
    if (!only) {
      for (const s of subjects) {
        const dec = DECLARED_UNREACHABLE[s.fullBase] ?? DECLARED_UNREACHABLE[s.queryBase];
        if (dec) {
          const hit = reached.get(s.key);
          log(
            `[${dec.kind === "dead" ? "dead-css" : "unreachable"}] ${s.queryBase} — ${dec.why}`
              + (hit ? ` — BUT IT WAS REACHED on ${hit.screen}; the declaration is now stale` : ""),
          );
          continue;
        }
        const hit = reached.get(s.key);
        tally.check(
          `${s.slug} · rule matches a live element on some visited screen`,
          Boolean(hit),
          hit
            ? `${hit.matches} match(es) on ${hit.screen} · declared in ${s.src} · states [${s.states.join(" ")}]`
            : `ZERO matches on any of the ${cards.length ? new Set(cards.map((c) => c.screen)).size : 0} visited screens — `
              + `dead CSS, or a screen this tool does not open. Declared in ${s.src} `
              + `(${s.selectors.slice(0, 2).join(", ")})`,
        );
      }
    }

    const indexPath = resolve(outDir, "index.html");
    await writeFile(indexPath, montageHtml(cards, { when: new Date().toISOString(), ...meta }), "utf8");
    log(`montage → ${indexPath}`);

    const wrote = await stat(indexPath).then((s) => s.size > 0).catch(() => false);
    tally.check("montage written", wrote, indexPath);
  } catch (err) {
    tally.markError();
    log("run error:", err instanceof Error ? err.stack : err);
  } finally {
    await browser?.close().catch(() => {});
    killDevStack(devProc);
  }

  tally.finish(str(args.tallyOut));
}

main().catch((err) => {
  console.error("[states] fatal:", err instanceof Error ? err.stack : err);
  process.exit(2);
});
