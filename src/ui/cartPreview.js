/**
 * cartPreview.js — Three.js cart preview for the customization panel.
 *
 * Rave theme uses the shared GLTF cart (`cartRaveGltf.js`); other themes use procedural
 * `buildCart()` + `applyCartTheme()`. Color updates go through `applyThemeColorToCache`.
 */

import * as THREE from "three";
import { buildCart } from "../cart.js";
import { applyCartPattern } from "../cartPatterns.js";
import { DEFAULT_CART_PATTERN, normalizePatternId } from "../cartPatternConfig.js";
import {
  DEFAULT_CART_THEME,
  DEFAULT_SUNGLASSES_STYLE,
  getCartTheme,
  normalizeThemeId,
  resolveSunglassesStyle,
} from "../cartThemeConfig.js";
import {
  applyCartTheme,
  applyThemeColorToCache,
  buildCartThemeMaterialCache,
  disposeCartThemeResources,
} from "../cartThemes.js";
import { setupSceneEnvironment } from "../scene.js";
import {
  applyPreviewPlaceholderColor,
  disposePreviewCartGltf,
  isPreviewGltfCached,
  loadPreviewCartGltf,
  preparePreviewCartGltf,
} from "./cartPreviewGltf.js";

const ROTATION_SPEED_RAD_PER_SEC = 0.45;

/**
 * @param {number | string} value
 * @returns {number}
 */
function parseHexColor(value) {
  if (typeof value === "number") return value;
  const digits = String(value).trim().replace(/^#/, "");
  return parseInt(digits, 16);
}

/** Uniform padding around the cart in frame (1 = tight, >1 = more breathing room). */
const FRAME_PADDING = 1.16;
/** Fraction of cart height for the fixed look-at point on the Y-spin axis. */
const LOOK_AT_Y_RATIO = 0.36;
/** Camera elevation above the look-at target, in radians. */
const CAMERA_ELEVATION = 0.2;
/** Camera azimuth around the cart, in radians (~49° — balances perspective foreshortening). */
const CAMERA_AZIMUTH = 0.85;

/**
 * Centers the cart footprint on the origin with wheel bottoms at y = 0.
 *
 * @param {THREE.Group} root
 */
function centerCartGroup(root) {
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -bounds.min.y, -center.z);
}

/**
 * Frames the cart using its world bounding sphere so padding stays even while it spins.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Group} cartGroup
 * @param {number} viewportAspect
 * @param {number} [zoomMultiplier=1] - >1 moves camera closer (divides distance)
 * @returns {THREE.Vector3} look-at target used for this frame
 */
function frameCartInCamera(camera, cartGroup, viewportAspect, zoomMultiplier = 1) {
  const bounds = new THREE.Box3().setFromObject(cartGroup);
  const size = bounds.getSize(new THREE.Vector3());

  const target = new THREE.Vector3(0, size.y * LOOK_AT_Y_RATIO, 0);

  const spinRadius = Math.hypot(size.x, size.z) * 0.5;
  const spinHalfHeight = size.y * 0.5;
  const orbitRadius = Math.hypot(spinRadius, spinHalfHeight) * FRAME_PADDING;

  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const fitHeightDistance = orbitRadius / Math.tan(fovRad * 0.5);
  const fitWidthDistance = orbitRadius / (Math.tan(fovRad * 0.5) * Math.max(viewportAspect, 0.01));
  const distance = Math.max(fitHeightDistance, fitWidthDistance) / Math.max(zoomMultiplier, 0.01);

  const cosElev = Math.cos(CAMERA_ELEVATION);
  camera.position.set(
    target.x + Math.sin(CAMERA_AZIMUTH) * distance * cosElev,
    target.y + Math.sin(CAMERA_ELEVATION) * distance,
    target.z + Math.cos(CAMERA_AZIMUTH) * distance * cosElev,
  );
  camera.lookAt(target);

  return target;
}

/**
 * Small rotating cart preview renderer for UI panels.
 */
