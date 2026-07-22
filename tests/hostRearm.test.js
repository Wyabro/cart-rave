// hostRearm.test.js — pure host-repair plan for dead-host paths.

import { describe, expect, it } from "vitest";
import { planHostRearm } from "../party/hostRearm.ts";

function slotsHuman(...connIds) {
  return connIds.map((connId) => ({ connId, kind: "human" }));
}

describe("planHostRearm", () => {
  it("no-ops when hostId is null", () => {
    expect(
      planHostRearm(null, new Set(["a"]), ["a"], slotsHuman("a"), "lobby"),
    ).toEqual({
      hostWasDead: false,
      nextHostId: null,
      resetCountdownToLobby: false,
    });
  });

  it("no-ops when the host is still live", () => {
    expect(
      planHostRearm("a", new Set(["a", "b"]), ["a", "b"], slotsHuman("a", "b"), "countdown"),
    ).toEqual({
      hostWasDead: false,
      nextHostId: "a",
      resetCountdownToLobby: false,
    });
  });

  it("picks the next oldest live human when the host is dead", () => {
    expect(
      planHostRearm("a", new Set(["b"]), ["a", "b"], slotsHuman("a", "b"), "running"),
    ).toEqual({
      hostWasDead: true,
      nextHostId: "b",
      resetCountdownToLobby: false,
    });
  });

  it("returns null successor when no live human remains", () => {
    expect(
      planHostRearm("a", new Set(), ["a"], slotsHuman("a"), "lobby"),
    ).toEqual({
      hostWasDead: true,
      nextHostId: null,
      resetCountdownToLobby: false,
    });
  });

  it("requests lobby reset when the host dies during countdown", () => {
    expect(
      planHostRearm("a", new Set(["b"]), ["a", "b"], slotsHuman("a", "b"), "countdown"),
    ).toEqual({
      hostWasDead: true,
      nextHostId: "b",
      resetCountdownToLobby: true,
    });
  });

  it("does not request lobby reset during lobby or running", () => {
    for (const phase of ["lobby", "running", "podium"]) {
      expect(
        planHostRearm("a", new Set(["b"]), ["a", "b"], slotsHuman("a", "b"), phase)
          .resetCountdownToLobby,
      ).toBe(false);
    }
  });
});
