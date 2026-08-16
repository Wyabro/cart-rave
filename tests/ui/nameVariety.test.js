import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NPC_NAME_PERSONALITY, NPC_NAME_POOL } from "../../shared/npcNames.js";

const menuSource = readFileSync(
  new URL("../../src/ui/cart-rave-menu.js", import.meta.url),
  "utf8",
);

function quotedStrings(source) {
  return [...source.matchAll(/"([A-Za-z0-9]+)"/g)].map((match) => match[1]);
}

function menuArray(name, endMarker) {
  const start = menuSource.indexOf(`const ${name} = [`);
  const end = menuSource.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return menuSource.slice(start, end);
}

describe("NAME-VARIETY-1 pools", () => {
  it("adds 10 personality-mapped NPC names without duplicates", () => {
    const additions = {
      Cartillery: "aggressor",
      SlamSpecial: "aggressor",
      EndcapCreep: "lurker",
      AisleAmbush: "lurker",
      ParkingProwl: "lurker",
      CouponClaw: "scavenger",
      DealSnatcher: "scavenger",
      BulkCollector: "scavenger",
      Cartastrophe: "chaotic",
      LooseWheels: "chaotic",
    };

    expect(NPC_NAME_POOL).toHaveLength(70);
    expect(new Set(NPC_NAME_POOL).size).toBe(NPC_NAME_POOL.length);
    for (const [name, personality] of Object.entries(additions)) {
      expect(NPC_NAME_POOL).toContain(name);
      expect(NPC_NAME_PERSONALITY[name]).toBe(personality);
    }
  });

  it("adds 10 distinct first-run player names outside the NPC pool", () => {
    const playerNames = quotedStrings(menuArray("PLAYER_NAME_POOL", "const CLIENT_NPC_NAME_SET"));
    const additions = [
      "AisleAce",
      "CartJockey",
      "BulkBrawler",
      "ReceiptRiot",
      "CheckoutKO",
      "RimRebel",
      "TrolleyBoss",
      "ShelfStorm",
      "BargainBash",
      "CartComet",
      "CartCaptain",
    ];

    expect(playerNames).toHaveLength(50);
    expect(new Set(playerNames).size).toBe(playerNames.length);
    expect(playerNames.every((name) => name.length <= 12)).toBe(true);
    expect(additions.every((name) => playerNames.includes(name))).toBe(true);
    expect(playerNames.some((name) => NPC_NAME_POOL.includes(name))).toBe(false);
  });

  it("adds five prefixes and five suffixes for 380 unique reroll combinations", () => {
    const source = menuArray("HANDLE_PARTS", "const rollHandle");
    const [prefixSource, suffixSource] = source.match(/\[[^\[\]]*\]/g) ?? [];
    const prefixes = quotedStrings(prefixSource);
    const suffixes = quotedStrings(suffixSource);
    const capitalize = (word) => word[0] + word.slice(1).toLowerCase();
    const combinations = prefixes.flatMap((prefix) =>
      suffixes.map((suffix) => `${capitalize(prefix)}${capitalize(suffix)}`),
    );

    expect(prefixes).toHaveLength(19);
    expect(suffixes).toHaveLength(20);
    expect(prefixes).toEqual(expect.arrayContaining(["AISLE", "BULK", "DEAL", "RACK", "RECEIPT"]));
    expect(suffixes).toEqual(expect.arrayContaining(["BANDIT", "BRAWLER", "JOCKEY", "REBEL", "ROCKET"]));
    expect(new Set(combinations).size).toBe(380);
  });
});
