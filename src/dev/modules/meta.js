// meta.js — discovery and lightweight status commands for the developer panel.

import { commandFail, commandOk } from "../commandRegistry.js";

/**
 * @param {ReturnType<import("../commandRegistry.js").createCommandRegistry>} registry
 * @param {{ getStatus: () => { isHost: boolean, phase: string, remainMs: number | null, unlockOverride: string | null } }} deps
 */
export function registerMetaModule(registry, deps) {
  registry.register({
    name: "help",
    args: "[filter]",
    help: "List commands or search command names, aliases, and descriptions.",
    run: (args) => (
      args.length > 1
        ? commandFail("bad-args", "Usage: help [filter]")
        : commandOk(registry.help(args[0] ?? ""))
    ),
  });
  registry.register({
    name: "status",
    help: "Show host role, round phase/time, and progression override without diagnostics.",
    run: (args) => {
      if (args.length) return commandFail("bad-args", "Usage: status");
      const status = deps.getStatus();
      const remain = status.remainMs == null ? "n/a" : `${Math.max(0, Math.round(status.remainMs))}ms`;
      return commandOk(
        `host=${status.isHost} · phase=${status.phase} · remaining=${remain} · unlocks=${status.unlockOverride ?? "dev-default"}`,
      );
    },
  });

  return {
    title: "Meta",
    /**
     * @param {any} folder
     * @param {(line: string) => unknown} run
     */
    wire(folder, run) {
      folder.addButton({ title: "Help: list commands" }).on("click", () => run("help"));
      folder.addButton({ title: "Show lightweight status" }).on("click", () => run("status"));
    },
  };
}
