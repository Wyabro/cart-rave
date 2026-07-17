// events.js — announcer and diagnostics-capture commands for the developer panel.

import { ANNOUNCER_EVENTS } from "../../announcer/announcerEvents.js";
import { announce, resetAnnouncerRound } from "../../announcer/announcerManager.js";
import { commandFail, commandOk } from "../commandRegistry.js";

const ANNOUNCER_IDS = Object.keys(ANNOUNCER_EVENTS);

/**
 * @param {ReturnType<import("../commandRegistry.js").createCommandRegistry>} registry
 */
export function registerEventsModule(registry) {
  registry.register({
    name: "announce",
    args: "<id|list>",
    help: "Run an announcer event through the real arbitration pipeline, or list ids.",
    scope: "local",
    run: (args) => {
      if (args.length !== 1) return commandFail("bad-args", "Usage: announce <id|list>");
      if (args[0] === "list") {
        return commandOk(`Announcer events: ${ANNOUNCER_IDS.join(", ")}`);
      }
      if (!ANNOUNCER_IDS.includes(args[0])) {
        return commandFail("bad-args", `Unknown announcer event "${args[0]}".`);
      }
      resetAnnouncerRound();
      announce(args[0]);
      return commandOk(`Announcer event "${args[0]}" requested locally.`);
    },
  });
  registry.register({
    name: "capture",
    help: "Create a capture through the real diagnostics hub; requires ?diag=1.",
    scope: "local",
    run: (args) => {
      if (args.length) return commandFail("bad-args", "Usage: capture");
      if (!window.__ccDiag?.captureBundle) {
        return commandFail(
          "diagnostics-required",
          "Diagnostics are off. Run: diag on (reload), then retry capture.",
        );
      }
      const bundle = window.__ccDiag.captureBundle({
        scenario: "manual",
        reason: "developer panel",
      });
      // eslint-disable-next-line no-console
      console.info("[CartClashDev] capture bundle:", bundle);
      return commandOk("Diagnostics capture created and logged to the console.");
    },
  });

  return {
    title: "Events",
    /**
     * @param {any} folder
     * @param {(line: string) => unknown} run
     */
    wire(folder, run) {
      folder.addButton({ title: "List announcer event ids" })
        .on("click", () => run("announce list"));
      folder.addButton({ title: "Capture diagnostics bundle" })
        .on("click", () => run("capture"));
    },
  };
}
