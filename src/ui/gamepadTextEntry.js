const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM0123456789"];

/** @type {{ title: string, value: string, maxLength: number, normalize?: (value: string) => string, onSubmit: (value: string) => boolean }|null} */
let activeEntry = null;

function elements() {
  return {
    overlay: /** @type {HTMLElement|null} */ (document.getElementById("cr-gamepad-text-entry")),
    title: document.getElementById("cr-gamepad-text-title"), value: document.getElementById("cr-gamepad-text-value"),
    error: document.getElementById("cr-gamepad-text-error"), keys: document.getElementById("cr-gamepad-text-keys"),
  };
}

function renderValue() {
  if (!activeEntry) return;
  const { value, error } = elements();
  if (value) value.textContent = activeEntry.value || "_";
  if (error) error.hidden = true;
}

function close() {
  const { overlay } = elements();
  if (overlay) overlay.style.display = "none";
  activeEntry = null;
}

function runAction(action) {
  if (!activeEntry) return;
  if (action === "backspace") activeEntry.value = activeEntry.value.slice(0, -1);
  else if (action === "clear") activeEntry.value = "";
  else if (action === "submit") {
    const value = activeEntry.normalize ? activeEntry.normalize(activeEntry.value) : activeEntry.value;
    if (activeEntry.onSubmit(value)) { close(); return; }
    const { error } = elements();
    if (error) { error.textContent = "BAD CODE — TRY AGAIN"; error.hidden = false; }
    return;
  } else { close(); return; }
  renderValue();
}

/** @param {{ title: string, value: string, maxLength: number, normalize?: (value: string) => string, onSubmit: (value: string) => boolean }} entry */
export function openGamepadTextEntry(entry) {
  const { overlay, title, keys } = elements();
  if (!overlay || !title || !keys) return;
  activeEntry = { ...entry };
  title.textContent = entry.title;
  keys.replaceChildren(...KEY_ROWS.map((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "cr-gamepad-keyboard-row";
    for (const key of row) {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = key; button.dataset.gamepadKeyboardKey = key;
      rowEl.append(button);
    }
    return rowEl;
  }));
  renderValue(); overlay.style.display = "flex";
  /** @type {HTMLElement|null} */ (keys.querySelector("button"))?.focus();
}

export function initGamepadTextEntry() {
  const { overlay, keys } = elements();
  if (!overlay || !keys) return;
  keys.addEventListener("click", (event) => {
    const keyButton = /** @type {HTMLElement|null} */ (event.target instanceof Element ? event.target.closest("[data-gamepad-keyboard-key]") : null);
    const key = keyButton?.dataset.gamepadKeyboardKey;
    if (key && activeEntry && activeEntry.value.length < activeEntry.maxLength) { activeEntry.value += key; renderValue(); }
  });
  overlay.addEventListener("click", (event) => {
    const actionButton = /** @type {HTMLElement|null} */ (event.target instanceof Element ? event.target.closest("[data-gamepad-keyboard-action]") : null);
    const action = actionButton?.dataset.gamepadKeyboardAction;
    if (action) runAction(action);
  });
}
