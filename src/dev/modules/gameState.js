// gameState.js — round and directive commands for the developer panel.

import {
  forceDirectiveForTest,
  getDirectiveIdsForTest,
} from "../../directives/directiveEngine.js";
import { getRoundState } from "../../gameState.js";
import { commandFail, commandOk } from "../commandRegistry.js";

/**
 * @param {ReturnType<import("../commandRegistry.js").createCommandRegistry>} registry
 * @param {{ control: ReturnType<import("../devControl.js").createDevControl> }} deps
 */
export function registerGameStateModule(registry, deps) {
  registry.register({
    name: "sd",
    aliases: ["sudden-death"],
    help: "Arm the natural timed-round Sudden Death path (S3/S5).",
    scope: "host",
    run: (args) => (
      args.length
        ? commandFail("bad-args", "Usage: sd")
        : deps.control.forceSuddenDeath()
    ),
  });
  registry.register({
    name: "rewind",
    args: "[remainMs]",
    help: "Rewind the running round clock; defaults to 1500 ms.",
    scope: "host",
    run: (args) => (
      args.length > 1
        ? commandFail("bad-args", "Usage: rewind [remainMs]")
        : deps.control.rewindRoundClock(args[0] == null ? 1500 : Number(args[0]))
    ),
  });
  registry.register({
    name: "scores",
    args: "<s0> <s1> <s2> <s3>",
    help: "Replace all four scores and sync them from the host.",
    scope: "host",
    run: (args) => {
      if (args.length !== 4) {
        return commandFail("bad-args", "Usage: scores <s0> <s1> <s2> <s3>");
      }
      return deps.control.setScores({
        0: Number(args[0]),
        1: Number(args[1]),
        2: Number(args[2]),
        3: Number(args[3]),
      });
    },
  });
  registry.register({
    name: "directive",
    args: "<id>",
    help: "Fire a directive locally during a round; non-host MP mismatch self-reverts.",
    scope: "local",
    run: (args) => {
      if (args.length !== 1) return commandFail("bad-args", "Usage: directive <id>");
      if (!getDirectiveIdsForTest().includes(args[0])) {
        return commandFail("bad-args", `Unknown directive "${args[0]}". Try: directives`);
      }
      const round = getRoundState();
      if (round.phase !== "running" || round.isSuddenDeath) {
        return commandFail(
          "round-not-running",
          "Start a timed round before firing a directive.",
        );
      }
      return forceDirectiveForTest(args[0])
        ? commandOk(`Directive "${args[0]}" fired locally.`)
        : commandFail("round-not-running", "Start a round before firing a directive.");
    },
  });
  registry.register({
    name: "directives",
    help: "List directive ids accepted by the local-only directive command.",
    scope: "local",
    run: (args) => (
      args.length
        ? commandFail("bad-args", "Usage: directives")
        : commandOk(`Directives: ${getDirectiveIdsForTest().join(", ")}`)
    ),
  });

  return {
    title: "Game State",
    /**
     * @param {any} folder
     * @param {(line: string) => import("../commandRegistry.js").CommandResult} run
     */
    wire(folder, run) {
      folder.addButton({ title: "Force Sudden Death ⚡ (S3/S5, host)" })
        .on("click", () => run("sd"));
      folder.addButton({ title: "Fast-end: 1.5s remaining (host)" })
        .on("click", () => run("rewind 1500"));

      const directiveIds = getDirectiveIdsForTest();
      if (directiveIds.length) {
        const state = { directive: directiveIds[0] };
        folder.addBinding(state, "directive", {
          options: Object.fromEntries(directiveIds.map((id) => [id, id])),
        });
        folder.addButton({ title: "Fire directive (LOCAL only)" })
          .on("click", () => run(`directive ${state.directive}`));
      }
    },
  };
}
