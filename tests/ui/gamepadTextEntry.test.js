// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { initGamepadTextEntry, openGamepadTextEntry } from "../../src/ui/gamepadTextEntry.js";

const FIXTURE = `
<div id="cr-gamepad-text-entry" style="display:none">
  <div id="cr-gamepad-text-title"></div><div id="cr-gamepad-text-value"></div>
  <p id="cr-gamepad-text-error" hidden></p><div id="cr-gamepad-text-keys"></div>
  <button data-gamepad-keyboard-action="backspace">DELETE</button>
  <button data-gamepad-keyboard-action="clear">CLEAR</button>
  <button data-gamepad-keyboard-action="submit">CONFIRM</button>
  <button data-gamepad-keyboard-action="cancel">CANCEL</button>
</div>`;

beforeEach(() => {
  document.body.innerHTML = FIXTURE;
  initGamepadTextEntry();
});

function click(selector) {
  /** @type {HTMLElement} */ (document.querySelector(selector)).click();
}

describe("gamepad text entry", () => {
  it("renders a controller keyboard and commits normalized text", () => {
    const received = [];
    openGamepadTextEntry({ title: "FRIEND CODE", value: "ab", maxLength: 4, normalize: (v) => v.toUpperCase(), onSubmit: (v) => { received.push(v); return true; } });
    click('[data-gamepad-keyboard-key="C"]');
    click('[data-gamepad-keyboard-action="submit"]');
    expect(received).toEqual(["ABC"]);
    expect(document.getElementById("cr-gamepad-text-entry").style.display).toBe("none");
  });

  it("enforces the caller limit and lets cancel discard the draft", () => {
    const submit = () => true;
    openGamepadTextEntry({ title: "NAME", value: "A", maxLength: 2, onSubmit: submit });
    click('[data-gamepad-keyboard-key="B"]');
    click('[data-gamepad-keyboard-key="C"]');
    expect(document.getElementById("cr-gamepad-text-value").textContent).toBe("AB");
    click('[data-gamepad-keyboard-action="cancel"]');
    expect(document.getElementById("cr-gamepad-text-entry").style.display).toBe("none");
  });

  it("keeps the modal open when the existing submit path rejects its value", () => {
    openGamepadTextEntry({ title: "FRIEND CODE", value: "BAD", maxLength: 16, onSubmit: () => false });
    click('[data-gamepad-keyboard-action="submit"]');
    expect(document.getElementById("cr-gamepad-text-entry").style.display).toBe("flex");
    expect(document.getElementById("cr-gamepad-text-error").hidden).toBe(false);
  });
});
