/**
 * Barrel export file — re-exports refactored Cart Rave modules under a single entry point.
 * Import from here (e.g. `import * as HUD from "./src/index.js"`) instead of individual files.
 */

// Core game loop
export { initGame, startGameLoop, gameStep } from "./game.js";

// Core systems
export * as Config from "./config.js";
export * as Simulation from "./simulation.js";
export * as Netcode from "./netcode.js";
export * as Input from "./input.js";
export * as Entities from "./entities.js";
export * as GameState from "./gameState.js";

// Rendering & UI
export * as Scene from "./scene.js";
export * as Visuals from "./visuals.js";
export * as HUD from "./hud.js";
export * as Audio from "./audio.js";
