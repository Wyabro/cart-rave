// @vitest-environment happy-dom
// settingsTrust.test.js — SITE-TRUST-1 settings follow-up: support sits
// under Controls, Leave Feedback is in that box, chips are not 64px.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const css = readFileSync("src/ui/styles/cart-rave-menu.css", "utf8");
const lifecycle = readFileSync("src/orchestration/roundLifecycle.js", "utf8");

const FORM =
  "https://docs.google.com/forms/d/e/1FAIpQLScCBY5nd6mS0yyWWfL9M48qod-bV1p3RTu7_L0pCcgHyt6yFA/viewform";

describe("SITE-TRUST-1 settings support box", () => {
  it("places PRIVACY & SUPPORT after CONTROLS", () => {
    const controls = html.indexOf('id="cr-settings-ctl-hd"');
    const privacy = html.indexOf('id="cr-settings-privacy-hd"');
    expect(controls).toBeGreaterThan(0);
    expect(privacy).toBeGreaterThan(controls);
  });

  it("puts Leave Feedback in the support box with the podium form URL", () => {
    const boxStart = html.indexOf('id="cr-settings-privacy-hd"');
    const boxEnd = html.indexOf("</section>", boxStart);
    const box = html.slice(boxStart, boxEnd);
    expect(box).toContain("LEAVE FEEDBACK");
    expect(box).toContain(FORM);
    expect(box).toContain('id="cr-settings-feedback"');
    expect(box).toContain('target="_blank"');
    expect(lifecycle).toContain(FORM);
  });

  it("does not inflate support chips to 64px", () => {
    expect(css).not.toMatch(/\.cr-settings-info-links a[^}]*min-height:\s*64px/);
    expect(css).toMatch(/\.cr-settings-panel \.cr-screen-panels \{[\s\S]*?margin-top:\s*0;/);
  });
});
