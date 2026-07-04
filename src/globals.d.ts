/// <reference types="vite/client" />

import * as Three from 'three';

declare global {
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

  // Extend the Window interface with custom Cart Rave globals
  interface Window {
    __cartRaveBootstrapped?: boolean;
    __cartRaveCancelBootError?: () => void;
    __cartRaveShowBootError?: (message: string) => void;
    __cartRaveShedBootSplash?: () => void;
    __cartRaveTryStartMenuMusic?: () => void;
    __cartRaveCustomizationStorageSync?: boolean;
    __cartRaveSendErrorLog?: (error: Error) => void;
    __cartRave_togglePostFx?: (enabled: boolean) => void;
    __cartRave_toggleLowQuality?: (enabled: boolean) => void;
    __cartRaveMainReady?: boolean;
    CartRave?: any;
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
    _labelText?: string;
    _labelColor?: string;
    _labelBadgeKey?: string;
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


