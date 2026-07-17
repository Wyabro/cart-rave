/// <reference types="vite/client" />

import * as Three from 'three';

declare global {
  type CartClashDevResult =
    | { ok: true; message: string }
    | {
      ok: false;
      reason: "host-required" | "round-not-running" | "diagnostics-required" | "bad-args" | "unknown";
      message: string;
    };

  /**
   * Build identity injected by vite.config.js `define` (see src/utils/buildInfo.js).
   * Undefined in contexts without the define (unit tests, tools).
   */
  const __CC_BUILD__: { version: string | null; sha: string; builtAt: string } | undefined;

  // Loosen DOM query return types — this is a game, all DOM queries target HTMLElements.
  // Prevents ~160 Element vs HTMLElement narrowing errors from checkJs.
  interface ParentNode {
    querySelector(selectors: string): HTMLElement | null;
    querySelectorAll(selectors: string): NodeListOf<HTMLElement>;
  }
  interface Document {
    querySelector(selectors: string): HTMLElement | null;
    querySelectorAll(selectors: string): NodeListOf<HTMLElement>;
    getElementById(elementId: string): HTMLElement | null;
  }

  // Extend Window with boot/menu bridge globals.
  // Product name is Cart Clash; __cartRave* / CartRave remain for compatibility (docs/brand.md).
  interface Window {
    __cartRaveBootstrapped?: boolean;
    __cartRaveCancelBootError?: () => void;
    __cartRaveShowBootError?: (message: string) => void;
    __cartRaveShedBootSplash?: () => void;
    __cartRaveTryStartMenuMusic?: () => void;
    __cartRaveCustomizationStorageSync?: boolean;
    __cartRaveSendErrorLog?: (error: Error) => void;
    __cartRaveMainReady?: boolean;
    /**
     * Visual QA harness (URL ?harness=1 / shoot tools). See src/utils/visualHarness.js.
     */
    __cartRave?: {
      version: number;
      ready: boolean;
      worldReady: boolean;
      error: string | null;
      frame: number;
      params: Record<string, unknown>;
      stats: () => Record<string, unknown>;
      settle: (n?: number) => Promise<void>;
      reapplyAblation: () => string[];
      applyCam: () => boolean;
      sampleBlack: (opts?: { maxDim?: number; threshold?: number }) => Promise<{
        ratio: number;
        black: number;
        total: number;
        maxRun: number;
        width: number;
        height: number;
      }>;
      isCameraLocked: () => boolean;
      ensureWorld: () => Promise<void>;
    };
    /** Netcode E2E harness (URL ?nettest=1). See src/utils/netTestHarness.js + tools/netharness.mjs. */
    __ccTest?: any;
    /** Netcode-harness active flag (?nettest=1) — gates loop-liveness counters. */
    __ccNetTest?: boolean;
    /** Netcode-harness loop-liveness counters (only when __ccNetTest or __ccDiagActive). */
    __ccLoopDbg?: { frames: number; resumeZeroed: number; chronicSlow?: number; maxDt: number; lastDt: number };
    /**
     * Unified diagnostics hub (URL ?diag=1). Read-only probes + event log; DEV-only control
     * levers. See src/utils/diagnostics.js + src/utils/gameplayDiagnostics.js + tools/gameharness.mjs.
     */
    __ccDiag?: {
      version: number;
      active: boolean;
      flags: Record<string, unknown>;
      probes: () => string[];
      snapshot: (ns?: string) => any;
      events: (sinceSeq?: number) => Array<{ seq: number; t: number; ch: string; type: string; [k: string]: unknown }>;
      tail: number;
      captureBundle: (meta?: { scenario?: string; reason?: string }) => Record<string, unknown>;
      /** Auto-captured bundles (error/assert triggers) — bounded, newest last. */
      captures: () => Array<Record<string, unknown>>;
      control: {
        rewindRoundClock?: (remainMs?: number) => CartClashDevResult;
        grantKos?: (level: string, n: number) => CartClashDevResult;
        setScores?: (scores: Record<number, number>) => CartClashDevResult;
        forceSuddenDeath?: () => CartClashDevResult;
      } | null;
    };
    /** Diagnostics active flag (?diag=1) — gates loop-liveness counters + zero-cost event recording. */
    __ccDiagActive?: boolean;
    CartRave?: any;
    /** Preferred product API alias of CartRave. */
    CartClash?: any;
    /**
     * Dev progression override (unlock all cosmetics/levels).
     * See `src/unlockConfig.js` and `isDevUnlockAll()` in unlockStore.
     */
    CartClashDevUnlocks?: {
      isActive: () => boolean;
      enableAll: () => void;
      enableGates: () => void;
      clear: () => void;
      help: () => void;
    };
    /** DEV-only developer command registry mirror. */
    CartClashDev?: {
      help: (filter?: string) => string;
      run: (line: string) => CartClashDevResult;
      suggest: (prefix?: string) => string[];
    };
    /**
     * Agent-facing water-death FX debug handle (Sundial Station).
     * See `src/effects/waterDeathFx.js`.
     */
    CartClashWaterFx?: {
      getActiveWaterFxCount: () => number;
      getWaterDeathSurfaceY: () => number | null;
      spawnWaterDeathBurst: (x: number, z: number, neonHex: number) => void;
    };
    /**
     * DEV-only Living Cargo debug handle — live per-cart cargo/spill-boost state.
     * See `updateCargoLoad()` in `src/cargoLoad.js`.
     */
    __cartClashCargo?: () => Array<{
      slot: number;
      label: string;
      fullness: number;
      fillCount: number | null;
      bayVisible: boolean | null;
      spillBoostMsLeft: number;
      hasSpilled: boolean;
    } | null>;
    recordMesh?: Three.Mesh;
    exportArenaFloorGLB?: () => void;
    exportPhysicsGeometry?: () => void;
    cartRaveLevel?: string;
    bootStartTime?: number;
    bootTimer?: number;
  }

  // Re-export THREE types as a global namespace for JSDoc annotations
  namespace THREE {
    type Scene = Three.Scene;
    type Object3D = Three.Object3D;
    type PerspectiveCamera = Three.PerspectiveCamera;
    type WebGLRenderer = Three.WebGLRenderer;
    type Vector3 = Three.Vector3;
    type Vector2 = Three.Vector2;
    type Color = Three.Color;
    type Euler = Three.Euler;
    type Quaternion = Three.Quaternion;
    type Mesh = Three.Mesh;
    type MeshStandardMaterial = Three.MeshStandardMaterial;
    type Material = Three.Material;
    type Group = Three.Group;
    type Raycaster = Three.Raycaster;
    type AudioListener = Three.AudioListener;
    type Audio = Three.Audio;
    type PositionalAudio = Three.PositionalAudio;
    type AnimationMixer = Three.AnimationMixer;
    type AnimationClip = Three.AnimationClip;
    type LoopOnce = typeof Three.LoopOnce;
    type LoopRepeat = typeof Three.LoopRepeat;
  }
  interface EventTarget {
    closest?(selector: string): HTMLElement | null;
    value?: string;
    disabled?: boolean;
    isContentEditable?: boolean;
    style?: CSSStyleDeclaration;
  }
  interface Event {
    detail?: any;
  }
  interface HTMLElement {
    disabled?: boolean;
  }

  // Re-export THREE types as a global namespace for JSDoc annotations
  namespace THREE {
    type Scene = Three.Scene;
    type Object3D = Three.Object3D;
    type PerspectiveCamera = Three.PerspectiveCamera;
    type WebGLRenderer = Three.WebGLRenderer;
    type Vector3 = Three.Vector3;
    type Vector2 = Three.Vector2;
    type Color = Three.Color;
    type Euler = Three.Euler;
    type Quaternion = Three.Quaternion;
    type Mesh = Three.Mesh;
    type MeshStandardMaterial = Three.MeshStandardMaterial;
    type Material = Three.Material;
    type Group = Three.Group;
    type Raycaster = Three.Raycaster;
    type AudioListener = Three.AudioListener;
    type Audio = Three.Audio;
    type PositionalAudio = Three.PositionalAudio;
    type AnimationMixer = Three.AnimationMixer;
    type AnimationClip = Three.AnimationClip;
    type LoopOnce = typeof Three.LoopOnce;
    type LoopRepeat = typeof Three.LoopRepeat;
    type ShaderPass = any;
  }
}

