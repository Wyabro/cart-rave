import { describe, expect, it, beforeEach, vi } from "vitest";
import * as THREE from "three";
import {
  registerMirrorExclude,
  clearMirrorExcludes,
  getMirrorExcludeCount,
  installCheapMirrorPass,
} from "../src/utils/cheapMirror.js";

describe("cheapMirror (cart-first, no skip)", () => {
  beforeEach(() => {
    clearMirrorExcludes();
  });

  it("registers unique exclude roots", () => {
    const a = new THREE.Group();
    const b = new THREE.Group();
    registerMirrorExclude(a);
    registerMirrorExclude(a);
    registerMirrorExclude(b);
    registerMirrorExclude(null);
    expect(getMirrorExcludeCount()).toBe(2);
    clearMirrorExcludes();
    expect(getMirrorExcludeCount()).toBe(0);
  });

  it("always runs the base reflection pass (no budget skip)", () => {
    const reflector = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    const base = vi.fn();
    reflector.onBeforeRender = base;
    installCheapMirrorPass(reflector);
    reflector.onBeforeRender({}, {}, {});
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("hides exclude roots during the pass and restores them", () => {
    const crowd = new THREE.Group();
    crowd.visible = true;
    registerMirrorExclude(crowd);

    const reflector = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    let sawHidden = false;
    reflector.onBeforeRender = () => {
      sawHidden = crowd.visible === false;
    };
    installCheapMirrorPass(reflector);
    reflector.onBeforeRender({}, {}, {});

    expect(sawHidden).toBe(true);
    expect(crowd.visible).toBe(true);
  });
});
