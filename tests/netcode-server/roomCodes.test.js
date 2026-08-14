// Private-room code generation and entry (FRIENDS-JOIN-1).
//
// Two properties matter more than the rest, because both failed in production on 08-01:
// a code must never collide with a built-in mode prefix (the room string *is* the mode),
// and two players must never be able to hold the same code in different cases and end up
// in different Durable Objects.

import { describe, expect, it } from "vitest";
import {
  generateRoomCode,
  isReservedRoomName,
  normalizeRoomCode,
  RESERVED_ROOM_PREFIXES,
  ROOM_CODE_DIGITS,
  ROOM_CODE_WORDS,
} from "../../shared/roomCodes.js";

/** Same alphabet and bounds resolvedPartyRoomFromUrl enforces on `?room=`. */
const ROOM_PATTERN = /^[A-Za-z0-9]{2,16}$/;

/** Every code the generator can possibly emit — exhaustive beats sampling for these asserts. */
function everyPossibleCode() {
  const out = [];
  for (const word of ROOM_CODE_WORDS) {
    for (const digit of ROOM_CODE_DIGITS) out.push(`${word}${digit}`);
  }
  return out;
}

describe("room code word list", () => {
  it("is all four-letter uppercase words with no duplicates", () => {
    for (const word of ROOM_CODE_WORDS) {
      expect(word, `${word} must be four uppercase letters`).toMatch(/^[A-Z]{4}$/);
    }
    expect(new Set(ROOM_CODE_WORDS).size).toBe(ROOM_CODE_WORDS.length);
  });

  it("omits the digits that are misread as letters", () => {
    expect(ROOM_CODE_DIGITS).not.toMatch(/[01]/);
    expect(ROOM_CODE_DIGITS).toMatch(/^[2-9]+$/);
  });
});

describe("generateRoomCode", () => {
  it("emits nothing malformed or reserved, across the entire code space", () => {
    for (const code of everyPossibleCode()) {
      expect(code, `${code} must be a legal room name`).toMatch(ROOM_PATTERN);
      expect(isReservedRoomName(code), `${code} must not be reserved`).toBe(false);
      expect(normalizeRoomCode(code), `${code} must survive its own validator`).toBe(code);
    }
  });

  it("draws from the word list and the digit set", () => {
    // * rng() === 0 picks the first of each; a value just under 1 picks the last.
    expect(generateRoomCode(() => 0)).toBe(`${ROOM_CODE_WORDS[0]}${ROOM_CODE_DIGITS[0]}`);
    const last = ROOM_CODE_WORDS[ROOM_CODE_WORDS.length - 1];
    expect(generateRoomCode(() => 0.999999)).toBe(`${last}${ROOM_CODE_DIGITS.at(-1)}`);
  });
});

describe("normalizeRoomCode", () => {
  it("resolves either case to one canonical room", () => {
    // * The failure this prevents: host on KALE7 and joiner on kale7 are two different
    // * Durable Objects, which looks identical to the 08-01 transposition split.
    expect(normalizeRoomCode("kale7")).toBe("KALE7");
    expect(normalizeRoomCode("KALE7")).toBe("KALE7");
    expect(normalizeRoomCode("KaLe7")).toBe("KALE7");
    expect(normalizeRoomCode("  kale7  ")).toBe("KALE7");
  });

  it("rejects reserved mode names whatever their case", () => {
    for (const raw of ["SOLO2", "solo2", "SoLo2", "solo", "SOLO"]) {
      expect(normalizeRoomCode(raw), `${raw} must be rejected`).toBeNull();
    }
    for (const raw of ["quickplay", "QUICKPLAY", "QuickPlay", "quickplay77"]) {
      expect(normalizeRoomCode(raw), `${raw} must be rejected`).toBeNull();
    }
    for (const raw of ["testdrive", "TESTDRIVE", "TestDrive9"]) {
      expect(normalizeRoomCode(raw), `${raw} must be rejected`).toBeNull();
    }
  });

  it("covers every declared reserved prefix", () => {
    for (const prefix of RESERVED_ROOM_PREFIXES) {
      expect(isReservedRoomName(prefix.toUpperCase())).toBe(true);
      expect(isReservedRoomName(`${prefix}9`)).toBe(true);
    }
  });

  it("rejects anything a URL could not carry", () => {
    for (const raw of ["", " ", "A", "KALE-7", "KALE 7", "KALE_7", "K".repeat(17), "kale7!"]) {
      expect(normalizeRoomCode(raw), `${JSON.stringify(raw)} must be rejected`).toBeNull();
    }
  });

  it("rejects non-strings instead of coercing them", () => {
    for (const raw of [null, undefined, 12345, {}, [], true]) {
      expect(normalizeRoomCode(/** @type {any} */ (raw))).toBeNull();
    }
  });
});
