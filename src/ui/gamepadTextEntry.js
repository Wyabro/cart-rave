const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM0123456789"];

/** @type {{ title: string, value: string, maxLength: number, normalize?: (value: string) => string, onSubmit: (value: string) => boolean, returnFocus: HTMLElement|null }|null} */
let activeEntry = null;

function elements() {
  return {
    overlay: /** @type {HTMLElement|null} */ (document.getElementById("cr-gamepad-text-entry")),
    title: document.getElementById("cr-gamepad-text-title"),
    value: /** @type {HTMLInputElement|null} */ (document.getElementById("cr-gamepad-text-value")),
    error: document.getElementById("cr-gamepad-text-error"), keys: document.getElementById("cr-gamepad-text-keys"),
  };
}

function renderValue() {
  if (!activeEntry) return;
  const { value, error } = elements();
  if (value) value.value = activeEntry.value;
  if (error) error.hidden = true;
}

function close() {
  const { overlay } = elements();
  const returnFocus = activeEntry?.returnFocus;
  if (overlay) overlay.style.display = "none";
  activeEntry = null;
  if (returnFocus?.isConnected) returnFocus.focus();
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
  const { overlay, title, value, keys } = elements();
  if (!overlay || !title || !value || !keys) return;
  const focused = document.activeElement;
  activeEntry = {
    ...entry,
    returnFocus: focused instanceof HTMLElement ? focused : null,
  };
  title.textContent = entry.title;
  value.maxLength = entry.maxLength;
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
  value.focus();
  value.select();
}

export function initGamepadTextEntry() {
  const { overlay, value, keys } = elements();
  if (!overlay || !value || !keys) return;
  value.addEventListener("input", () => {
    if (!activeEntry) return;
    activeEntry.value = value.value.slice(0, activeEntry.maxLength);
  });
  value.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); runAction("submit"); }
    if (event.key === "Escape") { event.preventDefault(); runAction("cancel"); }
  });
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
  overlay.addEventListener("keydown", (event) => {
    if (!activeEntry || event.target === value || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Enter") { event.preventDefault(); runAction("submit"); return; }
    if (event.key === "Escape") { event.preventDefault(); runAction("cancel"); return; }
    if (event.key === "Backspace") {
      event.preventDefault();
      activeEntry.value = activeEntry.value.slice(0, -1);
      renderValue();
      value.focus();
      return;
    }
    if (event.key.length === 1 && activeEntry.value.length < activeEntry.maxLength) {
      event.preventDefault();
      activeEntry.value += event.key;
      renderValue();
      value.focus();
    }
  });
}
