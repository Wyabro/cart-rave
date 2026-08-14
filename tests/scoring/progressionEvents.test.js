import { describe, expect, it } from "vitest";

import { PROGRESSION_EVENTS } from "../../src/progression/eventIds.js";
import {
  CUSTOM_COLOR_UNLOCK,
  PATTERN_UNLOCKS,
  SUNGLASSES_UNLOCKS,
} from "../../src/unlockConfig.js";
import { CHALLENGE_POOL } from "../../src/stores/challengeStore.js";

const KNOWN_EVENT_IDS = new Set(Object.values(PROGRESSION_EVENTS));

describe("progression event vocabulary", () => {
  it("contains every challenge goal event", () => {
    for (const challenge of CHALLENGE_POOL) {
      expect(
        KNOWN_EVENT_IDS.has(challenge.event),
        `${challenge.id} references unknown event ${challenge.event}`,
      ).toBe(true);
    }
  });

  it("contains every lifetime unlock goal event", () => {
    const unlockGoals = [
      ...Object.values(PATTERN_UNLOCKS),
      ...Object.values(SUNGLASSES_UNLOCKS),
      CUSTOM_COLOR_UNLOCK,
    ].filter((goal) => goal.event);

    for (const goal of unlockGoals) {
      expect(KNOWN_EVENT_IDS.has(goal.event), `unknown unlock event ${goal.event}`).toBe(true);
    }
  });
});
