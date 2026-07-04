// resultsOverlay.js — round results screen DOM + styles

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
    // @ts-expect-error - 'disabled' is on HTMLButtonElement, querySelector returns HTMLElement
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
 *   nextLevelBtn: HTMLButtonElement,
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

  const style = document.createElement("style");
  style.id = "results-overlay-style";
  style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Road+Rage&family=Russo+One&family=Goldman:wght@400;700&family=Michroma&family=Space+Grotesk:wght@400;500;700&display=swap');

      #results-overlay {
        --results-ui: "Russo One", sans-serif;
        --results-mono: "Goldman", ui-monospace, monospace;
        --results-display: "Road Rage", "Goldman", sans-serif;
        position: fixed;
        inset: 0;
        z-index: 25000;
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        font-family: var(--results-mono);
        color: #fff;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
        background: radial-gradient(ellipse at center, #0a0014 0%, #000 90%);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }

      #results-overlay .results-panel {
        pointer-events: auto;
        min-width: min(420px, 92vw);
        max-width: 520px;
        width: 90%;
        padding: 36px 32px 28px;
        border-radius: 16px;
        background: rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 0 40px rgba(43, 255, 122, 0.08), 0 16px 48px rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }

      #results-overlay .results-title {
        font-family: var(--results-display);
        font-size: clamp(24.2px, 5.5vw, 35.2px);
        font-weight: 400;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        margin: 0 0 18px;
        min-height: 1.2em;
        text-align: center;
        line-height: 1.15;
        color: var(--title-glow, #ffe53d);
        text-shadow: 0 0 12px var(--title-glow, #ffe53d), 0 0 28px color-mix(in oklab, var(--title-glow, #ffe53d), transparent 50%);
      }

      #results-overlay .results-final {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
      }

      #results-overlay .results-score-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 12px 16px;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.1);
        transition: box-shadow 180ms ease, border-color 180ms ease;
      }

      #results-overlay .results-score-row.is-winner {
        border-color: var(--slot-glow, #2bff7a);
        box-shadow: 0 0 12px var(--slot-glow, #2bff7a), 0 0 28px color-mix(in oklab, var(--slot-glow, #2bff7a), transparent 55%);
      }

      #results-overlay .results-winner-badge {
        display: inline-block;
        margin-right: 6px;
        font-size: 13px;
        line-height: 1;
        vertical-align: middle;
        filter: drop-shadow(0 0 6px var(--slot-glow, #ffe53d));
        transform-origin: center center;
      }

      #results-overlay .results-score-name {
        font-family: var(--results-mono);
        font-size: 13px;
        letter-spacing: 0.04em;
        color: rgba(255, 255, 255, 0.88);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
        flex: 1;
        display: flex;
        align-items: center;
      }

      #results-overlay .pb-badge {
        font-family: var(--results-mono);
        font-size: 9px;
        font-weight: 900;
        letter-spacing: 0.12em;
        padding: 2px 7px;
        border-radius: 4px;
        background: #39ff14;
        color: #000000;
        box-shadow: 0 0 10px #39ff1488;
        margin-left: 8px;
        animation: pbPulse 1s ease-in-out infinite alternate;
        display: inline-block;
        flex-shrink: 0;
      }

      @keyframes pbPulse {
        0% { transform: scale(1); box-shadow: 0 0 8px #39ff14; }
        100% { transform: scale(1.08); box-shadow: 0 0 16px #39ff14; }
      }

      #results-overlay .results-score-val {
        font-family: var(--results-ui);
        font-size: 18px;
        letter-spacing: 0.04em;
        color: var(--slot-glow, #22e6ff);
        text-shadow: 0 0 10px var(--slot-glow, #22e6ff);
        flex-shrink: 0;
      }

      #results-overlay .results-stats {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 18px;
        background: rgba(0, 0, 0, 0.45);
        border: 1px solid rgba(255, 43, 214, 0.22);
        border-radius: 12px;
        margin: 0 0 14px;
        position: relative;
      }

      #results-overlay .results-stats-tag {
        position: absolute;
        top: -8px; left: 14px;
        display: inline-flex; align-items: center; gap: 5px;
        padding: 1px 8px;
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        font-family: var(--results-mono);
        font-size: 8px;
        letter-spacing: 0.22em;
        color: rgba(255, 255, 255, 0.6);
      }

      #results-overlay .results-stats-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        flex: 1;
      }

      #results-overlay .results-stats-num {
        font-family: var(--results-ui);
        font-size: 22px;
        line-height: 1;
        color: #ff2bd6;
        text-shadow: 0 0 10px #ff2bd6;
        letter-spacing: 0.02em;
      }

      #results-overlay .results-stats-lbl {
        font-family: var(--results-mono);
        font-size: 8px;
        letter-spacing: 0.18em;
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
      }

      #results-overlay .results-stats-div {
        width: 1px;
        height: 24px;
        background: rgba(255, 255, 255, 0.12);
        flex-shrink: 0;
      }

      #results-overlay .results-history {
        min-height: 72px;
        max-height: 160px;
        overflow: auto;
        margin-bottom: 18px;
        padding: 14px 16px;
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
        font-family: var(--results-mono);
        font-size: 11px;
        line-height: 1.65;
        letter-spacing: 0.03em;
        color: rgba(255, 255, 255, 0.65);
      }

      #results-overlay .results-history-row {
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
      }

      #results-overlay .results-history-row:last-child {
        margin-bottom: 0;
        padding-bottom: 0;
        border-bottom: none;
      }

      #results-overlay .results-actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 100%;
      }

      #results-overlay .results-btn {
        width: 100%;
        padding: 14px 22px;
        border-radius: 6px;
        font-family: var(--results-ui);
        font-size: 16px;
        letter-spacing: 0.06em;
        cursor: pointer;
        text-decoration: none;
        text-align: center;
        display: block;
        border: 2px solid var(--btn-glow, #ff2bd6);
        background: rgba(0, 0, 0, 0.55);
        color: var(--btn-glow, #ff2bd6);
        text-shadow: 0 0 10px var(--btn-glow, #ff2bd6);
        box-shadow: 0 0 12px var(--btn-glow, #ff2bd6), 0 0 28px color-mix(in oklab, var(--btn-glow, #ff2bd6), transparent 60%);
        transition: box-shadow 180ms ease, background 180ms ease;
      }

      #results-overlay .results-btn:hover:not(:disabled) {
        transform: translateY(-2px) scale(1.02);
        background: rgba(0, 0, 0, 0.35);
        box-shadow: 0 0 20px var(--btn-glow, #ff2bd6), 0 0 44px var(--btn-glow, #ff2bd6);
      }

      /* Press scale handled by Anime.js. */

      #results-overlay .results-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
        box-shadow: 0 0 8px color-mix(in oklab, var(--btn-glow, #ff2bd6), transparent 70%);
      }

      #results-overlay .results-btn--play {
        --btn-glow: #ff2bd6;
      }

      #results-overlay .results-btn--menu {
        --btn-glow: #22e6ff;
      }

      @media (pointer: coarse) {
        #results-overlay {
          align-items: stretch;
          justify-content: stretch;
          padding: 0;
        }

        #results-overlay .results-panel {
          width: 100%;
          height: 100%;
          max-width: none;
          min-height: 0;
          max-height: none;
          border-radius: 0;
          border: none;
          overflow: hidden;
          padding:
            max(8px, env(safe-area-inset-top, 0px))
            max(10px, env(safe-area-inset-right, 0px))
            max(8px, env(safe-area-inset-bottom, 0px))
            max(10px, env(safe-area-inset-left, 0px));
          display: flex;
          flex-direction: column;
          gap: clamp(4px, 1vh, 8px);
          box-shadow: none;
        }

        #results-overlay .results-title {
          margin: 0 0 clamp(4px, 1vh, 6px);
          font-size: clamp(17.6px, 4.95vw, 24.2px);
          flex-shrink: 0;
          line-height: 1.1;
        }

        #results-overlay .results-body {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: clamp(4px, 1vh, 6px);
          overflow: hidden;
        }

        #results-overlay .results-final {
          gap: clamp(4px, 1vh, 5px);
          margin-bottom: 0;
          flex-shrink: 0;
        }

        #results-overlay .results-score-row {
          padding: clamp(6px, 1.5vw, 8px) clamp(8px, 2vw, 10px);
          gap: 8px;
        }

        #results-overlay .results-score-name {
          font-size: clamp(10px, 2.6vw, 11px);
        }

        #results-overlay .results-score-val {
          font-size: clamp(14px, 3.6vw, 16px);
        }

        #results-overlay .results-stats {
          margin: 0;
          padding: clamp(8px, 2vw, 10px) clamp(10px, 2.5vw, 12px);
          flex-shrink: 0;
        }

        #results-overlay .results-stats-num {
          font-size: clamp(16px, 4vw, 18px);
        }

        #results-overlay .results-stats-lbl {
          font-size: 7px;
        }

        #results-overlay .results-history {
          flex: 1 1 auto;
          min-height: 0;
          max-height: none;
          overflow: hidden;
          margin-bottom: 0;
          padding: clamp(6px, 1.5vw, 8px) clamp(8px, 2vw, 10px);
          font-size: clamp(9px, 2.3vw, 10px);
          line-height: 1.45;
        }

        #results-overlay .results-history-row {
          margin-bottom: 4px;
          padding-bottom: 4px;
        }

        #results-overlay .results-actions {
          gap: clamp(6px, 1.5vw, 8px);
          flex-shrink: 0;
        }

        #results-overlay .results-btn {
          min-height: 42px;
          padding: clamp(10px, 2.5vw, 12px) clamp(14px, 3.5vw, 18px);
          font-size: clamp(13px, 3.4vw, 15px);
          touch-action: manipulation;
        }
      }

      @media (pointer: coarse) and (orientation: landscape) {
        #results-overlay .results-body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: minmax(0, 1fr) auto;
          grid-template-areas:
            "scores history"
            "stats actions";
          gap: clamp(6px, 1.2vw, 10px);
        }

        #results-overlay .results-final {
          grid-area: scores;
          min-height: 0;
          overflow: hidden;
        }

        #results-overlay .results-stats {
          grid-area: stats;
        }

        #results-overlay .results-history {
          grid-area: history;
        }

        #results-overlay .results-actions {
          grid-area: actions;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: clamp(6px, 1.2vw, 8px);
        }

        #results-overlay .results-btn {
          min-height: 38px;
          padding: 8px 10px;
          font-size: clamp(11px, 2.2vw, 13px);
        }
      }
    `.trim();
  document.head.appendChild(style);

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
  playAgain.textContent = "REMATCH";
  playAgain.setAttribute("data-gamepad-focusable", "true");
  playAgain.disabled = false;

  const nextLevelBtn = document.createElement("button");
  nextLevelBtn.type = "button";
  nextLevelBtn.className = "results-btn results-btn--next";
  nextLevelBtn.textContent = "NEXT LEVEL";
  nextLevelBtn.setAttribute("data-gamepad-focusable", "true");
  nextLevelBtn.disabled = false;

  const mainMenuBtn = document.createElement("button");
  mainMenuBtn.type = "button";
  mainMenuBtn.className = "results-btn results-btn--menu";
  mainMenuBtn.textContent = "MAIN MENU";
  mainMenuBtn.setAttribute("data-gamepad-focusable", "true");
  mainMenuBtn.addEventListener("click", () => {
    onMainMenuClick();
  });

  actions.appendChild(playAgain);
  actions.appendChild(nextLevelBtn);
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
  wireResultsButtonFeedback(nextLevelBtn);
  wireResultsButtonFeedback(mainMenuBtn);

  return { overlay, panel, title, finalScores, history, playAgain, nextLevelBtn, statsLine, mainMenuBtn };
}