declare module 'three' {
  interface Object3D {
    isMesh?: boolean;
    isGroup?: boolean;
    isLight?: boolean;
    material?: any;
    geometry?: any;
    _labelHtml?: string;
    _labelColor?: string;
  }
  interface Pass {
    material?: any;
  }
}

declare module '@dimforge/rapier3d' {
  interface RigidBody {
    setCanSleep?: (canSleep: boolean) => void;
  }
}

// * Same API surface as standard; loaded preferentially when wasm simd128 is available.
declare module '@dimforge/rapier3d-simd' {
  export * from '@dimforge/rapier3d';
  export { default } from '@dimforge/rapier3d';
}


// Augment tweakpane v4 types with v3-era API methods still in use
declare module 'tweakpane' {
  interface Pane {
    addFolder(config: any): Pane;
    addButton(config: any): any;
    addBinding(target: any, key?: any, params?: any): any;
    refresh(): void;
  }
}

declare module 'three/examples/jsm/environments/RoomEnvironment.js' {
  import * as Three from 'three';
  export class RoomEnvironment extends Three.Scene {
    constructor(renderer?: Three.WebGLRenderer);
  }
}

declare module 'three/examples/jsm/postprocessing/UnrealBloomPass.js' {
  interface UnrealBloomPass {
    highPassUniforms?: Record<string, any>;
  }
}


