// gameplayTunePane.js — dev-only Tweakpane folder for live GAMEPLAY FEEL tuning (tree-shaken in prod).
//
// * The graphics/cart-rig panes tune how the game LOOKS. This one tunes how it FEELS:
// * the handling / boost / ram / edge constants Wyatt re-tunes every playtest. Every row
// * binds straight to a live `CONFIG.*` path — the physics step re-reads CONFIG each frame
// * (see simulation.js), so a slider drag is felt on the very next frame with no rebuild.
// *
// * Round-trip: "Copy changed values → clipboard" emits a diff (path · old → new) so a
// * good session's numbers paste straight back into src/config.js. This is the whole point
// * (per the Vibejam post-mortem): don't spend a prompt on a number you can dial yourself.
//
// Gated behind ?tune (or the existing ?debug); toggle with H like the rest of the panel.
//
// * Two caveats when reading a tuned value back:
// *   1. Directives (src/directives/directiveEngine.js) multiply some of these same paths
// *      (ramBoost cooldown / charge / boostedMaxSpeed) IN PLACE for a window, then restore.
// *      Sliders don't auto-refresh, so during an active directive the pane shows your tune
// *      while CONFIG holds the multiplied value — export/reset while a directive is live and
// *      you may capture or fight the transient. Tune between directives (or in solo) for clean reads.
// *   2. Multiplayer: on a non-host client these only affect LOCAL prediction and get
// *      reconciled against the host → desync. This is a solo / host feel-tuning tool.

import { CONFIG } from "./config.js";

/**
 * A single tunable row: a live CONFIG path plus its slider range.
 * @typedef {[path: string, label: string, min: number, max: number, step: number]} TuneRow
 */

/**
 * Grouped tuning spec. `path` is dot-notation relative to CONFIG. Ranges bracket the
 * shipping default (~0.3×–2.5×) so a drag stays in a playable neighborhood.
 * @type {ReadonlyArray<{ title: string, expanded?: boolean, rows: ReadonlyArray<TuneRow> }>}
 */
const GROUPS = [
  {
    title: "🏎 Driving feel",
    expanded: true,
    rows: [
      ["driving.maxSpeed", "Top speed (m/s)", 12, 40, 0.5],
      ["driving.accel", "Accel (m/s²)", 40, 320, 5],
      ["driving.reverseMaxSpeed", "Reverse cap (m/s)", 0, 20, 0.5],
      ["driving.tankYawRate", "In-place turn (rad/s)", 1, 12, 0.1],
      ["driving.yawResponsiveness", "Turn snappiness", 4, 50, 1],
      ["driving.lateralGrip", "Lateral grip", 4, 45, 0.5],
      ["driving.driftGripFactor", "Drift grip ×", 0, 1, 0.01],
      ["driving.extraYawDamping", "Straight-line damping", 0, 30, 0.5],
    ],
  },
  {
    title: "🚀 Boost & nitro",
    rows: [
      ["cart.ramBoost.durationSec", "Nitro duration (s)", 0.5, 4, 0.05],
      ["cart.ramBoost.cooldownSec", "Nitro cooldown (s)", 0.5, 8, 0.1],
      ["cart.ramBoost.boostedMaxSpeed", "Boosted top speed", 15, 45, 0.5],
      ["cart.ramBoost.boostedAccel", "Boosted accel", 80, 400, 5],
      ["cart.ramBoost.launchAccelMul", "Launch accel ×", 1, 3, 0.02],
      ["cart.ramBoost.boostCharge.boostChargeTimeMs", "Charge time (ms)", 200, 4000, 50],
      ["cart.ramBoost.boostCharge.burstImpulse", "Release burst (N·s)", 0, 80, 1],
      ["cart.ramBoost.boostCharge.boostMaxMultiplier", "Full-charge burst ×", 0.3, 3, 0.05],
      ["cart.ramBoost.boostCharge.boostCooldownMs", "Post-burst lockout (ms)", 0, 4000, 50],
    ],
  },
  {
    title: "💥 Ramming / KO",
    rows: [
      ["ramming.strength", "Ram impulse ×", 0.5, 8, 0.02],
      ["ramming.maxImpulse", "Ram impulse clamp", 40, 500, 5],
      ["ramming.minSpeed", "Min speed to score (m/s)", 0, 4, 0.05],
      ["ramming.alignmentDotMin", "Aim cone (dot, lower=wider)", -0.2, 0.8, 0.01],
      ["ramming.boostImpulseMultiplier", "Nitro ram ×", 1, 5, 0.05],
      ["ramming.spreadSteps", "Impulse spread (frames)", 1, 8, 1],
    ],
  },
  {
    title: "🛒 Cargo & spill",
    rows: [
      ["cargo.gripFullFactor", "Full-cart grip ×", 0.4, 1, 0.01],
      ["cargo.spillBoost.durationMs", "Spill boost window (ms)", 0, 6000, 100],
      ["cargo.spillBoost.speedMul", "Spill speed ×", 1, 1.6, 0.01],
      ["cargo.spillBoost.accelMul", "Spill accel ×", 1, 2.5, 0.05],
    ],
  },
  {
    title: "🕳 Edge assist & falls",
    rows: [
      ["record.holeAssist.lowFriction", "Lip friction", 0, 1, 0.01],
      ["record.holeAssist.approachDownAccel", "Lip down-nudge (m/s²)", 0, 20, 0.5],
      ["record.holeAssist.fallThroughAccel", "Commit pull (m/s²)", 0, 40, 1],
      ["record.holeAssist.unstickAccel", "Chamfer unstick (m/s²)", 0, 80, 1],
      ["fall.respawnDelayMs", "Respawn delay (ms)", 0, 3000, 50],
    ],
  },
];

