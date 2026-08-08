/**
 * cartPreview.js — Three.js cart preview for the customization panel.
 *
 * Rave theme uses the shared GLTF cart (`cartRaveGltf.js`); other themes use procedural
 * `buildCart()` + `applyCartTheme()`. Color updates go through `applyThemeColorToCache`.
 */

import * as THREE from "three";
import { buildCart } from "../cart.js";
import { applyCartPattern } from "../cartPatterns.js";
import {
  resetRaveGltfCartVisualState,
  setEmissiveTrimMul,
  updateRaveGltfCartVisuals,
} from "../cartRaveGltf.js";
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
import { applyRendererColorGrading, resolveArenaExposure, setupSceneEnvironment } from "../scene.js";
import { getQualityKnobs } from "../utils/qualityTiers.js";
import {
  applyPreviewPlaceholderColor,
  disposePreviewCartGltf,
  isPreviewGltfCached,
  loadPreviewCartGltf,
  preparePreviewCartGltf,
} from "./cartPreviewGltf.js";
import { gameStore, RoundPhase } from "../stores/gameStore.js";

const ROTATION_SPEED_RAD_PER_SEC = 0.45;

/**
 * Attract backdrop over the shared canvas. Keep in lockstep with
 * `.cr-root.cr-root--attract::before { opacity }` in cart-rave-menu.css.
 * Menu cart pixels are drawn UNDER that layer, so the external pass lifts
 * exposure by 1/(1 − opacity) to land near Customize brightness without
 * punching a visible hole in the dim (hard rect = square of undimmed arena).
 */
const ATTRACT_BACKDROP_OPACITY = 0.42;

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

const SHOWROOM_FEINT_CYCLE_MS = 16000;
const SHOWROOM_FEINT_START_MS = 10400;
const SHOWROOM_FEINT_PREP_MS = 550;
const SHOWROOM_FEINT_RAM_MS = 400;
const SHOWROOM_FEINT_RECOVER_MS = 900;

