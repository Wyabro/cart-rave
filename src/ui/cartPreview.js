/**
 * cartPreview.js — Self-contained Three.js cart preview for the customization panel.
 *
 * Intentionally independent of game bootstrap, physics, netcode, and cart.js.
 * Swap `buildPlaceholderCart()` for real models or import shared builders later.
 */

import * as THREE from "three";

/**
 * @typedef {Object} CartPreviewTheme
 * @property {string} id — stable key for persistence and `setTheme()`
 * @property {string} name — human label for future UI selectors
 * @property {number} bodyColor — basket/body tint (hex)
 * @property {number} [accentColor] — reserved for trim, patterns, emissive rims, VFX
 */

/**
 * Initial themed-cart palette for the customization preview.
 *
 * Extension path:
 * - Add per-theme `modelBuilder` fns to swap the placeholder for glTF/procedural meshes.
 * - Add `materialOverrides` for chassis/wheels/handle when a skin needs more than body color.
 * - Add `effects` hooks (particles, rim light tint) keyed by theme id in `_applyTheme()`.
 *
 * @type {Record<string, CartPreviewTheme>}
 */
export const CART_PREVIEW_THEMES = {
  rave: {
    id: "rave",
    name: "Rave",
    bodyColor: 0xff2bd6,
    accentColor: 0x22e6ff,
  },
  liminal: {
    id: "liminal",
    name: "Liminal",
    bodyColor: 0xc8d86a,
    accentColor: 0xf0ead6,
  },
  tropical: {
    id: "tropical",
    name: "Tropical",
    bodyColor: 0xff6b4a,
    accentColor: 0x2ee6c8,
  },
  "sci-fi": {
    id: "sci-fi",
    name: "Sci-fi",
    bodyColor: 0x00e5ff,
    accentColor: 0x7b61ff,
  },
  ghost: {
    id: "ghost",
    name: "Ghost",
    bodyColor: 0xb8c9e0,
    accentColor: 0xe8f4ff,
  },
  vintage: {
    id: "vintage",
    name: "Vintage",
    bodyColor: 0xc9a227,
    accentColor: 0x8b5a2b,
  },
};

/** @type {readonly string[]} */
export const CART_PREVIEW_THEME_IDS = Object.freeze(Object.keys(CART_PREVIEW_THEMES));

export const DEFAULT_CART_PREVIEW_THEME_ID = "rave";

/**
 * @param {string | null | undefined} themeId
 * @returns {CartPreviewTheme}
 */
export function resolveCartPreviewTheme(themeId) {
  if (themeId && CART_PREVIEW_THEMES[themeId]) {
    return CART_PREVIEW_THEMES[themeId];
  }
  return CART_PREVIEW_THEMES[DEFAULT_CART_PREVIEW_THEME_ID];
}

/**
 * @param {string | null | undefined} themeId
 * @returns {CartPreviewTheme}
 */
export function getCartPreviewTheme(themeId) {
  return resolveCartPreviewTheme(themeId);
}

/**
 * @returns {CartPreviewTheme[]}
 */
export function listCartPreviewThemes() {
  return CART_PREVIEW_THEME_IDS.map((id) => CART_PREVIEW_THEMES[id]);
}

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
 * Builds a minimal procedural cart: basket, chassis rails, and four vertical wheels.
 * Centers geometry on the group origin so the preview camera can frame it evenly.
 *
 * @returns {{ root: THREE.Group, bodyMesh: THREE.Mesh }}
 */
