import "./styles/tokens.css";
import "./styles/results.css";

import {
  animateButtonPress,
  animateButtonRelease,
  animateMenuCardEnter,
  animateMenuDismiss,
  animateMenuReveal,
  cancelAnimationsIn,
  countUpNumber,
  createTimeline,
  fadeIn,
  stagger,
} from "../animations.js";

/** @type {number} */
let resultsEntranceToken = 0;

/** @type {WeakSet<Element>} */
const resultsPressWired = new WeakSet();

/**
 * @param {HTMLElement} btn
 */
function wireResultsButtonFeedback(btn) {
  if (!btn || resultsPressWired.has(btn)) return;
  resultsPressWired.add(btn);

  let pressed = false;

  const onPress = (e) => {
    if (btn.disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pressed = true;
    animateButtonPress(btn, { duration: 70, scale: 0.96 });
  };

  const onRelease = () => {
    if (!pressed) return;
    pressed = false;
    animateButtonRelease(btn, { duration: 130 });
  };

  btn.addEventListener("pointerdown", onPress);
  btn.addEventListener("pointerup", onRelease);
  btn.addEventListener("pointercancel", onRelease);
  btn.addEventListener("pointerleave", (e) => {
    if (pressed && e.pointerType === "mouse") onRelease();
  });
}

/** @type {number | null} rAF handle of the active confetti burst (one at a time). */
let confettiRafId = null;
/** @type {HTMLCanvasElement | null} */
let confettiCanvas = null;

/**
 * Parse CSS color (#rgb / #rrggbb / rgb()) to [r,g,b] 0–255. Fallback: hot pink.
 * @param {string} css
 * @returns {[number, number, number]}
 */
function parseCssRgb(css) {
  if (typeof css !== "string") return [255, 43, 214];
  const hex = css.trim();
  const m3 = /^#([0-9a-f]{3})$/i.exec(hex);
  if (m3) {
    const h = m3[1];
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  const m6 = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m6) {
    const h = m6[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const mRgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(hex);
  if (mRgb) {
    return [
      Math.round(Number(mRgb[1])),
      Math.round(Number(mRgb[2])),
      Math.round(Number(mRgb[3])),
    ];
  }
  return [255, 43, 214];
}

/**
 * Fires a winner-colored confetti burst over the results overlay. Self-contained
 * canvas animation (~4.0s) that cleans itself up; respects reduced motion.
 *
 * Visual: tumbling paper chips + soft additive neon glows (Shadertoy-style gaussian
 * blobs — original canvas impl, game palette). Overlay stays transparent so the
 * podium UI/game still read underneath.
 *
 * @param {HTMLElement} overlay Results overlay root (position: fixed container).
 * @param {string[]} colors CSS colors — index 0 is the winner's neon (weighted heavier).
 */
export function spawnResultsConfetti(overlay, colors) {
  if (!overlay || !Array.isArray(colors) || colors.length === 0) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (reduced) return;

  // * One burst at a time — cancel and remove any burst still in flight.
  if (confettiRafId != null) cancelAnimationFrame(confettiRafId);
  confettiRafId = null;
  confettiCanvas?.remove();

  const canvas = document.createElement("canvas");
  canvas.className = "results-confetti";
  canvas.setAttribute("aria-hidden", "true");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = overlay.clientWidth || window.innerWidth;
  const h = overlay.clientHeight || window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
  // * First child — the panel is a later sibling, so UI always paints above the burst.
  overlay.insertBefore(canvas, overlay.firstChild);
  confettiCanvas = canvas;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    confettiCanvas = null;
    return;
  }
  ctx.scale(dpr, dpr);

  // * Club confetti palette (gold / cyan / pink / green) — winner color is mixed in.
  const NEON_PAL = ["#fadb2e", "#33c7f5", "#f2578a", "#7aeb66"];
  const palette = [colors[0], ...NEON_PAL, ...colors.slice(1)].filter(Boolean);

  const DURATION_MS = 4000;
  const COUNT = Math.round(Math.min(170, Math.max(100, w / 8)));
  /** @type {{ x: number, y: number, vx: number, vy: number, rot: number, vrot: number, w: number, h: number, flutter: number, phase: number, rgb: [number, number, number], glowR: number }[]} */
  const pieces = [];
  for (let i = 0; i < COUNT; i += 1) {
    // * Weight the winner's color ~40% of pieces, neon accents for the rest.
    const colorCss = Math.random() < 0.4
      ? colors[0]
      : palette[Math.floor(Math.random() * palette.length)];
    const rgb = parseCssRgb(colorCss);
    pieces.push({
      x: Math.random() * w,
      y: -20 - Math.random() * h * 0.35,
      vx: (Math.random() - 0.5) * 120,
      vy: 80 + Math.random() * 170,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 10,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      flutter: 1.5 + Math.random() * 2.5,
      phase: Math.random() * Math.PI * 2,
      rgb,
      // * Soft bloom radius (px) — larger = more Shadertoy-like glow blobs.
      glowR: 10 + Math.random() * 16,
    });
  }

  let lastTs = performance.now();
  const startTs = lastTs;
  const tick = (ts) => {
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    const elapsed = ts - startTs;
    if (elapsed >= DURATION_MS || !canvas.isConnected) {
      canvas.remove();
      if (confettiCanvas === canvas) confettiCanvas = null;
      confettiRafId = null;
      return;
    }
    const fade = elapsed > DURATION_MS - 700 ? (DURATION_MS - elapsed) / 700 : 1;
    ctx.clearRect(0, 0, w, h);

    // * Additive pass — soft neon glows stack like exp(-dsq) blobs in fragment shaders.
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = fade;

    for (const p of pieces) {
      p.vy += 240 * dt;
      p.x += (p.vx + Math.sin(p.phase + elapsed * 0.004) * p.flutter * 22) * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.y > h + 40 || p.y < -80) continue;

      const [r, g, b] = p.rgb;
      // * Pulse glow slightly so the field feels alive.
      const pulse = 0.75 + 0.25 * Math.sin(p.phase + elapsed * 0.008);
      const gr = p.glowR * pulse;

      // * Soft core: canvas radial gradient ≈ exp falloff (hot center → transparent).
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, gr);
      grad.addColorStop(0, `rgba(${r},${g},${b},${0.95 * pulse})`);
      grad.addColorStop(0.25, `rgba(${r},${g},${b},${0.45 * pulse})`);
      grad.addColorStop(0.6, `rgba(${r},${g},${b},${0.12 * pulse})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, gr, 0, Math.PI * 2);
      ctx.fill();

      // * Hard confetti chip on top of the glow (readable “paper” silhouette).
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const fold = 0.45 + Math.abs(Math.sin(p.phase + elapsed * 0.006)) * 0.55;
      ctx.scale(1, fold);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      // * Specular glint on the fold.
      ctx.fillStyle = `rgba(255,255,255,${0.35 * fold})`;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w * 0.35, p.h);
      ctx.restore();
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    confettiRafId = requestAnimationFrame(tick);
  };
  confettiRafId = requestAnimationFrame(tick);
}

/**
 * @param {Element | null | undefined} root
 */
export function cancelResultsAnimations(root) {
  if (root instanceof Element) cancelAnimationsIn(root);
}

/**
 * Quick anticipation exit for the results overlay — a short (~120ms) panel drop,
 * then `display:none`. No long outro: players want back into the match. Interaction
 * is cut synchronously so nothing lands during the beat.
 *
 * @param {HTMLElement | null | undefined} overlay Overlay container (display-toggled).
 * @param {HTMLElement | null | undefined} panel Podium panel to animate out.
 * @param {{ onComplete?: () => void }} [opts]
 * @returns {Promise<void>}
 */
export function animateResultsDismiss(overlay, panel, opts = {}) {
  if (!(overlay instanceof HTMLElement)) {
    opts.onComplete?.();
    return Promise.resolve();
  }
  overlay.style.pointerEvents = "none";
  return animateMenuDismiss(panel instanceof HTMLElement ? panel : overlay, {
    container: overlay,
    duration: 120,
    onComplete: opts.onComplete,
  });
}

/**
 * Plays podium entrance: overlay fade, panel slide, staggered scores with count-up.
 * @param {{
 *   overlay: HTMLElement,
 *   panel: HTMLElement,
 *   title: HTMLElement,
 *   scoreRows: Array<{ row: HTMLElement, valEl: HTMLElement, score: number, isWinner: boolean, badge?: HTMLElement | null }>,
 *   statsLine?: HTMLElement | null,
 *   history?: HTMLElement | null,
 *   playAgain?: HTMLElement | null,
 *   mainMenuBtn?: HTMLElement | null,
 * }} payload
 */
export function animateResultsPodiumShow(payload) {
  const {
    overlay,
    panel,
    title,
    scoreRows,
    statsLine,
    history,
    playAgain,
    mainMenuBtn,
  } = payload;

  const token = ++resultsEntranceToken;
  cancelResultsAnimations(overlay);

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (reduced) {
    scoreRows.forEach(({ valEl, score }) => {
      valEl.textContent = `${score} pts`;
    });
    return;
  }

  overlay.style.opacity = "0";
  panel.style.opacity = "0";
  title.style.opacity = "0";
  scoreRows.forEach(({ row, valEl, badge }) => {
    row.style.opacity = "0";
    valEl.textContent = "0 pts";
    if (badge) badge.style.opacity = "0";
  });
  if (statsLine) statsLine.style.opacity = "0";
  if (history) history.style.opacity = "0";
  if (playAgain) playAgain.style.opacity = "0";
  if (mainMenuBtn) mainMenuBtn.style.opacity = "0";

  const tl = createTimeline();

  tl.add(overlay, {
    opacity: [0, 1],
    duration: 260,
    ease: "outQuad",
  })
  .add(panel, {
    opacity: [0, 1],
    translateY: [22, 0],
    duration: 340,
    ease: "outExpo",
  }, 100)
  .add(title, {
    opacity: [0, 1],
    translateY: [12, 0],
    duration: 320,
    ease: "outBack(1.3)",
  }, 160);

  const rowEls = scoreRows.map((sr) => sr.row).filter(Boolean);
  if (rowEls.length > 0) {
    tl.add(rowEls, {
      opacity: [0, 1],
      translateY: [16, 0],
      scale: [0.94, 1],
      duration: 360,
      ease: "outBack(1.3)",
      delay: stagger(55),
    }, 220);
  }

  scoreRows.forEach(({ valEl, score, isWinner, badge }, i) => {
    if (isWinner && badge) {
      tl.add(badge, {
        opacity: [0, 1],
        translateY: [8, 0],
        scale: [0.9, 1],
        duration: 340,
        ease: "outBack(1.6)",
      }, 220 + i * 55 + 70);
    }

    countUpNumber(valEl, score, 520, {
      delay: 220 + i * 90,
      ease: "outExpo",
      formatter: (n) => `${Math.round(n)} pts`,
    });
  });

  // Reward beat: after the rows settle, give the winner row a quick celebratory
  // pop so the champion is unmistakably the peak of the panel.
  const winnerRow = scoreRows.find((sr) => sr.isWinner)?.row;
  if (winnerRow) {
    tl.add(winnerRow, {
      scale: [1, 1.05, 1],
      duration: 460,
      ease: "outElastic(1, 0.6)",
    }, 220 + scoreRows.length * 55 + 120);
  }

  const endBase = 220 + scoreRows.length * 90;

  // Actions lead the lower half — the reward decision, not buried under the ledger.
  if (playAgain) {
    tl.add(playAgain, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 300,
      ease: "outBack(1.2)",
    }, endBase + 40);
  }

  if (mainMenuBtn) {
    tl.add(mainMenuBtn, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 300,
      ease: "outBack(1.2)",
    }, endBase + 80);
  }

  // Recessed details ledger reveals last.
  if (statsLine) {
    tl.add(statsLine, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 320,
      ease: "outQuad",
    }, endBase + 150);
  }

  if (history) {
    tl.add(history, {
      opacity: [0, 1],
      translateY: [8, 0],
      duration: 300,
      ease: "outQuad",
    }, endBase + 190);
  }
}

/**
 * Creates and mounts the round results overlay (styles + DOM).
 *
 * @param {{ onMainMenuClick?: () => void }} [hooks] Optional hooks for button actions.
 * @returns {{
 *   overlay: HTMLDivElement,
 *   panel: HTMLDivElement,
 *   title: HTMLHeadingElement,
 *   finalScores: HTMLDivElement,
 *   history: HTMLDivElement,
 *   playAgain: HTMLButtonElement,
 *   statsLine: HTMLDivElement,
 *   mainMenuBtn: HTMLButtonElement,
 * }}
 */
export function initResultsOverlay(hooks = {}) {
  const { onMainMenuClick = () => {} } = hooks;

  const existing = document.getElementById("results-overlay");
  if (existing) existing.remove();
  const existingStyle = document.getElementById("results-overlay-style");
  if (existingStyle) existingStyle.remove();


  const overlay = document.createElement("div");
  overlay.id = "results-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Round results");

  const panel = document.createElement("div");
  panel.className = "results-panel cc-billboard";

  const title = document.createElement("h2");
  title.className = "results-title";

  const finalScores = document.createElement("div");
  finalScores.className = "results-final";

  const history = document.createElement("div");
  history.className = "results-history";

  const actions = document.createElement("div");
  actions.className = "results-actions";

  const playAgain = document.createElement("button");
  playAgain.type = "button";
  playAgain.className = "results-btn cc-btn cc-btn--primary";
  playAgain.textContent = "PLAY AGAIN";
  playAgain.setAttribute("data-gamepad-focusable", "true");
  playAgain.disabled = false;

  const mainMenuBtn = document.createElement("button");
  mainMenuBtn.type = "button";
  mainMenuBtn.className = "results-btn cc-btn cc-btn--ghost";
  mainMenuBtn.textContent = "MAIN MENU";
  mainMenuBtn.setAttribute("data-gamepad-focusable", "true");
  mainMenuBtn.addEventListener("click", () => {
    onMainMenuClick();
  });

  actions.appendChild(playAgain);
  actions.appendChild(mainMenuBtn);

  const statsLine = document.createElement("div");
  statsLine.className = "results-stats";

  panel.appendChild(title);

  // Reward-first order: the winner + match ranking + the PLAY AGAIN / MAIN MENU
  // decision lead the panel; the lifetime-stats / superlatives / challenges /
  // history ledger is recessed into a secondary details zone below. (main.js
  // injects superlatives + challenges as siblings after statsLine, so they land
  // inside .results-details between statsLine and history.)
  const resultsBody = document.createElement("div");
  resultsBody.className = "results-body";
  resultsBody.appendChild(finalScores);
  resultsBody.appendChild(actions);

  const details = document.createElement("div");
  details.className = "results-details";
  details.appendChild(statsLine);
  details.appendChild(history);
  resultsBody.appendChild(details);

  panel.appendChild(resultsBody);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  wireResultsButtonFeedback(playAgain);
  wireResultsButtonFeedback(mainMenuBtn);

  return { overlay, panel, title, finalScores, history, playAgain, statsLine, mainMenuBtn };
}
