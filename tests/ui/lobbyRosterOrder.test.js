import { describe, expect, it } from "vitest";
import { orderLobbyRosterRows } from "../../src/ui/lobbyRosterOrder.js";

function row(slotIndex, kind, connId = null) {
  return { slotIndex, kind, connId, slotName: `P${slotIndex}` };
}

describe("orderLobbyRosterRows", () => {
  const bot0 = row(0, "npc");
  const later = row(1, "human", "later");
  const bot2 = row(2, "npc");
  const first = row(3, "human", "first");
  const seats = [bot0, later, bot2, first];

  it("keeps seat order when joinOrder is missing or empty", () => {
    expect(orderLobbyRosterRows(seats, null).map((r) => r.slotIndex)).toEqual([0, 1, 2, 3]);
    expect(orderLobbyRosterRows(seats, []).map((r) => r.slotIndex)).toEqual([0, 1, 2, 3]);
  });

  it("lists humans first in connect order, then bots in seat order", () => {
    const ordered = orderLobbyRosterRows(seats, ["first", "later"]);
    expect(ordered.map((r) => r.connId || r.kind)).toEqual(["first", "later", "npc", "npc"]);
    expect(ordered.map((r) => r.slotIndex)).toEqual([3, 1, 0, 2]);
  });

  it("ignores unseated ids in joinOrder", () => {
    const ordered = orderLobbyRosterRows(seats, ["ghost", "first", "later"]);
    expect(ordered.map((r) => r.connId)).toEqual(["first", "later", null, null]);
  });

  it("parks humans missing from joinOrder after ranked humans, still before bots", () => {
    const stray = row(1, "human", "stray");
    const ranked = row(3, "human", "first");
    const ordered = orderLobbyRosterRows([bot0, stray, bot2, ranked], ["first"]);
    expect(ordered.map((r) => r.connId || r.kind)).toEqual(["first", "stray", "npc", "npc"]);
  });
});
