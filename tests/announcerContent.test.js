import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ANNOUNCER_EVENTS } from "../src/announcer/announcerEvents.js";
import { ANNOUNCER_LINES } from "../src/announcer/announcerLines.js";
import { expandAnnouncerVoiceKeys } from "../src/announcer/announcerVoiceKeys.js";

const VOICE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/sounds/announcer/en",
);

describe("announcer content contract", () => {
  it("derives every recorded voice key from event variant counts", () => {
    for (const key of expandAnnouncerVoiceKeys(ANNOUNCER_EVENTS)) {
      expect(existsSync(path.join(VOICE_DIR, `${key}.opus`)), `missing ${key}.opus`).toBe(true);
    }
  });

  it("skips sting-only events with zero voice variants", () => {
    expect(
      expandAnnouncerVoiceKeys({
        sting_only: { voice: { key: "sting_only", variants: 0 } },
      }),
    ).toEqual([]);
  });

  it("gives every announcer event at least one English subtitle line", () => {
    for (const eventId of Object.keys(ANNOUNCER_EVENTS)) {
      expect(
        ANNOUNCER_LINES.en[eventId]?.length,
        `${eventId} has no English subtitle lines`,
      ).toBeGreaterThan(0);
    }
  });
});
