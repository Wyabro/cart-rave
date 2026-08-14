// devUnlockParam.test.js — SEC-UNLOCK-1: what a ?devUnlocks= URL is allowed to write.
//
// Every case is asserted against BOTH isDev values. That is the whole point: vitest runs
// with import.meta.env.DEV === true, so a test that let the resolver read DEV internally
// would pass vacuously and prove nothing about production.

import { describe, expect, it } from "vitest";
import { resolveDevUnlockParam } from "../../src/unlockConfig.js";

const dev = (search) => resolveDevUnlockParam(search, true);
const prod = (search) => resolveDevUnlockParam(search, false);

describe("resolveDevUnlockParam", () => {
  it("honours ?devUnlocks=off in every build — prod FTUE playtests need it", () => {
    expect(dev("?devUnlocks=off")).toBe("off");
    expect(prod("?devUnlocks=off")).toBe("off");
  });

  it("applies ?devUnlocks=all in dev but NEVER in prod", () => {
    expect(dev("?devUnlocks=all")).toBe("all");
    expect(prod("?devUnlocks=all")).toBeNull();
  });

  it("gates =all the same way inside a mixed query string", () => {
    // A shared link rarely arrives as a bare param — utm tags, room codes, etc.
    expect(dev("?devUnlocks=all&foo=1")).toBe("all");
    expect(prod("?devUnlocks=all&foo=1")).toBeNull();
    expect(dev("?foo=1&devUnlocks=all&bar=2")).toBe("all");
    expect(prod("?foo=1&devUnlocks=all&bar=2")).toBeNull();
  });

  it("still finds =off when it is not the first param", () => {
    expect(dev("?foo=1&devUnlocks=off")).toBe("off");
    expect(prod("?foo=1&devUnlocks=off")).toBe("off");
  });

  it("ignores unknown values, missing params and an empty search", () => {
    for (const search of ["?devUnlocks=yes", "?devUnlocks=", "?devUnlocks", "?foo=1", "", "?"]) {
      expect(dev(search)).toBeNull();
      expect(prod(search)).toBeNull();
    }
  });

  it("treats a null/undefined search as no-op rather than throwing", () => {
    expect(dev(undefined)).toBeNull();
    expect(prod(null)).toBeNull();
  });

  it("is case-sensitive — ?devUnlocks=ALL is not a grant", () => {
    expect(dev("?devUnlocks=ALL")).toBeNull();
    expect(prod("?devUnlocks=ALL")).toBeNull();
  });
});
