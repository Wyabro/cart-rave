// index.js — Cart Clash developer-panel composition root.

import { createCommandRegistry } from "./commandRegistry.js";
import { mountDevPanel } from "./devPanel.js";
import { registerEventsModule } from "./modules/events.js";
import { registerGameStateModule } from "./modules/gameState.js";
import { registerMetaModule } from "./modules/meta.js";
import { registerProgressionModule } from "./modules/progression.js";
import { registerSystemsModule } from "./modules/systems.js";

/**
 * Registers the fixed Cart Clash v1 command pack.
 * @param {ReturnType<typeof createCommandRegistry>} registry
 * @param {{
 *   control: ReturnType<import("./devControl.js").createDevControl>,
 *   getStatus: () => { isHost: boolean, phase: string, remainMs: number | null, unlockOverride: string | null },
 * }} deps
 */
export function registerCartClashModules(registry, deps) {
  return [
    registerGameStateModule(registry, deps),
    registerProgressionModule(registry, deps),
    registerEventsModule(registry),
    registerSystemsModule(registry),
    registerMetaModule(registry, deps),
  ];
}

/**
 * @param {{
 *   pane: any,
 *   allFolders: any[],
 *   control: ReturnType<import("./devControl.js").createDevControl>,
 *   getStatus: () => { isHost: boolean, phase: string, remainMs: number | null, unlockOverride: string | null },
 * }} options
 */
export function initDevPanel({ pane, allFolders, control, getStatus }) {
  const registry = createCommandRegistry();
  const sections = registerCartClashModules(registry, { control, getStatus });
  const panel = mountDevPanel({ pane, allFolders, registry, sections });

  window.CartClashDev = {
    help: (filter = "") => registry.help(filter),
    run: (line) => registry.execute(line),
    suggest: (prefix = "") => registry.suggest(prefix),
  };

  return panel;
}
