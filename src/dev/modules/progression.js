// progression.js — progression and unlock commands for the developer panel.

import { ARENA_CATALOG } from "../../levels/arenaCatalog.js";
import { commandFail, commandOk } from "../commandRegistry.js";

const LEVEL_OPTIONS = Object.fromEntries(
  ARENA_CATALOG.map((arena) => [arena.displayName, arena.id]),
);
const LEVEL_IDS = new Set(ARENA_CATALOG.map((arena) => arena.id));

function currentLevelId() {
  const fromUrl = new URLSearchParams(window.location.search).get("level");
  if (fromUrl && LEVEL_IDS.has(fromUrl)) return fromUrl;
  try {
    const stored = localStorage.getItem("cartRaveLevel");
    if (stored && LEVEL_IDS.has(stored)) return stored;
  } catch {
    // * Privacy modes fall back to the always-available classic arena.
  }
  return "classicRecord";
}

/**
 * @param {"all" | "gates" | "clear"} mode
 * @returns {import("../commandRegistry.js").CommandResult}
 */
function setUnlockMode(mode) {
  const api = window.CartClashDevUnlocks;
  if (!api) return commandFail("unknown", "CartClashDevUnlocks is unavailable.");
  if (mode === "all") api.enableAll();
  else if (mode === "gates") api.enableGates();
  else api.clear();
  window.location.reload();
  return commandOk(`Unlock mode set to ${mode}; reloading.`);
}

/**
 * @param {ReturnType<import("../commandRegistry.js").createCommandRegistry>} registry
 * @param {{ control: ReturnType<import("../devControl.js").createDevControl> }} deps
 */
export function registerProgressionModule(registry, deps) {
  registry.register({
    name: "kos",
    aliases: ["ko"],
    args: "<level> [n]",
    help: "Grant real lifetime KO credit on an arena; defaults to 5.",
    run: (args) => {
      if (args.length < 1 || args.length > 2 || !LEVEL_IDS.has(args[0])) {
        return commandFail(
          "bad-args",
          `Usage: kos <level> [n]. Levels: ${[...LEVEL_IDS].join(", ")}`,
        );
      }
      return deps.control.grantKos(args[0], args[1] == null ? 5 : Number(args[1]));
    },
  });
  registry.register({
    name: "unlocks",
    args: "<all|gates|clear>",
    help: "Set the DEV unlock override and reload; gates is the FTUE test mode.",
    run: (args) => {
      if (args.length !== 1 || !["all", "gates", "clear"].includes(args[0])) {
        return commandFail("bad-args", "Usage: unlocks <all|gates|clear>");
      }
      return setUnlockMode(/** @type {"all" | "gates" | "clear"} */ (args[0]));
    },
  });

  return {
    title: "Progression",
    /**
     * @param {any} folder
     * @param {(line: string) => unknown} run
     */
    wire(folder, run) {
      const state = { level: currentLevelId() };
      folder.addBinding(state, "level", { options: LEVEL_OPTIONS, label: "KO level" });
      folder.addButton({ title: "+5 KOs on level" })
        .on("click", () => run(`kos ${state.level} 5`));
      folder.addButton({ title: "+15 KOs on level" })
        .on("click", () => run(`kos ${state.level} 15`));
      folder.addButton({ title: "Real locks ON — FTUE (reload)" })
        .on("click", () => run("unlocks gates"));
      folder.addButton({ title: "Unlock everything (reload)" })
        .on("click", () => run("unlocks all"));
      folder.addButton({ title: "Dev default unlocks (reload)" })
        .on("click", () => run("unlocks clear"));
    },
  };
}