/** @param {number} t @returns {number} */
function easeInOutCubic(t) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

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

    /** @type {boolean} Whether this preview created and must dispose `renderer`. */
    this._ownsRenderer = false;

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

    /** Reused render-state snapshots for the shared-renderer menu path. */
    this._savedViewport = new THREE.Vector4();
    this._savedScissor = new THREE.Vector4();

    /** Rest transform after centering; feint offsets are always relative to this. */
    this._showroomRestPosition = new THREE.Vector3();
    this._showroomLastPosition = new THREE.Vector3();
    this._showroomForward = new THREE.Vector3();
    this._showroomLinvel = new THREE.Vector3();
    this._showroomAngvel = new THREE.Vector3();
    this._showroomUp = new THREE.Vector3(0, 1, 0);
    this._showroomLastYaw = 0;
    this._showroomLastMs = 0;
    this._showroomAnimating = false;
    this._showroomCameraPush = 0;
    this._showroomLastCameraPush = 0;
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

    if (this.renderer || this.scene) {
      this.dispose();
    }

    this._disposed = false;
    this._ownsRenderer = true;
    this.container = container;

    const { width, height } = this._getContentSize();
    this._createScene(width, height);

    // * Preview obeys the quality tier like the main renderer: MSAA + full DPR are
    // * a hidden cost on phones (this canvas previously ignored quality entirely).
    const knobs = getQualityKnobs();
    this.renderer = new THREE.WebGLRenderer({ antialias: knobs.postFx, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, knobs.pixelRatioCap));
    this._resizeTo(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // * Match in-game grading (scene.js OutputPass path) so carts look identical in
    // * the customize preview and gameplay.
    applyRendererColorGrading(this.renderer);

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
   * Mounts a scene-only preview that borrows a caller-owned renderer. This mode
   * deliberately creates no canvas, ResizeObserver, or rAF loop; callers render it
   * from their existing frame path with {@link renderExternal}.
   *
   * @param {THREE.WebGLRenderer} renderer
   * @param {HTMLElement} container Viewport marker used to derive the scissor rectangle.
   */
  initExternal(renderer, container) {
    if (!renderer || !container) {
      throw new Error("CartPreview.initExternal: renderer and container are required");
    }
    if (this.renderer || this.scene) this.dispose();

    this._disposed = false;
    this._ownsRenderer = false;
    this.renderer = renderer;
    this.container = container;
    const { width, height } = this._getContentSize();
    this._createScene(width, height);

    // * PMREM textures belong to their creating WebGL context. This scene is disposed
    // * before Customize creates its own renderer, and rebuilt when it returns.
    const env = setupSceneEnvironment(renderer, this.scene);
    this._disposeEnvironment = env.dispose;

    this._showPlaceholder();
    this._setLoadingState(true);
    this._rebuildCart();
  }

  /**
   * Builds the context-independent preview scene. Renderer ownership stays with the
   * caller, which is why IBL setup happens in each public init path instead.
   * @param {number} width
   * @param {number} height
   * @private
   */
  _createScene(width, height) {
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
    this._captureShowroomRestPosition(group);

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
   * Matches the close, readable pose used by the Sunglasses customization tab.
   * Kept as a named pose so menu art and the tab cannot silently drift apart.
   */
  setHeroPose() {
    this.setAutoRotate(false);
    this.setZoom(1.35);
  }

  /**
   * Applies one deterministic showroom feint sample. It is presentation only:
   * no gameplay rigid body is touched, and the velocity passed to wheel/caster
   * cosmetics is derived from this visible trajectory rather than simulation.
   *
   * @param {number} elapsedMs Time since this menu showcase mounted.
   * @returns {boolean} Whether the feint is currently moving.
   */
  applyShowroomFeint(elapsedMs) {
    if (!this.cartGroup) return false;
    const phaseMs = ((elapsedMs % SHOWROOM_FEINT_CYCLE_MS) + SHOWROOM_FEINT_CYCLE_MS) % SHOWROOM_FEINT_CYCLE_MS;
    const prepEndMs = SHOWROOM_FEINT_START_MS + SHOWROOM_FEINT_PREP_MS;
    const ramEndMs = prepEndMs + SHOWROOM_FEINT_RAM_MS;
    const recoverEndMs = ramEndMs + SHOWROOM_FEINT_RECOVER_MS;
    if (phaseMs < SHOWROOM_FEINT_START_MS || phaseMs >= recoverEndMs) {
      this.resetShowroomFeint();
      return false;
    }

    let cameraPush = 0;
    let lean = 0;
    let yawOffset = 0;
    if (phaseMs < prepEndMs) {
      const p = easeInOutCubic((phaseMs - SHOWROOM_FEINT_START_MS) / SHOWROOM_FEINT_PREP_MS);
      cameraPush = -0.018 * p;
      lean = 0.055 * p;
      yawOffset = -0.05 * p;
    } else if (phaseMs < ramEndMs) {
      const p = easeInOutCubic((phaseMs - prepEndMs) / SHOWROOM_FEINT_RAM_MS);
      cameraPush = THREE.MathUtils.lerp(-0.018, 0.085, p);
      lean = THREE.MathUtils.lerp(0.055, -0.105, p);
      yawOffset = THREE.MathUtils.lerp(-0.05, 0.075, p);
    } else {
      const p = easeInOutCubic((phaseMs - ramEndMs) / SHOWROOM_FEINT_RECOVER_MS);
      cameraPush = THREE.MathUtils.lerp(0.085, 0, p);
      lean = THREE.MathUtils.lerp(-0.105, 0, p);
      yawOffset = THREE.MathUtils.lerp(0.075, 0, p);
    }

    const yaw = this._spinY + yawOffset;
    this._showroomForward.set(0, 0, -1).applyAxisAngle(this._showroomUp, yaw);
    // * `cartGroup.position` is the GLTF centering transform (see centerCartGroup),
    // * not a presentation parent. Keep it exact and sell the surge as a small camera
    // * push, otherwise the origin-framed preview throws the whole cart offscreen.
    this.cartGroup.position.copy(this._showroomRestPosition);
    this.cartGroup.rotation.set(lean, yaw, lean * 0.18);
    this._showroomCameraPush = cameraPush;

    const dtSec = this._showroomLastMs > 0
      ? Math.min(Math.max((elapsedMs - this._showroomLastMs) * 0.001, 1 / 240), 0.05)
      : 1 / 30;
    const linvelWorld = this._showroomLinvel.set(0, 0, 0);
    if (this._showroomAnimating) {
      linvelWorld.copy(this._showroomForward).multiplyScalar(
        (cameraPush - this._showroomLastCameraPush) / dtSec,
      );
    }
    const angvelWorld = this._showroomAngvel.set(0, (yaw - this._showroomLastYaw) / dtSec, 0);
    if (this._usesRaveGltf) {
      updateRaveGltfCartVisuals(this.cartGroup, linvelWorld, dtSec, angvelWorld);
    }
    this._showroomLastPosition.copy(this.cartGroup.position);
    this._showroomLastYaw = yaw;
    this._showroomLastMs = elapsedMs;
    this._showroomLastCameraPush = cameraPush;
    this._showroomAnimating = true;
    return true;
  }

  /** Restores the exact hero pose and releases presentation-only wheel/caster state. */
  resetShowroomFeint() {
    if (!this.cartGroup || !this._showroomAnimating) return;
    this.cartGroup.position.copy(this._showroomRestPosition);
    this.cartGroup.rotation.set(0, this._spinY, 0);
    if (this._usesRaveGltf) resetRaveGltfCartVisualState(this.cartGroup);
    this._showroomLastMs = 0;
    this._showroomCameraPush = 0;
    this._showroomLastCameraPush = 0;
    this._showroomAnimating = false;
  }

  /** @param {THREE.Group} group @private */
  _captureShowroomRestPosition(group) {
    this._showroomRestPosition.copy(group.position);
    this._showroomLastPosition.copy(group.position);
    this._showroomLastYaw = this._spinY;
    this._showroomLastMs = 0;
    this._showroomCameraPush = 0;
    this._showroomLastCameraPush = 0;
    this._showroomAnimating = false;
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
      if (!(child instanceof THREE.Mesh)) return;
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
        if (!(child instanceof THREE.Mesh)) return;
        const ud = child.userData || {};
        if (ud.isSharedGeometry) return;
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
      // * Pattern is baked into the CartFrame material — clear to "classic" to disable it.
      applyCartPattern(cart, "classic", this._neonHex);
    }

    centerCartGroup(cart);
    this._captureShowroomRestPosition(cart);
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
      this._captureShowroomRestPosition(cart);

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
      // * FIX-EMISSIVE — before the recolor, and unconditionally: the Customize screen switches
      // * pattern without rebuilding the cart, so a birth-set multiplier would go stale in both
      // * directions (classic→patterned and back).
      setEmissiveTrimMul(this._materialCache, this._patternId, this.cartGroup);
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

    if (this._ownsRenderer) this.renderer?.dispose();

    if (this._ownsRenderer && this.renderer?.domElement?.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }

    this.container = null;
    this.renderer = null;
    this._ownsRenderer = false;
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
    if (this._ownsRenderer) this.renderer.setSize(w, h, false);

    if (this.cartGroup) {
      const target = frameCartInCamera(this.camera, this.cartGroup, w / h, this._zoomMultiplier);
      if (this._showroomCameraPush !== 0) {
        this.camera.position.sub(target).multiplyScalar(1 - this._showroomCameraPush).add(target);
      }
    }
  }

  /**
   * Draws this scene into its container's rectangle on the borrowed renderer.
   * This must be called after the owner's final composer/direct arena pass.
   *
   * Viewport/scissor coords are CSS (logical) pixels. Three multiplies them by
   * the renderer pixel ratio itself — pre-scaling by drawing-buffer size double-
   * applies DPR and slides the cart off the right edge on Windows scaling / high-DPI.
   *
   * @param {THREE.WebGLRenderer} renderer
   * @returns {"rendered"|"unavailable"|"tooSmall"|"targetNonNull"}
   */
  renderExternal(renderer) {
    if (
      this._disposed
      || this._ownsRenderer
      || renderer !== this.renderer
      || !this.container
      || !this.scene
      || !this.camera
    ) {
      return "unavailable";
    }

    // * The composer should have returned to the default framebuffer before this
    // * direct pass. Never draw into an unknown intermediate target.
    if (renderer.getRenderTarget() !== null) return "targetNonNull";

    const holderRect = this.container.getBoundingClientRect();
    const canvasRect = renderer.domElement.getBoundingClientRect();
    if (holderRect.width < 1 || holderRect.height < 1 || canvasRect.width < 1 || canvasRect.height < 1) {
      return "tooSmall";
    }

    // * Logical pixels relative to the canvas CSS box (Three setViewport/setScissor
    // * contract). Y is from the bottom edge, matching WebGL / Three.
    const x = holderRect.left - canvasRect.left;
    const y = canvasRect.bottom - holderRect.bottom;
    const width = holderRect.width;
    const height = holderRect.height;
    if (width < 1 || height < 1) return "tooSmall";

    this._resizeTo(width, height);
    renderer.getViewport(this._savedViewport);
    renderer.getScissor(this._savedScissor);
    const wasScissorTest = renderer.getScissorTest();
    const wasAutoClear = renderer.autoClear;
    const prevExposure = renderer.toneMappingExposure;
    try {
      renderer.autoClear = false;
      renderer.setViewport(x, y, width, height);
      renderer.setScissor(x, y, width, height);
      renderer.setScissorTest(true);
      // * Customize grade × attract-dim compensation. No solid clear (box) and
      // * no CSS hole in the dim (undimmed arena square). Depth-only so the cart
      // * floats on the arena with a soft ground disk, not a hard rect.
      const transmit = 1 - ATTRACT_BACKDROP_OPACITY;
      renderer.toneMappingExposure = resolveArenaExposure() / Math.max(transmit, 0.01);
      renderer.clearDepth();
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.toneMappingExposure = prevExposure;
      renderer.setViewport(this._savedViewport);
      renderer.setScissor(this._savedScissor);
      renderer.setScissorTest(wasScissorTest);
      renderer.autoClear = wasAutoClear;
    }
    return "rendered";
  }

  /**
   * Pauses the preview rendering loop when UI is hidden.
   */
  pause() {
    this._paused = true;
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * Resumes the preview rendering loop when UI is shown.
   */
  resume() {
    if (!this._paused || this._disposed) return;
    this._paused = false;
    this._lastFrameTime = performance.now();
    if (this._rafId == null) {
      this._rafId = requestAnimationFrame(this._tick);
    }
  }

  /** @private */
  _tick(now) {
    if (this._disposed || this._paused) return;

    // * Skip rendering when match is running or container is hidden/detached from DOM.
    const currentPhase = gameStore.getState().roundPhase;
    if (currentPhase !== RoundPhase.LOBBY) {
      this._rafId = requestAnimationFrame(this._tick);
      return;
    }

    if (this.container) {
      const isDetached = !document.body.contains(this.container);
      const isZeroBox = this.container.offsetWidth === 0 && this.container.offsetHeight === 0;
      if (isDetached || isZeroBox) {
        this._rafId = requestAnimationFrame(this._tick);
        return;
      }
    }

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
