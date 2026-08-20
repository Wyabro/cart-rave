/// <reference path="./env.d.ts" />
// QP-PLAYING-1 — CartRaveServer.playingCount() + GET /api/playing.

import { beforeAll, describe, expect, it } from "vitest";
import { setPlayingShardNamesOverride } from "../../party/beaconLimit.ts";
import { cartRaveStub, requestPath } from "./beaconClient.js";
import { connectAndSeat } from "./wsClient.js";

beforeAll(() => {
  // * Do not instantiate all 20 public shards in this isolate — that stalls
  // * sibling timing tests (playReady ceiling). The walk is unit-tested.
  // * Leave the override on: a sibling afterAll that restores the full list
  // * races GET /api/playing in this pool.
  setPlayingShardNamesOverride([]);
});

function uniqueRoom(label) {
  return `qpnow-${label}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

describe("CartRaveServer.playingCount", () => {
  it("counts a seated human and returns 0 after they leave", async () => {
    const room = uniqueRoom("seat");
    const stub = cartRaveStub(room);
    expect(await stub.playingCount()).toBe(0);

    const seated = await connectAndSeat(room, {
      name: "NOW",
      color: "pink",
      ip: "10.0.90.1",
    });
    expect(await stub.playingCount()).toBe(1);

    seated.client.close();
    await seated.client.awaitClose();
    const deadline = Date.now() + 2000;
    let n = 1;
    while (Date.now() < deadline) {
      n = await stub.playingCount();
      if (n === 0) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(n).toBe(0);
  });
});

describe("GET /api/playing", () => {
  it("returns JSON { n } with an 8s cache header", async () => {
    const res = await requestPath("/api/playing");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("cache-control")).toMatch(/max-age=8/);
    const body = await res.json();
    expect(body).toEqual({ n: expect.any(Number) });
    expect(body.n).toBeGreaterThanOrEqual(0);
  });

  it("rejects non-GET", async () => {
    expect((await requestPath("/api/playing", { method: "POST" })).status).toBe(405);
  });
});
