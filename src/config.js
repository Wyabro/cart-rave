/**
 * config.js — Central game configuration for Cart Rave.
 *
 * Last tuned: 2026-06-22
 *
 * Main sections:
 *   - CONFIG_VERSION     — bump when tuning values change materially (debug / diff aid)
 *   - CONFIG             — runtime settings (debug, net, camera, audio, scoring, physics)
 *   - CONFIG.physics     — grouped physics / arena / cart tuning (flat aliases on CONFIG.*)
 *   - BASELINE_CONFIG    — snapshot of core driving feel for A/B comparisons
 *   - CART_COLORS / PALETTE — immutable cart color palette ("Original Rave")
 *   - MSG                — PartyKit wire-protocol message type strings
 *   - PARTYKIT_PUBLIC_HOST — deployed PartyKit host
 *
 * Spawn ring radius and spawn height are computed after CONFIG is defined (see bottom).
 */

/** @type {string} Bump when physics or net tuning changes materially. */
const CONFIG_VERSION = "2026.06.22";

const physics = {
  gravity: -24, // m/s² — world Y acceleration
  fixedTimeStep: 1 / 60, // seconds — Rapier substep dt
  maxSubsteps: 4, // count — max physics substeps per frame

  record: {
    radius: 26.4, // meters — outer dancefloor ring
    innerRadius: 3.63, // meters — center hole
    thickness: 0.6, // meters — collider / mesh depth
    y: -0.3, // meters — floor center height
    rotationSpeedRadPerSec: 0.35, // rad/s — visual mesh spin
    physicsSpinRadPerSec: 0.08, // rad/s — host-applied floor tangential push
    friction: 0.8, // unitless — high values catch on trimesh seams and cause grip-hop
    restitution: 0.05, // unitless — bounce on floor contact
    color: 0x050006,
    rimColor: 0xff2bd6,
    // * Center-hole suck/assist toggle. Levels with a solid center (e.g. Backrooms
    // * Supermarket) set enabled=false so carts are not pulled down at the origin.
    centerHole: { enabled: true },
    surface: {
      concentricRings: {
        count: 96,
        lineWidth: 0.018, // meters
        color: 0x2a2a32,
        yOffset: 0.3, // meters — above floor top
        innerRadius: 7.15, // meters
        outerRadius: 25.9, // meters
      },
      spindleRing: {
        enabled: true,
        innerRadius: 3.3, // meters
        outerRadius: 3.7, // meters
        color: 0xffffff,
        yOffset: 0.3, // meters
      },
    },
    // * Physics-only hole clearance (visual mesh unchanged). Tuned to reduce center-hole
    // * sticking and random hopping while keeping a protective expanded collision hole.
    physics: {
      chamferWidth: 0.35, // meters — radial width of the inner hole chamfer ramp
      holeClearance: 0.45, // meters — modest physics hole expansion beyond visual inner radius
      outerBevel: 0.12, // meters
      segments: 72, // count — radial collision mesh segments
    },
  },

  // * Host-applied hole response — only active when cart footprint overhangs playInnerR.
  holeAssist: {
    lowFrictionBandM: 1.5, // meters — overhang depth ramp for inward/down assist
    lowFriction: 0.05, // unitless — cart friction while overhanging the physics lip
    approachDownAccel: 5.0, // m/s² — base downward nudge once overhanging
    fallThroughAccel: 16.0, // m/s² — extra downward pull at full overhang (commit → 1)
    unstickAccel: 32.0, // m/s² — inward pull off the chamfer lip (scaled ×0.3 × commit)
  },

  cart: {
    size: { x: 1.31, y: 1.35, z: 2.26 }, // meters — collider half-extents basis
    spawnHeight: 1.077, // meters — overridden below from booth geometry
    friction: 1.1, // unitless — Mongoose-style grip
    restitution: 0.3, // unitless
    linearDamping: 0.6, // 1/s — light, agile coast
    angularDamping: 1.2, // 1/s — tippy but not endless spin
    maxPitchRoll: 4.5, // rad/s — reference limit; sim clamp disabled for V1 tipping
    visualOffset: 0.82, // meters — mesh Y offset from body origin
    collider: {
      hyReduction: 0.25, // meters — subtract from half-height for physics collider
      localYOffset: 0.13, // meters — collider translation Y in body space
      roundRadius: 0.08, // meters — roundCuboid corner radius (Mongoose-style bounce)
    },
    rigidBody: {
      canSleep: false, // bool — keep carts awake for responsive physics
      // pitch, yaw, roll, wake — Rapier setEnabledRotations args (not applied; V1 tipping)
      enabledRotations: [true, true, true, true],
    },

    ramBoost: {
      enabled: true,
      durationSec: 1.7, // seconds — nitro active window (enough to close + connect)
      cooldownSec: 3.1, // seconds — recharge; ~35% duty cycle
      boostedMaxSpeed: 27, // m/s — +~15% over base; punchy without runaway speed
      boostedAccel: 205, // m/s² — snappy surge; null falls back to accel × multiplier
      nitroGripFactor: 0.78, // unitless — lateral grip while nitro + throttle forward
      launchAccelMul: 1.38, // unitless — extra accel during opening burst
      launchWindowSec: 0.2, // seconds — launch burst window from nitro start
      nitroDriftMul: 1.12, // unitless — drift impulse scale while nitro active
      streakDurationSec: 0.4, // seconds — short afterimage, blends with cart
      streakSpawnRatePerSec: 20, // particles/s — nitro trail spawn rate
      streakLengthMeters: 2.3, // meters — speed-line segment length
      streakRadiusMeters: 0.015, // meters — thin core line width
      streakTipRadiusScale: 0.12, // unitless — taper to point at trailing tip
      streakGlowRadiusMul: 2.1, // unitless — subtle outer halo vs core
      streakGlowOpacity: 0.32, // unitless — soft halo (keeps trails cart-adjacent)
      streakCoreOpacity: 0.56, // unitless — core line transparency
      streakSaturationMul: 1.1, // unitless — near cart color, slightly richer
      streakBrightnessMul: 1.06, // unitless — mild lightness punch for readability
      streakSecondaryChance: 0.15, // unitless — occasional twin streak
      streakMaxActive: 80, // count — global streak cap (perf guard)
      streakPulseHz: 12, // Hz — subtle shimmer on active streaks
      npc: {
        enabled: true,
        alignmentAngleDeg: 13.2, // degrees — aim cone toward target
        minTargetDistance: 3.6, // meters
        maxTargetDistance: 19.8, // meters
      },

      // * Auto-Charge Boost — tap to charge, auto-releases at full charge.
      // * Replaces the instant nitro for human carts (mobile-friendly one-tap flow).
      // * NPCs keep instant boost via the instant flag on triggerRamBoost.
      boostCharge: {
        enabled: true, // bool — master toggle for the charge mechanic
        boostChargeTimeMs: 1500, // ms — full charge duration before auto-release
        boostMinMultiplier: 0.3, // unitless — burst scale at zero charge (reserved for early-release)
        boostMaxMultiplier: 1.0, // unitless — burst scale at full charge (auto-release)
        boostCooldownMs: 1000, // ms — lockout after a released burst before charging again
        burstImpulse: 18.0, // N·s — instantaneous forward impulse at release (× mass × multiplier)
      },
    },

    hop: {
      impulse: 25, // N·s scale — upward hop impulse
      cooldownMs: 500, // ms — minimum time between hops
    },
  },

  driving: {
    maxSpeed: 23.5, // m/s — forward speed cap
    reverseMaxSpeed: 8.0, // m/s — reverse speed cap
    accel: 125.0, // m/s² — drive force scaling
    braking: 35.0, // m/s² — passive decel when throttle released
    steeringTorque: 110.0, // N·m scale — tank steer while moving
    tankYawRate: 5.6, // rad/s — in-place pivot rate
    yawResponsiveness: 22.0, // 1/s — yaw smoothing toward target
    lateralGrip: 20.0, // force scale — sideways slip resistance
    driftGripFactor: 0.25, // unitless — lateral grip multiplier when drifting
    driftImpulseStrength: 0.55, // unitless — extra impulse during drift
    airControlFactor: 0.15, // unitless — steering authority while airborne
    extraYawDamping: 12.0, // 1/s — straight-line yaw torque damping when not steering
    groundVerticalVelThreshold: 2.0, // m/s — |vy| below this counts as grounded
    steerDeadzone: 0.01, // unitless — axis magnitude below this skips steer/drift
    driftMinSpeed: 0.25, // m/s — minimum |vForward| before drift impulse applies
  },

  ramming: {
    minSpeed: 0.8, // m/s — minimum relative speed to score a hit
    strength: 2.88, // unitless — collision impulse multiplier
    maxImpulse: 200.0, // N·s — per-frame impulse clamp
    spreadSteps: 3, // count — frames over which ram impulse is applied
    alignmentDotMin: 0.1, // unitless — min rammer→victim alignment dot product
    boostImpulseMultiplier: 2.35, // unitless — nitro ram impulse scale (intentionally unchanged)
    nitroAccelMultiplier: 1.72, // unitless — fallback drive accel when boostedAccel is null
    fx: {
      particleCountBase: 8, // count — cart-hit burst floor
      particleCountPerIntensity: 16, // count — extra particles per unit intensity
      particleBoostCountBonus: 6, // count — extra particles when rammer is boosting
      particleMaxCount: 28, // count — hard cap per burst (pool performance guard)
      shakeMinIntensity: 0.38, // unitless — min intensity for local ram screen shake
      shakeBoostMinIntensity: 0.22, // unitless — lower shake threshold during nitro rams
      shakePixelScale: 5.5, // px — screen shake amplitude scale
      audioBoostGain: 1.4, // unitless — collision SFX gain multiplier when boosting
    },
  },

  environmentImpacts: {
    floorFallSpeedThreshold: 3.0, // m/s — min downward pre-step speed for floor impact FX
    edgeDeltaVThreshold: 2.5, // m/s — min horizontal Δv for wall/edge impact FX
    intensityRange: 15.0, // m/s — divisor mapping excess speed/Δv to intensity 0–1
    minIntensity: 0.01, // unitless — ignore FX below this intensity
    contactYOffset: -0.4, // meters — floor contact point below cart origin
    pitRadiusOffset: 2, // meters — added to record radius for edge contact placement
    pitRadiusScale: 1.56, // unitless — 1.30 × 1.20 edge contact radius multiplier
  },

  fall: {
    yThreshold: -10, // meters — Y below arena triggers fall state
    respawnDelayMs: 600, // ms — visible fall before respawn
    // * Host-only anti-wedge safeguard — no score / kill feed (geometry trap workaround).
    stuck: {
      respawnMs: 10000, // ms — idle on arena before booth respawn
      positionRadiusM: 0.45, // meters — XZ movement that resets the idle timer
      maxPlanarSpeedMps: 0.65, // m/s — must stay below this to count as stuck
      unstickAfterMs: 2000, // ms — earlier physics nudge before forced respawn
    },
  },

  booth: {
    platformY: 4.0, // meters — spawn booth deck height
    platformWidth: 7.0, // meters
    platformDepth: 5.0, // meters
    platformThickness: 0.6, // meters
    rampLength: 0, // meters — ramp removed; gap jump only
    rampWidth: 5.0, // meters
    rampEndY: 0.1, // meters
    rampThickness: 0.3, // meters
    gapDistance: 1.5, // meters — booth platform to dancefloor gap
    railHeight: 1.8, // meters
    railThickness: 0.12, // meters
    gearEnabled: true,
    neonColor1: 0xff2bd6,
    neonColor2: 0x2bd6ff,
    neonCycleSpeed: 0.4, // cycles/s — booth neon pulse
    friction: 2.0, // unitless
    restitution: 0.0, // unitless
  },
};

