// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { initGamepadTextEntry, openGamepadTextEntry } from "../../src/ui/gamepadTextEntry.js";

const FIXTURE = `
<div id="cr-gamepad-text-entry" style="display:none">
  <div id="cr-gamepad-text-title"></div><input id="cr-gamepad-text-value" type="text" />
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
  it("is mounted outside every screen that can hide it", () => {
    const page = document.createElement("template");
    page.innerHTML = readFileSync("index.html", "utf8");
    const dialog = page.content.querySelector("#cr-gamepad-text-entry");
    expect(dialog).not.toBeNull();
    expect(dialog.closest("#cr-customize-screen")).toBeNull();
  });

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
    expect(document.getElementById("cr-gamepad-text-value").value).toBe("AB");
    click('[data-gamepad-keyboard-action="cancel"]');
    expect(document.getElementById("cr-gamepad-text-entry").style.display).toBe("none");
  });

  it("keeps the modal open when the existing submit path rejects its value", () => {
    openGamepadTextEntry({ title: "FRIEND CODE", value: "BAD", maxLength: 16, onSubmit: () => false });
    click('[data-gamepad-keyboard-action="submit"]');
    expect(document.getElementById("cr-gamepad-text-entry").style.display).toBe("flex");
    expect(document.getElementById("cr-gamepad-text-error").hidden).toBe(false);
  });

  it("uses the focused real input for a physical or Steam keyboard", () => {
    const received = [];
    const launcher = document.createElement("button");
    document.body.append(launcher);
    launcher.focus();
    openGamepadTextEntry({ title: "NAME", value: "", maxLength: 12, onSubmit: (value) => { received.push(value); return true; } });
    const value = /** @type {HTMLInputElement} */ (document.getElementById("cr-gamepad-text-value"));
    expect(document.activeElement).toBe(value);
    value.value = "DeckName";
    value.dispatchEvent(new Event("input", { bubbles: true }));
    value.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(received).toEqual(["DeckName"]);
    expect(document.getElementById("cr-gamepad-text-entry").style.display).toBe("none");
    expect(document.activeElement).toBe(launcher);
  });

  it("keeps the draft and first typed character when switching from controller keys", () => {
    openGamepadTextEntry({ title: "NAME", value: "A", maxLength: 12, onSubmit: () => true });
    click('[data-gamepad-keyboard-key="B"]');
    const gridKey = /** @type {HTMLElement} */ (document.querySelector('[data-gamepad-keyboard-key="C"]'));
    gridKey.focus();
    gridKey.dispatchEvent(new KeyboardEvent("keydown", { key: "z", bubbles: true, cancelable: true }));
    expect(document.getElementById("cr-gamepad-text-value").value).toBe("ABz");
    expect(document.activeElement).toBe(document.getElementById("cr-gamepad-text-value"));
  });
});
