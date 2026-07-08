import "./styles/results.css";

import {
  animateButtonPress,
  animateButtonRelease,
  animateMenuCardEnter,
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
 * Fires a winner-colored confetti burst over the results overlay. Self-contained
 * canvas animation (~2.8s) that cleans itself up; respects reduced motion.
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

  const DURATION_MS = 2800;
  const COUNT = Math.round(Math.min(150, Math.max(90, w / 9)));
  const pieces = [];
  for (let i = 0; i < COUNT; i += 1) {
    // * Weight the winner's color ~40% of pieces, the accent palette for the rest.
    const color = Math.random() < 0.4 ? colors[0] : colors[Math.floor(Math.random() * colors.length)];
    pieces.push({
      x: Math.random() * w,
      y: -20 - Math.random() * h * 0.35,
      vx: (Math.random() - 0.5) * 110,
      vy: 90 + Math.random() * 160,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 9,
      w: 5 + Math.random() * 5,
      h: 8 + Math.random() * 7,
      flutter: 1.5 + Math.random() * 2.5,
      phase: Math.random() * Math.PI * 2,
      color,
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
    const fade = elapsed > DURATION_MS - 600 ? (DURATION_MS - elapsed) / 600 : 1;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = fade;
    for (const p of pieces) {
      p.vy += 250 * dt;
      p.x += (p.vx + Math.sin(p.phase + elapsed * 0.004) * p.flutter * 22) * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.y > h + 24) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // * Fold shimmer — scaling on the sine gives the classic tumbling-paper glint.
      ctx.scale(1, 0.45 + Math.abs(Math.sin(p.phase + elapsed * 0.006)) * 0.55);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
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

  const endBase = 220 + scoreRows.length * 90;

  if (statsLine) {
    tl.add(statsLine, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 340,
      ease: "outQuad",
    }, endBase + 40);
  }

  if (history) {
    tl.add(history, {
      opacity: [0, 1],
      translateY: [8, 0],
      duration: 320,
      ease: "outQuad",
    }, endBase + 90);
  }

  if (playAgain) {
    tl.add(playAgain, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 300,
      ease: "outQuad",
    }, endBase + 140);
  }

  if (mainMenuBtn) {
    tl.add(mainMenuBtn, {
      opacity: [0, 1],
      translateY: [10, 0],
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
  panel.className = "results-panel";

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
  playAgain.className = "results-btn results-btn--play";
  playAgain.textContent = "PLAY AGAIN";
  playAgain.setAttribute("data-gamepad-focusable", "true");
  playAgain.disabled = false;

  const mainMenuBtn = document.createElement("button");
  mainMenuBtn.type = "button";
  mainMenuBtn.className = "results-btn results-btn--menu";
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

  const resultsBody = document.createElement("div");
  resultsBody.className = "results-body";
  resultsBody.appendChild(finalScores);
  resultsBody.appendChild(statsLine);
  resultsBody.appendChild(history);
  resultsBody.appendChild(actions);
  panel.appendChild(resultsBody);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  wireResultsButtonFeedback(playAgain);
  wireResultsButtonFeedback(mainMenuBtn);

  return { overlay, panel, title, finalScores, history, playAgain, statsLine, mainMenuBtn };
}
