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
      background: rgba(5, 5, 20, 0.88);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      pointer-events: auto;
      font-family: "Space Mono", ui-monospace, monospace;
      color: #fff;
    }

    #rotate-prompt .rp-panel {
      width: min(340px, 100%);
      padding: clamp(20px, 5vw, 28px) clamp(18px, 4.5vw, 24px);
      border-radius: 16px;
      border: 1px solid rgba(34, 230, 255, 0.28);
      background: rgba(0, 0, 0, 0.65);
      box-shadow: 0 0 32px rgba(255, 43, 214, 0.12);
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
      box-shadow: 0 0 16px rgba(34, 230, 255, 0.35);
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
      font-family: "Bungee", "Archivo Black", sans-serif;
      font-size: clamp(18px, 5vw, 22px);
      letter-spacing: 0.06em;
      color: #22e6ff;
      text-shadow: 0 0 12px rgba(34, 230, 255, 0.45);
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
      border-radius: 8px;
      border: 2px solid rgba(255, 43, 214, 0.45);
      background: rgba(0, 0, 0, 0.5);
      color: #ff2bd6;
      font-family: "Bungee", sans-serif;
      font-size: clamp(12px, 3.2vw, 14px);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      touch-action: manipulation;
      cursor: pointer;
    }

    #rotate-prompt .rp-btn:active {
      transform: scale(0.98);
      background: rgba(255, 43, 214, 0.12);
    }

    @media (orientation: landscape) {
      #rotate-prompt { display: none !important; }
    }

    @media (pointer: fine) and (hover: hover) {
      #rotate-prompt { display: none !important; }
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
