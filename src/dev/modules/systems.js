// systems.js — URL-flag and audio commands for the developer panel.

import { getIsMuted, setAllAudioMuted } from "../../ui/audioControls.js";
import { commandFail, commandOk } from "../commandRegistry.js";

const FLAG_HELP = [
  "?diag=1 diagnostics/capture",
  "?blackmon=1 black-frame monitor",
  "?harness=1 visual QA",
  "?nettest=1 netcode harness",
  "?hud=0 hide HUD",
  "?ablate=bloom,arcade,fxaa,vhs,output",
  "?forcegpu=sw|igpu|discrete|igpu-basic|igpu-modern|discrete-entry|unknown",
  "?gpustr=<renderer string> (DEV only, checks the classifier)",
].join(" · ");

/**
 * `?forcegpu=` values — legacy (`real`/`sw`/`igpu`/`discrete`, TIER-DEFAULT-1
 * B3: `igpu` keeps mapping to gpuClass "unknown", unchanged) plus the four new
 * class names not reachable through a legacy alias.
 */
const FORCEGPU_OPTIONS = ["real", "sw", "igpu", "discrete", "igpu-basic", "igpu-modern", "discrete-entry", "unknown"];

/**
 * @param {string} key
 * @param {string | null} value
 */
function reloadWithParam(key, value) {
  const url = new URL(window.location.href);
  if (value == null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  window.location.href = url.toString();
}

/**
 * @param {string[]} args
 * @returns {"on" | "off" | null}
 */
function readToggle(args) {
  if (args.length !== 1 || !["on", "off"].includes(args[0])) return null;
  return /** @type {"on" | "off"} */ (args[0]);
}

/**
 * @param {ReturnType<import("../commandRegistry.js").createCommandRegistry>} registry
 */
export function registerSystemsModule(registry) {
  registry.register({
    name: "diag",
    args: "<on|off>",
    help: "Toggle the existing diagnostics hub URL gate and reload.",
    run: (args) => {
      const mode = readToggle(args);
      if (!mode) return commandFail("bad-args", "Usage: diag <on|off>");
      reloadWithParam("diag", mode === "on" ? "1" : null);
      return commandOk(`Diagnostics ${mode}; reloading.`);
    },
  });
  registry.register({
    name: "blackmon",
    args: "<on|off>",
    help: "Toggle the existing black-frame monitor URL gate and reload.",
    run: (args) => {
      const mode = readToggle(args);
      if (!mode) return commandFail("bad-args", "Usage: blackmon <on|off>");
      reloadWithParam("blackmon", mode === "on" ? "1" : null);
      return commandOk(`Black-frame monitor ${mode}; reloading.`);
    },
  });
  registry.register({
    name: "mute",
    args: "[on|off|toggle]",
    help: "Change mute state through the existing audio control path.",
    scope: "local",
    run: (args) => {
      const mode = args[0] ?? "toggle";
      if (args.length > 1 || !["on", "off", "toggle"].includes(mode)) {
        return commandFail("bad-args", "Usage: mute [on|off|toggle]");
      }
      const muted = mode === "toggle" ? !getIsMuted() : mode === "on";
      setAllAudioMuted(muted);
      return commandOk(`Audio ${muted ? "muted" : "unmuted"}.`);
    },
  });
  registry.register({
    name: "flags",
    help: "Print the specialist diagnostics, visual-QA, and nettest URL flags.",
    run: (args) => (
      args.length
        ? commandFail("bad-args", "Usage: flags")
        : commandOk(FLAG_HELP)
    ),
  });
  registry.register({
    name: "forcegpu",
    args: "<real|sw|igpu|discrete|igpu-basic|igpu-modern|discrete-entry|unknown>",
    help: "Set the existing GPU-class override and reload.",
    run: (args) => {
      if (args.length !== 1 || !FORCEGPU_OPTIONS.includes(args[0])) {
        return commandFail("bad-args", `Usage: forcegpu <${FORCEGPU_OPTIONS.join("|")}>`);
      }
      reloadWithParam("forcegpu", args[0] === "real" ? null : args[0]);
      return commandOk(`GPU override set to ${args[0]}; reloading.`);
    },
  });

  return {
    title: "Systems",
    /**
     * @param {any} folder
     * @param {(line: string) => unknown} run
     */
    wire(folder, run) {
      const blackmonOn = new URLSearchParams(window.location.search).get("blackmon") === "1";
      folder.addButton({
        title: blackmonOn ? "Black monitor: ON → turn off" : "Black monitor (reload)",
      }).on("click", () => run(`blackmon ${blackmonOn ? "off" : "on"}`));

      const currentGpu = new URLSearchParams(window.location.search).get("forcegpu") || "real";
      const state = { forcegpu: currentGpu };
      folder.addBinding(state, "forcegpu", {
        options: {
          "real GPU": "real",
          software: "sw",
          "iGPU (unknown, legacy)": "igpu",
          discrete: "discrete",
          "iGPU basic": "igpu-basic",
          "iGPU modern": "igpu-modern",
          "discrete entry": "discrete-entry",
          unknown: "unknown",
        },
        label: "forcegpu (reload)",
      }).on("change", (event) => run(`forcegpu ${event.value}`));
      folder.addButton({ title: getIsMuted() ? "Unmute audio" : "Mute audio" })
        .on("click", () => run("mute toggle"));
      folder.addButton({ title: "Print debug flags" })
        .on("click", () => run("flags"));
    },
  };
}