export class CartPreview {
  constructor() {
    /** @type {HTMLElement | null} */
    this.container = null;

    /** @type {THREE.WebGLRenderer | null} */
    this.renderer = null;

    /** @type {THREE.Scene | null} */
    this.scene = null;

    /** @type {THREE.PerspectiveCamera | null} */
    this.camera = null;

    /** @type {THREE.Group | null} */
    this.cartGroup = null;

    /** @type {import("../cartThemes.js").CartThemeMaterialCache | null} */
    this._materialCache = null;

    /** @type {THREE.Group | null} */
    this._stageGroup = null;

    /** @type {number | null} */
    this._rafId = null;

    /** @type {ResizeObserver | null} */
    this._resizeObserver = null;

    /** @type {number} */
    this._lastFrameTime = 0;

    /** @type {string} */
    this._themeId = DEFAULT_CART_THEME;

    /** @type {string} */
    this._patternId = DEFAULT_CART_PATTERN;

    /** @type {string} */
    this._sunglassesStyle = DEFAULT_SUNGLASSES_STYLE;

    /** @type {number} */
    this._neonHex = 0xff2bd6;

    /** @type {(() => void) | null} */
    this._disposeEnvironment = null;

    /** @type {boolean} */
    this._disposed = false;

    /** @type {boolean} */
    this._isBuilding = false;

    /** @type {boolean} */
    this._needsRebuild = false;

    /** @type {number} */
    this._loadSeq = 0;

    /** @type {THREE.Group | null} */
    this._placeholderGroup = null;

    /** @type {THREE.MeshStandardMaterial | null} */
    this._placeholderMat = null;

    /** @type {boolean} */
    this._gltfReady = false;

    /** @type {boolean} */
    this._usesRaveGltf = false;

    /** @type {number} Cumulative Y spin (radians) — survives cart mesh swaps. */
    this._spinY = 0;

    /** @type {boolean} Whether the cart auto-rotates in the tick loop. */
    this._autoRotate = true;

    /** @type {number} Camera distance divisor (1.0 = default, 1.35 = 35% closer). */
    this._zoomMultiplier = 1;
  }

  /**
   * Mounts the preview into `container` and starts the render loop.
   *
   * @param {HTMLElement} container
   */
  init(container) {
    if (!container) {
      throw new Error("CartPreview.init: container is required");
    }

    if (this.renderer) {
      this.dispose();
    }

    this._disposed = false;
    this.container = container;

    const { width, height } = this._getContentSize();

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 50);

    const hemi = new THREE.HemisphereLight(0x9eb8ff, 0x1a0a1e, 0.42);
    this.scene.add(hemi);