function buildPlaceholderCart() {
  const root = new THREE.Group();

  const wheelRadius = 0.24;
  const wheelHeight = 0.17;
  const halfTrackW = 0.5;
  const halfTrackL = 0.62;
  const wheelCenterY = wheelRadius;

  const defaultBodyColor = CART_PREVIEW_THEMES[DEFAULT_CART_PREVIEW_THEME_ID].bodyColor;
  const bodyMat = new THREE.MeshStandardMaterial({
    color: defaultBodyColor,
    emissive: defaultBodyColor,
    emissiveIntensity: 0.4,
    metalness: 0.3,
    roughness: 0.4,
  });
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a44,
    metalness: 0.8,
    roughness: 0.3,
  });
  const wheelTireMat = new THREE.MeshStandardMaterial({
    color: 0x111114,
    metalness: 0.2,
    roughness: 0.8,
  });
  const wheelHubMat = new THREE.MeshStandardMaterial({
    color: 0x888892,
    metalness: 0.9,
    roughness: 0.2,
  });
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x050505,
    metalness: 0.9,
    roughness: 0.2,
  });

  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelHeight, 18);
  const hubGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.45,
    wheelRadius * 0.45,
    wheelHeight * 1.08,
    12,
  );

  const wheelPositions = [
    [-halfTrackW, wheelCenterY, -halfTrackL],
    [halfTrackW, wheelCenterY, -halfTrackL],
    [-halfTrackW, wheelCenterY, halfTrackL],
    [halfTrackW, wheelCenterY, halfTrackL],
  ];

  for (const [x, y, z] of wheelPositions) {
    const tire = new THREE.Mesh(wheelGeo, wheelTireMat);
    tire.position.set(x, y, z);
    root.add(tire);

    const hub = new THREE.Mesh(hubGeo, wheelHubMat);
    hub.position.set(x, y, z);
    root.add(hub);
  }

  const chassisY = wheelRadius + wheelHeight * 0.35;
  const railGeo = new THREE.BoxGeometry(0.07, 0.055, 1.28);
  const leftRail = new THREE.Mesh(railGeo, chassisMat);
  leftRail.position.set(-halfTrackW, chassisY, 0);
  root.add(leftRail);

  const rightRail = new THREE.Mesh(railGeo, chassisMat);
  rightRail.position.set(halfTrackW, chassisY, 0);
  root.add(rightRail);

  const crossGeo = new THREE.BoxGeometry(halfTrackW * 2 + 0.07, 0.05, 0.07);
  for (const z of [-halfTrackL * 0.85, halfTrackL * 0.85]) {
    const cross = new THREE.Mesh(crossGeo, chassisMat);
    cross.position.set(0, chassisY, z);
    root.add(cross);
  }

  const basketHalfH = 0.42;
  const basketCenterY = chassisY + 0.1 + basketHalfH;
  const bodyGeo = new THREE.BoxGeometry(1.1, basketHalfH * 2, 1.55);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = basketCenterY;
  root.add(bodyMesh);

  const handleGeo = new THREE.BoxGeometry(0.5, 0.06, 0.06);
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(0, basketCenterY + basketHalfH + 0.05, halfTrackL * 0.55);
  root.add(handle);

  // * Center once: origin at X/Z footprint center, wheel bottoms at y=0.
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const offset = new THREE.Vector3(center.x, bounds.min.y, center.z);
  for (const child of root.children) {
    child.position.sub(offset);
  }

  return { root, bodyMesh };
}

/**
 * Frames the cart using its world bounding sphere so padding stays even while it spins.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Group} cartGroup
 * @param {number} viewportAspect
 * @returns {THREE.Vector3} look-at target used for this frame
 */