// * Legacy alias — holeAssist originally lived under record.
physics.record.holeAssist = physics.holeAssist;

export const CONFIG = {
  canvasId: "game",
  backgroundColor: 0x070010,

  debug: {
    input: false,
    velocity: false,
    arenaTrimesh: false,
    audio: false,
  },

  net: {
    interpBufferMs: 75, // ms — remote cart interpolation delay (non-host)
    hostSendHz: 40, // Hz — host transform broadcast rate
    clientInputHz: 60, // Hz — client input send rate to host
    keepaliveIntervalMs: 5000, // ms — WebSocket keepalive interval
    stateBufferMaxSize: 64, // count — max authoritative snapshots retained client-side
    extrapolationCapMs: 50, // ms — max velocity extrapolation when buffer has no "after" snapshot
    hostMigrationFreezeMs: 300, // ms — non-host input freeze after host_migrated

    // * Client-side prediction (multiplayer non-host only). Host remains authoritative.
    prediction: {
      // * Positional error correction speed (1/s). Higher = snappier snap toward host truth.
      reconcilePosRate: 8,
      // * Rotational error correction speed (1/s). Smooths quaternion drift vs host snapshot.
      reconcileRotRate: 6,
      // * Velocity error correction speed (1/s). Aligns predicted motion with host velocities.
      reconcileVelRate: 5,
      // * Hard teleport when error exceeds this (m). Covers respawns and large desyncs.
      maxCorrectionM: 4.0,
      // * Ignore correction below this error (m). Prevents micro-jitter on well-predicted bodies.
      minErrorM: 0.12,
    },
  },

  camera: {
    fov: 55, // degrees — base field of view
    minFov: 50, // degrees — speed-zoom lower bound
    maxFov: 75, // degrees — speed-zoom upper bound
    followBack: 8.36, // meters — chase distance behind cart
    followUp: 3.894, // meters — chase height above cart
    lookAhead: 5.0, // meters — forward look target offset
    lookUp: 1.2, // meters — vertical look target offset
    positionDamping: 10.0, // 1/s — exponential follow smoothing (position)
    rotationDamping: 12.0, // 1/s — exponential follow smoothing (rotation)
    snapDistance: 80.0, // meters — instant camera reset if cart teleports farther
  },

  audio: {
    musicVolume: 0.1725, // unitless gain — in-game music (master gain applied separately)
  },

  scoring: {
    criticalVelocityThreshold: 11.0, // m/s — speed for critical hit bonus
    hitWindowMs: 2500, // ms — max time after a hit to credit a fall kill
  },

  round: {
    durationMs: 60000, // ms — host-authoritative round length
  },

  postFx: {
    // * Renderer exposure — lower keeps diffuse surfaces subdued while emissive neon blooms.
    toneMappingExposure: 0.88,

    // * IBL (Image-Based Lighting) — RoomEnvironment PMREM on scene.environment.
    // * intensity scales all MeshStandardMaterial envMapIntensity; tune in postFxDebug (H / ?debug).
    environment: {
      intensity: 0.6, // unitless — global IBL multiplier
      materialEnvMapIntensity: 0.4, // unitless — base per-material reflectivity (× intensity)
    },

    // * UnrealBloomPass tuning — see applyBloomSettings() in scene.js.
    bloom: {
      strength: 0.67, // unitless — bloom composite intensity
      radius: 0.34, // unitless — halo tightness (lower = crisper neon, higher = hazier)
      threshold: 0.86, // unitless — luminance cutoff (higher = emissive-only bloom)
      smoothWidth: 0.055, // unitless — soft knee on the high-pass (avoids hard cutoffs)
    },

    arcade: {
      aberration: 0.003,
      scanlineDensity: 1.8,
      vignette: 0.5,
    },

    // * Scene FogExp2 — Classic uses default fog on createScene(); Backrooms overrides on load.
    fog: {
      color: 0x0a0520, // deep blue-violet void (matches renderer clear)
      density: 0.0065, // conservative — depth at distance without hiding gameplay
      backrooms: {
        color: 0x2a2418, // thick warm musty haze
        density: 0.029,
      },
    },
  },

  // * Blob contact shadows — see contactShadows.js (no renderer.shadowMap; cheap quads).
  contactShadows: {
    enabled: true,
    floorY: 0,
    floorEpsilon: 0.045,
    textureSize: 128,
    textureSoftness: 0.92, // outer gradient radius — higher = wider soft falloff
    cart: {
      footprintRadiusX: 0.8, // meters — half cart width + caster margin (local X → world X at yaw 0)
      footprintRadiusZ: 1.16, // meters — half cart length + margin (local Y → world Z at yaw 0)
      opacity: 0.58,
      heightFadeStart: 0.3,
      heightFadeEnd: 4.8,
      minAirborneScale: 0.55,
    },
    static: {
      opacity: 0.44,
    },
  },

  physics,

  // * Flat aliases — existing code uses CONFIG.cart, CONFIG.gravity, etc.
  ...physics,
};

