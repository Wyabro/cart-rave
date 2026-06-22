// resultsOverlay.js — round results screen DOM + styles

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

  const style = document.createElement("style");
  style.id = "results-overlay-style";
  style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Bungee&family=Space+Mono:wght@400;700&family=Archivo+Black&display=swap');

      #results-overlay {
        --results-mono: "Space Mono", ui-monospace, monospace;
        --results-display: "Bungee", "Archivo Black", sans-serif;
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
        font-size: clamp(22px, 5vw, 32px);
        font-weight: 400;
        letter-spacing: 0.06em;
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
      }

      #results-overlay .results-score-val {
        font-family: var(--results-display);
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
        font-family: var(--results-display);
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
        font-family: var(--results-display);
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
        transition: transform 120ms ease, box-shadow 180ms ease, background 180ms ease;
      }

      #results-overlay .results-btn:hover:not(:disabled) {
        transform: translateY(-2px) scale(1.02);
        background: rgba(0, 0, 0, 0.35);
        box-shadow: 0 0 20px var(--btn-glow, #ff2bd6), 0 0 44px var(--btn-glow, #ff2bd6);
      }

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
  playAgain.textContent = "PLAY AGAIN";
  playAgain.disabled = false;

  const mainMenuBtn = document.createElement("button");
  mainMenuBtn.type = "button";
  mainMenuBtn.className = "results-btn results-btn--menu";
  mainMenuBtn.textContent = "MAIN MENU";
  mainMenuBtn.addEventListener("click", () => {
    onMainMenuClick();
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.location.href = url.pathname;
  });

  actions.appendChild(playAgain);
  actions.appendChild(mainMenuBtn);

  const statsLine = document.createElement("div");
  statsLine.className = "results-stats";

  panel.appendChild(title);
  panel.appendChild(finalScores);
  panel.appendChild(statsLine);
  panel.appendChild(history);
  panel.appendChild(actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  return { overlay, panel, title, finalScores, history, playAgain, statsLine, mainMenuBtn };
}
