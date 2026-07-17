// devPanel.js — Tweakpane shell for the shared developer command registry.

/**
 * @param {{
 *   pane: any,
 *   allFolders: any[],
 *   registry: ReturnType<import("./commandRegistry.js").createCommandRegistry>,
 *   sections: Array<{ title: string, wire: (folder: any, run: (line: string) => unknown) => void }>,
 * }} options
 */
export function mountDevPanel({ pane, allFolders, registry, sections }) {
  const developerFolder = pane.addFolder({ title: "Developer", expanded: true });
  allFolders.push(developerFolder);

  const feedback = { status: "Ready — type help or use a button." };
  developerFolder.addBinding(feedback, "status", {
    readonly: true,
    interval: 100,
    label: "last result",
  });

  /**
   * @param {string} line
   */
  const run = (line) => {
    const result = registry.execute(line);
    feedback.status = result.message.length > 180
      ? `${result.message.slice(0, 177)}…`
      : result.message;
    if (result.ok === true) {
      // eslint-disable-next-line no-console
      console.info(`[CartClashDev] ${line}`, result.message);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[CartClashDev] ${line}`, `[${result.reason}] ${result.message}`);
    }
    pane.refresh();
    return result;
  };

  // * A native text input keeps command discovery lightweight while all actions remain
  // * registry-backed. Suggestions are rebuilt from command names and aliases on each edit.
  const commandWrap = document.createElement("div");
  commandWrap.style.cssText = "display:grid;gap:4px;padding:6px 8px;";
  const commandInput = document.createElement("input");
  commandInput.type = "text";
  commandInput.placeholder = "help · sd · scores 2 0 2 0";
  commandInput.setAttribute("aria-label", "Cart Clash developer command");
  commandInput.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "border:1px solid rgba(255,255,255,.22)",
    "border-radius:3px",
    "background:#1f1f23",
    "color:#eee",
    "font:11px/1.5 Consolas,monospace",
    "padding:5px 7px",
  ].join(";");
  const suggestions = document.createElement("datalist");
  suggestions.id = `cc-dev-commands-${Math.random().toString(36).slice(2)}`;
  commandInput.setAttribute("list", suggestions.id);
  commandWrap.append(commandInput, suggestions);
  developerFolder.element.appendChild(commandWrap);

  const refreshSuggestions = () => {
    suggestions.replaceChildren(...registry.suggest(commandInput.value).map((name) => {
      const option = document.createElement("option");
      option.value = name;
      return option;
    }));
  };
  commandInput.addEventListener("input", refreshSuggestions);
  commandInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    const line = commandInput.value.trim();
    if (!line) return;
    run(line);
    commandInput.select();
  });
  refreshSuggestions();

  for (const section of sections) {
    const folder = developerFolder.addFolder({ title: section.title, expanded: false });
    section.wire(folder, run);
  }

  return {
    run,
    setVisible(visible) {
      commandInput.disabled = !visible;
      if (!visible) commandInput.blur();
    },
  };
}