// Spawn ring radius calculation (same as original)
CONFIG.cart.spawnRingRadius =
  CONFIG.record.radius +
  CONFIG.booth.gapDistance +
  CONFIG.booth.rampLength +
  CONFIG.booth.platformDepth / 2;

CONFIG.cart.spawnHeight =
  CONFIG.booth.platformY +
  CONFIG.booth.platformThickness / 2 +
  CONFIG.cart.size.y / 2 +
  0.05;

export const BASELINE_CONFIG = {
  accel: CONFIG.driving.accel,
  maxSpeed: CONFIG.driving.maxSpeed,
  linearDamping: CONFIG.cart.linearDamping,
  angularDamping: CONFIG.cart.angularDamping,
  lateralGrip: CONFIG.driving.lateralGrip,
  driftGripFactor: CONFIG.driving.driftGripFactor,
};

export const CART_COLORS = {
  pink:       { hex: 0xff00ff, css: "bg-pink" },
  blue:       { hex: 0x00ffff, css: "bg-blue" },
  green:      { hex: 0x00ff00, css: "bg-green" },
  yellow:     { hex: 0xffff00, css: "bg-yellow" },
  neonOrange: { hex: 0xff6600, css: "bg-neonOrange" },
};

export const PALETTE = Object.keys(CART_COLORS);

export const MSG = {
  join: "join",
  hostTransform: "host_transform",
  clientInput: "client_input",
  hostEventCollision: "host_event_collision",
  hostEventFall: "host_event_fall",
  hostRound: "host_round",
  keepalive: "keepalive",
  colorPick: "color_pick",
  cartLook: "cart_look",
  readyToggle: "ready_toggle",
  playAgain: "play_again",
  hello: "hello",
  hostAssigned: "host_assigned",
  hostMigrated: "host_migrated",
  slots: "slots",
  state: "state",
  round: "round",
  joinRejected: "join_rejected",
  gameStart: "game_start",
  countdownCancel: "countdown_cancel",
};

export const PARTYKIT_PUBLIC_HOST = "v2.cartrave.lol";
