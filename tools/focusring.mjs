/**
 * focusring.mjs — mechanical evidence for FIGHT-VERIFY-1 Phase 0.
 *
 * `src/ui/loadingScreen.css:577-584` declared the gamepad focus ring with `!important`, and
 * that sheet is imported globally (`src/ui/loadingScreen.js:6` ← `src/main.js:188`). Author
 * `!important` beats every non-important author declaration regardless of specificity, so the
 * designed Fight Night focus states — notably the yellow dashed ring at
 * `src/cart-rave-menu.css:2398-2409` / `:3423` — never rendered.
 *
 * This boots the real menu and reads the real cascade, before and after the fix:
 *   BEFORE → outline is `rgb(34, 230, 255)` solid + the cyan glow box-shadow  (the bug)
 *   AFTER  → the `--color-yellow` token, `dashed`, and no cyan glow           (the fix)
 *
 * `:focus-visible` is forced via CDP `CSS.forcePseudoState` because `el.focus()` does not
 * reliably match it in Chromium — the heuristic keys on the last input modality.
 * `harness.mjs:291` already opens a CDP session, so this is inside the toolkit's vocabulary.
 *
 * Deliberately has NO `package.json` script: `tools/` is outside `tsconfig.include` and
 * `knip.project`, so an unreferenced file here gates nothing. Phase B's `tools/states.mjs`
 * absorbs this logic permanently — delete this file when B lands; if B is cut, keep it.
 *
 * Usage: node tools/focusring.mjs [--url http://127.0.0.1:3000/] [--selector .cr-btn] [--headed]
 * Exit: 0 = designed ring renders · 1 = it does not · 2 = setup error.
 */

import {
  parseArgs,
  str,
  makeLogger,
  maybeStartDevStack,
  killDevStack,
  preflightStack,
  ensurePlaywright,
  launchClientBrowser,
  makeClient,
  CLIENT_PORT,
} from "./lib/harness.mjs";

const log = makeLogger("focusring");
const args = parseArgs(process.argv.slice(2));
const baseUrl = str(args.url) || `http://127.0.0.1:${CLIENT_PORT}/`;
const SELECTOR = str(args.selector) || ".cr-btn";

/** The four properties the two competing rules actually fight over. */
const readRing = (el) => {
  const cs = getComputedStyle(el);
  return {
    who: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${String(el.className).trim().split(/\s+/).join(".")}`,
    outlineColor: cs.outlineColor,
    outlineStyle: cs.outlineStyle,
    outlineOffset: cs.outlineOffset,
    boxShadow: cs.boxShadow,
  };
};

let dev = null;
let browser = null;
try {
  dev = await maybeStartDevStack(args, log);
  await preflightStack(baseUrl, log);
  const { chromium } = await ensurePlaywright(log);
  browser = await launchClientBrowser(chromium, { headed: args.headed === true });

  // * No `room` param → boots to the menu, which is where the designed ring lives.
  // * The ready gate gets the RULE UNDER TEST into the CSSOM, not merely the markup:
  // * `.cr-btn` is static in index.html and exists at first parse, but loadingScreen.css
  // * rides the JS bundle, so a markup-only gate would read styles that aren't applied yet.
  const { context, page } = await makeClient(browser, {
    baseUrl,
    label: "focusring",
    username: "FocusBot",
    params: { diag: "1" },
    viewport: { width: 1280, height: 800 },
    readyExpr: () =>
      Boolean(document.querySelector(".cr-btn")) &&
      Array.from(document.styleSheets).some((s) => {
        try {
          return Array.from(s.cssRules).some((r) =>
            String(/** @type {any} */ (r).selectorText || "").includes("button.gamepad-focused"),
          );
        } catch {
          return false; // cross-origin sheet
        }
      }),
  });

  await page.waitForSelector(SELECTOR, { state: "visible", timeout: 30_000 });
  const rest = await page.$eval(SELECTOR, readRing);

  const cdp = await context.newCDPSession(page);
  // * DOM.enable FIRST — CSS.enable rejects with "DOM agent needs to be enabled first."
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: 1 });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: SELECTOR });
  if (!nodeId) throw new Error(`DOM.querySelector found no ${SELECTOR} — the menu never rendered`);
  await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["focus-visible"] });

  const forced = await page.$eval(SELECTOR, readRing);

  log(`subject: ${forced.who}  (selector ${SELECTOR}, first match in document order)`);
  log(`rest             outlineColor=${rest.outlineColor} outlineStyle=${rest.outlineStyle} outlineOffset=${rest.outlineOffset} boxShadow=${rest.boxShadow}`);
  log(`:focus-visible   outlineColor=${forced.outlineColor} outlineStyle=${forced.outlineStyle} outlineOffset=${forced.outlineOffset} boxShadow=${forced.boxShadow}`);

  // * --color-cyan is #22e6ff (tokens.css:34) and --color-yellow #ffe53d (:35). The P3 oklch
  // * re-declaration (:246-251) is gated on `@media (color-gamut: p3)`, which headless
  // * Chromium does not match — so these are the sRGB values the harness sees.
  const cyan = forced.outlineColor === "rgb(34, 230, 255)" || /34,\s*230,\s*255/.test(forced.boxShadow);
  const designed = forced.outlineColor === "rgb(255, 229, 61)" && forced.outlineStyle === "dashed";
  log(
    designed && !cyan
      ? "VERDICT PASS — the designed yellow dashed ring renders"
      : `VERDICT FAIL — the unscoped cyan ring is overriding the designed state${cyan ? " (cyan present)" : ""}`,
  );
  process.exitCode = designed && !cyan ? 0 : 1;
} catch (e) {
  log("setup error:", e instanceof Error ? e.message : e);
  process.exitCode = 2;
} finally {
  await browser?.close().catch(() => {});
  killDevStack(dev);
}
