// config.js — central game configuration (extracted from main.js)

export const CONFIG = {
  canvasId: "game",
  backgroundColor: 0x070010,
  debug: {
    input: false,
    velocity: false,
    arenaTrimesh: false,
  },
  net: {
    interpBufferMs: 75,
    hostSendHz: 40,
    clientInputHz: 60,
    keepaliveIntervalMs: 5000,
  },

  gravity: -24,
  fixedTimeStep: 1 / 60,
  maxSubsteps: 4,

  record: {
    radius: 26.4,
    innerRadius: 3.63,
    thickness: 0.6,
    y: -0.3,
    rotationSpeedRadPerSec: 0.35,
    physicsSpinRadPerSec: 0.08,
    friction: 2.6,
    restitution: 0.05,
    color: 0x050006,
    rimColor: 0xff2bd6,
    surface: {
      concentricRings: {
        count: 96,
        lineWidth: 0.018,
        color: 0x2a2a32,
        yOffset: 0.3,
        innerRadius: 7.15,
        outerRadius: 25.9,
      },
      spindleRing: {
        enabled: true,
        innerRadius: 3.3,
        outerRadius: 3.7,
        color: 0xffffff,
        yOffset: 0.3,
      },
    },
  },

  cart: {
    size: { x: 1.31, y: 1.35, z: 2.26 },
    spawnHeight: 1.077,
    friction: 1.8,
    restitution: 0.3,
    linearDamping: 2.00,
    angularDamping: 12.50,
    maxPitchRoll: 0.99,
    visualOffset: 0.45,

    ramBoost: {
      enabled: true,
      durationSec: 1.5,
      cooldownSec: 3.0,
      boostedMaxSpeed: 26,
      boostedAccel: null,
      streakDurationSec: 0.4,
      streakSpawnRatePerSec: 12,
      streakLengthMeters: 2.0,
      npc: {
        enabled: true,
        alignmentAngleDeg: 13.2,
        minTargetDistance: 3.6,
        maxTargetDistance: 19.8,
      },
    },

    hop: {
      impulse: 25,
      cooldownMs: 500,
    },
  },

  driving: {
    maxSpeed: 23.5,
    reverseMaxSpeed: 8.0,
    accel: 125.0,
    braking: 35.0,
    steeringTorque: 110.0,
    tankYawRate: 5.6,
    yawResponsiveness: 22.0,
    lateralGrip: 20.0,
    driftGripFactor: 0.25,
    driftImpulseStrength: 0.55,
    airControlFactor: 0.15,
  },

  scoring: {
    criticalVelocityThreshold: 11.0,
  },

  ramming: {
    minSpeed: 0.8,
    strength: 8.0,
    maxImpulse: 200.0,
  },

  fall: {
    yThreshold: -10,
    respawnDelayMs: 600,
  },

  booth: {
    platformY: 4.0,
    platformWidth: 7.0,
    platformDepth: 5.0,
    platformThickness: 0.6,
    rampLength: 0,
    rampWidth: 5.0,
    rampEndY: 0.1,
    rampThickness: 0.3,
    gapDistance: 1.5,
    railHeight: 1.8,
    railThickness: 0.12,
    gearEnabled: true,
    neonColor1: 0xff2bd6,
    neonColor2: 0x2bd6ff,
    neonCycleSpeed: 0.4,
    friction: 2.0,
    restitution: 0.0,
  },

  camera: {
    fov: 55,
    minFov: 50,
    maxFov: 75,
    followBack: 8.36,
    followUp: 3.894,
    lookAhead: 5.0,
    lookUp: 1.2,
    positionDamping: 10.0,
    rotationDamping: 12.0,
    snapDistance: 80.0,
  },

  audio: {
    musicVolume: 0.1725,
  },
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
};

export const PARTYKIT_PUBLIC_HOST = "cart-rave.wyabro.partykit.dev";