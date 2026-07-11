// rotatePrompt.js — urges portrait mobile players to rotate to landscape

import { isTouchDevice } from "../utils.js";

/** @type {HTMLElement | null} */
let rootEl = null;
let dismissedSession = false;

function injectStyles() {
  if (document.getElementById("rotate-prompt-style")) return;

  const style = document.createElement("style");
  style.id = "rotate-prompt-style";
  style.textContent = `
    #rotate-prompt {
      position: fixed;
      inset: 0;
      z-index: 27000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: max(16px, env(safe-area-inset-top, 0px))
        max(16px, env(safe-area-inset-right, 0px))
        max(16px, env(safe-area-inset-bottom, 0px))
        max(16px, env(safe-area-inset-left, 0px));
      background: rgba(4, 2, 10, 0.78);
      pointer-events: auto;
      font-family: var(--mono, "Goldman", ui-monospace, monospace);
      color: #f2ede4;
    }

    #rotate-prompt .rp-panel {
      width: min(340px, 100%);
      padding: clamp(20px, 5vw, 28px) clamp(18px, 4.5vw, 24px);
      border-radius: var(--radius-panel, 10px);
      border: none;
      background: var(--color-ink, #14101e);
      box-shadow: var(--sticker-panel, 0 0 0 3px #f2ede4, 4px 4px 0 3px #08050f);
      text-align: center;
    }

    #rotate-prompt .rp-icon-wrap {
      width: clamp(72px, 20vw, 96px);
      height: clamp(72px, 20vw, 96px);
      margin: 0 auto clamp(14px, 3.5vw, 18px);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #rotate-prompt .rp-phone {
      width: 36px;
      height: 60px;
      border-radius: 8px;
      border: 2px solid #22e6ff;
      position: relative;
      animation: rp-rotate-phone 2.2s ease-in-out infinite;
      transform-origin: center center;
    }

    #rotate-prompt .rp-phone::before {
      content: "";
      position: absolute;
      top: 6px;
      left: 50%;
      transform: translateX(-50%);
      width: 10px;
      height: 2px;
      border-radius: 2px;
      background: rgba(34, 230, 255, 0.6);
    }

    @keyframes rp-rotate-phone {
      0%, 12% { transform: rotate(0deg); }
      45%, 58% { transform: rotate(90deg); }
      88%, 100% { transform: rotate(90deg); }
    }

    #rotate-prompt .rp-title {
      font-family: var(--display, "Road Rage", "Goldman", sans-serif);
      font-weight: 400;
      font-size: clamp(18px, 5vw, 22px);
      letter-spacing: 0.02em;
      color: #f2ede4;
      paint-order: stroke fill;
      -webkit-text-stroke: 0.06em #08050f;
      text-shadow: 0.05em 0.05em 0 #08050f, 0.1em 0.1em 0 #08050f;
      margin: 0 0 8px;
    }

    #rotate-prompt .rp-text {
      font-size: clamp(11px, 2.8vw, 12px);
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.78);
      margin: 0 0 clamp(16px, 4vw, 20px);
    }

    #rotate-prompt .rp-btn {
      width: 100%;
      min-height: 44px;
      padding: 12px 18px;
      border-radius: var(--radius-sm, 8px);
      border: none;
      background: var(--color-yellow, #ffe53d);
      color: var(--color-ink-deep, #08050f);
      box-shadow: var(--sticker-chip, 0 0 0 2.5px #f2ede4, 3px 3px 0 2.5px #08050f);
      font-family: var(--ui, "Russo One", sans-serif);
      font-size: clamp(12px, 3.2vw, 14px);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      touch-action: manipulation;
      cursor: pointer;
    }

    #rotate-prompt .rp-btn:active {
      transform: translate(2px, 2px);
      box-shadow: var(--sticker-chip-pressed, 0 0 0 2.5px #f2ede4, 1px 1px 0 2.5px #08050f);
    }

    @media (orientation: landscape) {
      #rotate-prompt { display: none !important; }
    }

    @media (pointer: fine) and (hover: hover) {
      #rotate-prompt { display: none !important; }
    }

    @media (prefers-reduced-motion: reduce) {
      #rotate-prompt .rp-phone { animation: none !important; transform: rotate(90deg); }
    }
  `;
  document.head.appendChild(style);
}

function isPortraitMobile() {
  return isTouchDevice() && !window.matchMedia("(orientation: landscape)").matches;
}

function ensureDom() {
  injectStyles();
  if (rootEl) return rootEl;

  rootEl = document.createElement("div");
  rootEl.id = "rotate-prompt";
  rootEl.setAttribute("role", "dialog");
  rootEl.setAttribute("aria-label", "Rotate your device");

  rootEl.innerHTML = `
    <div class="rp-panel">
      <div class="rp-icon-wrap"><div class="rp-phone" aria-hidden="true"></div></div>
      <h2 class="rp-title">ROTATE DEVICE</h2>
      <p class="rp-text">Cart Clash plays best in landscape.<br>Turn your phone sideways for the full arena view.</p>
      <button type="button" class="rp-btn" id="rotate-prompt-dismiss">PLAY IN PORTRAIT</button>
    </div>
  `;

  rootEl.querySelector("#rotate-prompt-dismiss")?.addEventListener("click", () => {
    dismissedSession = true;
    hideRotatePrompt();
  });

  document.body.appendChild(rootEl);

  window.addEventListener("orientationchange", () => {
    if (!window.matchMedia("(orientation: landscape)").matches) return;
    hideRotatePrompt();
  }, { passive: true });

  return rootEl;
}

function hideRotatePrompt() {
  if (rootEl) rootEl.style.display = "none";
}

/**
 * Shows the rotate prompt on portrait touch devices (once per session unless dismissed).
 */
export function showRotatePromptIfNeeded() {
  if (!isPortraitMobile() || dismissedSession) return;
  const el = ensureDom();
  el.style.display = "flex";
}