/**
 * Resolves a dot-path against a root object to the `{ obj, key }` that owns the leaf.
 * @param {Record<string, any>} root
 * @param {string} path
 * @returns {{ obj: Record<string, any>, key: string } | null}
 */
function resolvePath(root, path) {
  const parts = path.split(".");
  const key = /** @type {string} */ (parts.pop());
  let obj = root;
  for (const p of parts) {
    if (obj == null || typeof obj !== "object") return null;
    obj = obj[p];
  }
  if (obj == null || typeof obj !== "object" || !(key in obj)) return null;
  return { obj, key };
}

/** Rounds for display without trailing float dust. */
function fmt(n) {
  return typeof n === "number" ? Math.round(n * 1000) / 1000 : n;
}

/**
 * Wires the "🎮 Gameplay feel" folder tree into the given Tweakpane pane.
 * Bindings mutate CONFIG in place; the sim reads CONFIG live so changes are instant.
 *
 * @param {import("tweakpane").Pane} pane
 * @returns {import("tweakpane").FolderApi} the root gameplay folder (so callers can focus it)
 */
export function wireGameplayTunePane(pane) {
  // * Snapshot the shipping defaults NOW (page-load CONFIG == config.js literals) so
  // * "reset" and the export diff both have a stable baseline to compare against.
  /** @type {Map<string, number>} */
  const defaults = new Map();
  /** @type {Array<{ path: string, ref: { obj: Record<string, any>, key: string } }>} */
  const bound = [];

  const folder = pane.addFolder({ title: "🎮 Gameplay feel", expanded: true });

  folder.addButton({ title: "What is this? → console" }).on("click", () => {
    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        "=== Gameplay feel tuning ===",
        "Every slider mutates a live CONFIG.* value — the physics step re-reads CONFIG",
        "each frame, so changes are felt immediately (no rebuild, no respawn).",
        "",
        "Drive a round while dragging. When it feels right, hit",
        "  📋 Copy changed values → clipboard",
        "and paste the diff back into src/config.js.",
        "",
        "↩ Reset buttons restore the shipping defaults captured at page load.",
        "Panel toggle: H key.  (Open with ?tune or ?debug.)",
        "",
      ].join("\n"),
    );
  });

  for (const group of GROUPS) {
    const sub = folder.addFolder({ title: group.title, expanded: group.expanded ?? false });
    for (const [path, label, min, max, step] of group.rows) {
      const ref = resolvePath(CONFIG, path);
      if (!ref) {
        // * A path drifted out of config.js — surface it instead of silently dropping the row.
        // eslint-disable-next-line no-console
        console.warn(`[gameplay tune] CONFIG path not found, skipping: ${path}`);
        continue;
      }
      defaults.set(path, ref.obj[ref.key]);
      bound.push({ path, ref });
      sub.addBinding(ref.obj, ref.key, { min, max, step, label });
    }
    sub.addButton({ title: "↩ Reset section" }).on("click", () => {
      for (const [path, , , , ] of group.rows) {
        const ref = resolvePath(CONFIG, path);
        if (ref && defaults.has(path)) ref.obj[ref.key] = defaults.get(path);
      }
      pane.refresh();
    });
  }

  // — Diff / export —
  // * Filter on the DISPLAY-rounded value, not raw: Tweakpane step-quantization can land a
  // * hand-dragged return-to-default at e.g. 2.8800000000000003, which would otherwise export
  // * a confusing no-op "ramming.strength 2.88 → 2.88" line. Reset buttons write the exact
  // * literal so they never trip this; only a hand-return does.
  /** @returns {Array<{ path: string, from: number, to: number }>} */
  const collectChanges = () =>
    bound
      .map(({ path, ref }) => ({ path, from: defaults.get(path), to: ref.obj[ref.key] }))
      .filter((c) => fmt(c.from) !== fmt(c.to));

  folder.addButton({ title: "📋 Copy changed values → clipboard" }).on("click", () => {
    const changes = collectChanges();
    if (changes.length === 0) {
      // eslint-disable-next-line no-console
      console.log("[gameplay tune] no changes vs shipping defaults.");
      return;
    }
    const pad = Math.max(...changes.map((c) => c.path.length));
    const lines = changes.map(
      (c) => `${c.path.padEnd(pad)}  ${fmt(c.from)} → ${fmt(c.to)}`,
    );
    const text = [
      `// Cart Clash gameplay tune — ${changes.length} changed value(s)`,
      "// Paste target: src/config.js (search each path's leaf key).",
      ...lines,
      "",
    ].join("\n");
    // eslint-disable-next-line no-console
    console.log(text);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        // eslint-disable-next-line no-console
        () => console.log(`[gameplay tune] copied ${changes.length} change(s) to clipboard.`),
        // eslint-disable-next-line no-console
        (err) => console.warn("[gameplay tune] clipboard write failed (logged above):", err),
      );
    }
  });

  folder.addButton({ title: "↩ Reset ALL gameplay tuning" }).on("click", () => {
    for (const { path, ref } of bound) {
      if (defaults.has(path)) ref.obj[ref.key] = defaults.get(path);
    }
    pane.refresh();
    // eslint-disable-next-line no-console
    console.log("[gameplay tune] all gameplay values reset to shipping defaults.");
  });

  return folder;
}