function frameCartInCamera(camera, cartGroup, viewportAspect) {
  const bounds = new THREE.Box3().setFromObject(cartGroup);
  const size = bounds.getSize(new THREE.Vector3());

  // * Fixed pivot on the Y-spin axis — bbox sphere center drifts with asymmetric handle mass.
  const target = new THREE.Vector3(0, size.y * LOOK_AT_Y_RATIO, 0);

  // * Y-spin envelope: use the diagonal footprint so corners never clip during rotation.
  const spinRadius = Math.hypot(size.x, size.z) * 0.5;
  const spinHalfHeight = size.y * 0.5;
  const orbitRadius = Math.hypot(spinRadius, spinHalfHeight) * FRAME_PADDING;

  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const fitHeightDistance = orbitRadius / Math.tan(fovRad * 0.5);
  const fitWidthDistance = orbitRadius / (Math.tan(fovRad * 0.5) * Math.max(viewportAspect, 0.01));
  const distance = Math.max(fitHeightDistance, fitWidthDistance);

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

    /** @type {THREE.Mesh | null} */
    this.bodyMesh = null;

    /** @type {THREE.Group | null} */
    this._stageGroup = null;

    /** @type {number | null} */
    this._rafId = null;

    /** @type {ResizeObserver | null} */
    this._resizeObserver = null;

    /** @type {number} */
    this._lastFrameTime = 0;

    /** @type {string} */
    this._themeId = DEFAULT_CART_PREVIEW_THEME_ID;

    /** @type {boolean} When true, `setColor()` owns the basket paint; `setTheme()` won't replace it. */
    this._colorOverrideActive = false;

    /** @type {number | null} */
    this._colorOverrideHex = null;

    /** @type {boolean} */
    this._disposed = false;
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
    this._colorOverrideActive = false;
    this._colorOverrideHex = null;
    this.container = container;

    const { width, height } = this._getContentSize();

    // * Scene graph — transparent so the CSS-framed holder provides the backdrop.
    this.scene = new THREE.Scene();
    this.scene.background = null;

    // * Camera — framed to the cart's centered bounds with a little headroom.
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 50);

    // * Lighting — hemisphere base + key/fill + magenta rim for depth and neon edge read.
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

    // * Stage — dark ground disc + soft contact shadow so the cart feels grounded.
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

    // * Placeholder cart — replace `buildPlaceholderCart` with real assets when ready.
    const { root, bodyMesh } = buildPlaceholderCart();
    this.cartGroup = root;
    this.bodyMesh = bodyMesh;
    this.scene.add(this.cartGroup);
    frameCartInCamera(this.camera, this.cartGroup, width / height);

    // * Renderer — alpha:true lets the menu CSS frame show through the viewport.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._resizeTo(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

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

    this.setTheme(DEFAULT_CART_PREVIEW_THEME_ID);
  }

  /**
   * Paints the basket mesh, respecting manual color override when active.
   * @private
   */
  _applyBodyColor() {
    if (!this.bodyMesh?.material) return;

    const hex = this._colorOverrideActive
      ? this._colorOverrideHex
      : this.getCurrentTheme().bodyColor;

    if (hex != null) {
      const mat = /** @type {THREE.MeshStandardMaterial} */ (this.bodyMesh.material);
      mat.color.setHex(hex);
      mat.emissive.setHex(hex);
    }
  }

  /**
   * Applies theme-specific visuals that are not manual paint (models, trim, effects).
   *
   * @param {CartPreviewTheme} theme
   * @private
   */
  _applyTheme(theme) {
    // * Future: accentColor → emissive trim, hub caps, ground glow, or attached props.
    // * Future: if (theme.modelBuilder) swap `this.cartGroup` subtree and re-center in buildPlaceholderCart().
    void theme;

    if (!this._colorOverrideActive) {
      this._applyBodyColor();
    }
  }

  /**
   * Switches the preview cart style/theme (unknown ids fall back to default).
   * Does not clear an active manual color override.
   *
   * @param {string} themeId
   * @returns {CartPreviewTheme} resolved theme that was applied
   */
  setTheme(themeId) {
    const theme = resolveCartPreviewTheme(themeId);
    this._themeId = theme.id;
    this._applyTheme(theme);

    if (import.meta.env?.DEV) {
      console.debug("[CartPreview] setTheme:", themeId, "→", theme.id);
    }

    return theme;
  }

  /**
   * Sets basket paint directly. Pass `null` to clear override and use the theme's `bodyColor`.
   *
   * @param {number | string | null} hexOrNull — e.g. `0xff2bd6`, `"#ff2bd6"`, or `null`
   * @returns {number} hex color now on the basket
   */
  setColor(hexOrNull) {
    if (hexOrNull === null) {
      this._colorOverrideActive = false;
      this._colorOverrideHex = null;
    } else {
      this._colorOverrideActive = true;
      this._colorOverrideHex = parseHexColor(hexOrNull);
    }

    this._applyBodyColor();

    if (import.meta.env?.DEV) {
      const hex = this._colorOverrideActive ? this._colorOverrideHex : this.getCurrentTheme().bodyColor;
      console.debug(
        "[CartPreview] setColor:",
        hexOrNull,
        "→",
        `0x${(hex ?? 0).toString(16)}`,
        this._colorOverrideActive ? "(override)" : "(theme)",
      );
    }

    return this._colorOverrideActive
      ? /** @type {number} */ (this._colorOverrideHex)
      : this.getCurrentTheme().bodyColor;
  }

  /**
   * @returns {boolean}
   */
  hasColorOverride() {
    return this._colorOverrideActive;
  }

  /**
   * @returns {CartPreviewTheme}
   */
  getCurrentTheme() {
    return resolveCartPreviewTheme(this._themeId);
  }

  /**
   * @returns {string}
   */
  getCurrentThemeId() {
    return this.getCurrentTheme().id;
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

    this._disposeObjectGroup(this.cartGroup);
    this._disposeObjectGroup(this._stageGroup);

    this.renderer?.dispose();

    if (this.renderer?.domElement?.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }

    this.container = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.cartGroup = null;
    this.bodyMesh = null;
    this._stageGroup = null;
  }

  /**
   * Releases geometries/materials for a scene subtree.
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
      frameCartInCamera(this.camera, this.cartGroup, w / h);
    }
  }

  /** @private */
  _tick(now) {
    if (this._disposed) return;

    const dt = Math.min((now - this._lastFrameTime) * 0.001, 0.05);
    this._lastFrameTime = now;

    if (this.cartGroup) {
      this.cartGroup.rotation.y += ROTATION_SPEED_RAD_PER_SEC * dt;
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }

    this._rafId = requestAnimationFrame(this._tick);
  }
}