    const ambient = new THREE.AmbientLight(0xffffff, 0.28);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(2.8, 4.5, 3.5);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x88ccff, 0.45);
    fillLight.position.set(-3, 2.2, 1.5);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xff44dd, 0.5);
    rimLight.position.set(-0.5, 2.5, -4.2);
    this.scene.add(rimLight);

    this._stageGroup = new THREE.Group();
    const groundGeo = new THREE.CircleGeometry(1.85, 48);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0a0612,
      metalness: 0.15,
      roughness: 0.94,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.002;
    this._stageGroup.add(ground);

    const shadowGeo = new THREE.CircleGeometry(0.95, 32);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    const shadowDisk = new THREE.Mesh(shadowGeo, shadowMat);
    shadowDisk.rotation.x = -Math.PI / 2;
    shadowDisk.position.y = 0.008;
    shadowDisk.renderOrder = 1;
    this._stageGroup.add(shadowDisk);
    this.scene.add(this._stageGroup);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._resizeTo(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const env = setupSceneEnvironment(this.renderer, this.scene);
    this._disposeEnvironment = env.dispose;

    this.renderer.domElement.classList.add("cr-cart-preview-canvas");

    container.appendChild(this.renderer.domElement);
    this._syncCanvasLayout();

    this._resizeObserver = new ResizeObserver(() => {
      this._syncCanvasLayout();
    });
    this._resizeObserver.observe(container);

    this._lastFrameTime = performance.now();
    this._tick = this._tick.bind(this);
    this._rafId = requestAnimationFrame(this._tick);

    this._showPlaceholder();
    this._setLoadingState(true);
    this._rebuildCart();
  }

  /**
   * Toggles CSS loading state on the holder.
   * @param {boolean} loading
   * @private
   */
  _setLoadingState(loading) {
    this.container?.classList.toggle("cr-cart-preview-loading", loading);
  }

  /**
   * Instantly visible low-poly stand-in while the GLTF downloads/parses.
   * @private
   */
  _showPlaceholder() {
    this._clearPlaceholder();

    const group = new THREE.Group();
    group.name = "CartPlaceholder";
    group.userData.isPlaceholder = true;

    const geo = new THREE.BoxGeometry(1.35, 1.05, 1.85);
    const mat = new THREE.MeshStandardMaterial({
      color: this._neonHex,
      emissive: this._neonHex,
      emissiveIntensity: 1.15,
      metalness: 0.55,
      roughness: 0.16,
      toneMapped: false,
    });
    applyPreviewPlaceholderColor(mat, this._neonHex);

    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    centerCartGroup(group);

    this._placeholderGroup = group;
    this._placeholderMat = mat;
    this.cartGroup = group;
    this._gltfReady = false;
    this.scene?.add(group);

    this._applySpinRotation();

    if (this.camera && this.renderer) {
      const { width, height } = this._getContentSize();
      frameCartInCamera(this.camera, group, width / height, this._zoomMultiplier);
    }
  }

  /** @private */
  _applySpinRotation() {
    if (this.cartGroup) {
      this.cartGroup.rotation.y = this._spinY;
    }
  }

  /**
   * Enables or disables auto-rotation of the cart preview.
   * When disabled, the cart resets to face forward.
   *
   * @param {boolean} isEnabled
   */
  setAutoRotate(isEnabled) {
    this._autoRotate = Boolean(isEnabled);
    if (!this._autoRotate) {
      this._spinY = Math.PI + 0.37;
      this._applySpinRotation();
    }
  }

  /**
   * Zooms the cart by adjusting camera distance. 1.0 = default, >1 = tighter.
   * Triggers an immediate camera re-frame when a cart mesh is mounted.
   *
   * @param {number} multiplier
   */
  setZoom(multiplier) {
    this._zoomMultiplier = multiplier;
    if (this.cartGroup && this.camera && this.renderer) {
      const { width, height } = this._getContentSize();
      frameCartInCamera(this.camera, this.cartGroup, width / height, multiplier);
    }
  }

  /**
   * @private
   */
  _clearPlaceholder() {
    if (!this._placeholderGroup) return;

    if (this.cartGroup === this._placeholderGroup) {
      this.cartGroup = null;
    }

    this.scene?.remove(this._placeholderGroup);
    this._placeholderGroup.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose?.();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) m?.dispose?.();
    });

    this._placeholderGroup = null;
    this._placeholderMat = null;
  }

  /**
   * @private
   */
  _disposeCurrentCart() {
    if (!this.cartGroup) return;

    if (this._usesRaveGltf) {
      disposePreviewCartGltf(this.cartGroup);
    } else {
      disposeCartThemeResources(this.cartGroup);
      const disposedGeos = new Set();
      const disposedMats = new Set();
      this.cartGroup.traverse((child) => {
        if (!child.isMesh) return;
        const ud = child.userData || {};
        if (ud.isSharedGeometry || ud.sharesCartFrameGeometry) {
          if (ud.isCartPatternLayer && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) {
              if (m && !disposedMats.has(m)) {
                disposedMats.add(m);
                m.dispose?.();
              }
            }
          }
          return;
        }
        if (child.geometry && !disposedGeos.has(child.geometry)) {
          disposedGeos.add(child.geometry);
          child.geometry.dispose?.();
        }
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (m && !disposedMats.has(m) && !ud.isWheel) {
            disposedMats.add(m);
            m.dispose?.();
          }
        }
      });
    }

    this.scene?.remove(this.cartGroup);
    this.cartGroup = null;
    this._materialCache = null;
    this._gltfReady = false;
    this._usesRaveGltf = false;
  }

  /**
   * Sync rebuild for non-rave procedural themes.
   * @private
   */
  _rebuildProceduralCart() {
    this._clearPlaceholder();
    this._setLoadingState(false);
    this._disposeCurrentCart();

    const cart = buildCart(this._neonHex);
    applyCartTheme(cart, this._themeId, this._neonHex);
    applyCartPattern(cart, this._patternId, this._neonHex);

    const theme = getCartTheme(this._themeId);
    if (theme.patternPolicy === "disable") {
      const patternMesh = cart.getObjectByName("CartFramePattern");
      if (patternMesh) patternMesh.visible = false;
    }

    centerCartGroup(cart);
    this._materialCache = buildCartThemeMaterialCache(cart);
    applyThemeColorToCache(this._materialCache, this._themeId, this._neonHex);

    this.cartGroup = cart;
    this._gltfReady = true;
    this._usesRaveGltf = false;
    this.scene?.add(cart);
    this._applySpinRotation();

    if (this.camera && this.renderer) {
      const { width, height } = this._getContentSize();
      frameCartInCamera(this.camera, cart, width / height, this._zoomMultiplier);
    }
  }

  /**
   * Loads/replaces the GLTF preview cart for the current theme (async — stale loads are ignored).
   * @private
   */
  async _rebuildCart() {
    if (!this.scene) return;

    if (this._isBuilding) {
      this._needsRebuild = true;
      return;
    }

    if (normalizeThemeId(this._themeId) !== "rave") {
      this._rebuildProceduralCart();
      return;
    }

    const seq = ++this._loadSeq;
    const themeId = this._themeId;
    const gltfCached = isPreviewGltfCached(themeId);
    /** @type {THREE.Group | null} */
    let retiringCart = null;

    if (this._gltfReady && this.cartGroup) {
      if (gltfCached) {
        retiringCart = this.cartGroup;
        this.cartGroup = null;
        this._materialCache = null;
        this._gltfReady = false;
        this._usesRaveGltf = false;
      } else {
        this._disposeCurrentCart();
      }
    }

    if (!this._placeholderGroup && !gltfCached) {
      this._showPlaceholder();
    }
    this._setLoadingState(!gltfCached);

    this._isBuilding = true;
    try {
      const cart = await loadPreviewCartGltf(themeId, this._sunglassesStyle);
      if (
        seq !== this._loadSeq
        || this._disposed
        || !this.scene
        || this._themeId !== themeId
      ) {
        disposePreviewCartGltf(cart);
        if (retiringCart) {
          this.scene.add(retiringCart);
          this.cartGroup = retiringCart;
          this._gltfReady = true;
        }
        this._isBuilding = false;
        if (this._needsRebuild) {
          this._needsRebuild = false;
          this._rebuildCart();
        }
        return;
      }

      // * Read color/pattern after await so syncCartPreviewLook() can update them while loading.
      this._materialCache = preparePreviewCartGltf(
        cart,
        themeId,
        this._neonHex,
        this._patternId,
      );
      centerCartGroup(cart);

      this._clearPlaceholder();
      if (retiringCart) {
        this.scene.remove(retiringCart);
        disposePreviewCartGltf(retiringCart);
      }
      this.cartGroup = cart;
      this._gltfReady = true;
      this._usesRaveGltf = true;
      this.scene.add(cart);
      this._applySpinRotation();
      this._applyNeonColor();
      this._setLoadingState(false);

      if (this.camera && this.renderer) {
        const { width, height } = this._getContentSize();
        frameCartInCamera(this.camera, cart, width / height, this._zoomMultiplier);
      }

      this._isBuilding = false;
      if (this._needsRebuild) {
        this._needsRebuild = false;
        this._rebuildCart();
      }
    } catch (err) {
      console.warn("[CartPreview] GLTF load failed — showing placeholder:", err);
      this._setLoadingState(false);
      if (this._placeholderMat) {
        applyPreviewPlaceholderColor(this._placeholderMat, this._neonHex);
      }
      this._isBuilding = false;
      if (this._needsRebuild) {
        this._needsRebuild = false;
        this._rebuildCart();
      }
    }
  }

  /**
   * Applies the current neon color to the cached theme materials and pattern overlay.
   * @private
   */
  _applyNeonColor() {
    if (!this._gltfReady) {
      if (this._placeholderMat) {
        applyPreviewPlaceholderColor(this._placeholderMat, this._neonHex);
      }
      return;
    }

    if (this._materialCache) {
      applyThemeColorToCache(this._materialCache, this._themeId, this._neonHex);
    }
    if (this.cartGroup) {
      applyCartPattern(this.cartGroup, this._patternId, this._neonHex);
    }
  }

  /**
   * Switches the preview cart theme (unknown ids fall back to default).
   *
   * @param {string} themeId
   */
  setTheme(themeId) {
    this._themeId = normalizeThemeId(themeId);
    this._rebuildCart();

    if (import.meta.env?.DEV) {
      console.debug("[CartPreview] setTheme:", themeId, "→", this._themeId);
    }
  }

  /**
   * Sets the player neon color shown on the cart.
   *
   * @param {number | string | null} hexOrNull — e.g. `0xff2bd6`, `"#ff2bd6"`, or `null` for default pink
   * @returns {number}
   */
  setColor(hexOrNull) {
    this._neonHex = hexOrNull == null ? 0xff2bd6 : parseHexColor(hexOrNull);
    this._applyNeonColor();

    if (import.meta.env?.DEV) {
      console.debug("[CartPreview] setColor:", hexOrNull, "→", `0x${this._neonHex.toString(16)}`);
    }

    return this._neonHex;
  }

  /**
   * Sets the wireframe pattern overlay id.
   *
   * @param {string} patternId
   */
  setPattern(patternId) {
    this._patternId = normalizePatternId(patternId);
    if (this._gltfReady && this.cartGroup) {
      applyCartPattern(this.cartGroup, this._patternId, this._neonHex);
    }
  }

  /**
   * Sets the sunglasses "Mirror Finish" style applied to the rave GLTF face assembly.
   * The style is baked into the cloned GLTF instance materials, so changing it requires
   * a full cart rebuild. Callers that are about to trigger their own rebuild (e.g. via
   * {@link setTheme}) can pass `{ rebuild: false }` to just update the stored field.
   *
   * @param {string} styleId — SunglassesStyleDef id (unknown ids fall back to silver mirror)
   * @param {{ rebuild?: boolean }} [options]
   */
  setSunglassesStyle(styleId, { rebuild = true } = {}) {
    const resolved = resolveSunglassesStyle(styleId).id;
    const changed = resolved !== this._sunglassesStyle;
    this._sunglassesStyle = resolved;
    if (changed && rebuild) {
      this._rebuildCart();
    }

    if (import.meta.env?.DEV) {
      console.debug("[CartPreview] setSunglassesStyle:", styleId, "→", this._sunglassesStyle, "rebuild=", rebuild);
    }
  }

  /**
   * @returns {import("../cartThemeConfig.js").CartThemeDef}
   */
  getCurrentTheme() {
    return getCartTheme(this._themeId);
  }

  /**
   * @returns {string}
   */
  getCurrentThemeId() {
    return this._themeId;
  }

  /**
   * Stops the loop and releases GPU/DOM resources.
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    this._resizeObserver?.disconnect();
    this._resizeObserver = null;

    if (this._usesRaveGltf && this.cartGroup) {
      disposePreviewCartGltf(this.cartGroup);
      this.scene?.remove(this.cartGroup);
    } else {
      this._clearPlaceholder();
      if (this.cartGroup) this._disposeCurrentCart();
    }
    this._loadSeq += 1;
    this.cartGroup = null;
    this._materialCache = null;
    this._gltfReady = false;
    this._usesRaveGltf = false;

    this.container?.classList.remove("cr-cart-preview-loading");

    this._disposeObjectGroup(this._stageGroup);

    this._disposeEnvironment?.();
    this._disposeEnvironment = null;

    this.renderer?.dispose();

    if (this.renderer?.domElement?.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }

    this.container = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this._stageGroup = null;
  }

  /**
   * Releases geometries/materials for a scene subtree (stage only).
   * @param {THREE.Object3D | null} group
   * @private
   */
  _disposeObjectGroup(group) {
    if (!group) return;

    const geometries = new Set();
    const materials = new Set();

    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.geometry) geometries.add(obj.geometry);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (mat) materials.add(mat);
      }
    });

    for (const geo of geometries) geo.dispose();
    for (const mat of materials) mat.dispose();
    this.scene?.remove(group);
  }

  /**
   * Drawable area inside the holder — matches the absolutely positioned canvas inset.
   * @returns {{ width: number, height: number }}
   * @private
   */
  _getContentSize() {
    if (!this.container) return { width: 1, height: 1 };

    const canvas = this.renderer?.domElement;
    if (canvas?.parentElement === this.container) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w > 0 && h > 0) return { width: w, height: h };
    }

    const style = getComputedStyle(this.container);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);

    return {
      width: Math.max(this.container.clientWidth - padX, 1),
      height: Math.max(this.container.clientHeight - padY, 1),
    };
  }

  /**
   * Sizes the drawing buffer to the canvas element's laid-out CSS box.
   * @private
   */
  _syncCanvasLayout() {
    if (!this.renderer || !this.camera) return;

    const { width, height } = this._getContentSize();
    this._resizeTo(width, height);
  }

  /**
   * @param {number} width
   * @param {number} height
   * @private
   */
  _resizeTo(width, height) {
    if (!this.renderer || !this.camera) return;

    const w = Math.max(width, 1);
    const h = Math.max(height, 1);

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);

    if (this.cartGroup) {
      frameCartInCamera(this.camera, this.cartGroup, w / h, this._zoomMultiplier);
    }
  }

  /** @private */
  _tick(now) {
    if (this._disposed) return;

    const dt = Math.min((now - this._lastFrameTime) * 0.001, 0.05);
    this._lastFrameTime = now;

    if (this._autoRotate) {
      this._spinY += ROTATION_SPEED_RAD_PER_SEC * dt;
      this._applySpinRotation();
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }

    this._rafId = requestAnimationFrame(this._tick);
  }
}
