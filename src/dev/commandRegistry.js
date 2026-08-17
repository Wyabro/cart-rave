// commandRegistry.js — game-agnostic developer command registration and execution.

/**
 * @typedef {"host" | "local" | "any"} CommandScope
 * @typedef {"host-required" | "round-not-running" | "diagnostics-required" | "public-room" | "bad-args" | "unknown"} CommandFailureReason
 * @typedef {{ ok: true, message: string }} CommandSuccess
 * @typedef {{ ok: false, reason: CommandFailureReason, message: string }} CommandFailure
 * @typedef {CommandSuccess | CommandFailure} CommandResult
 * @typedef {{
 *   name: string,
 *   aliases?: string[],
 *   args?: string,
 *   help: string,
 *   scope?: CommandScope,
 *   run: (args: string[]) => CommandResult,
 * }} CommandDefinition
 */

/** @param {string} message @returns {CommandSuccess} */
export function commandOk(message) {
  return { ok: true, message };
}

/**
 * @param {CommandFailureReason} reason
 * @param {string} message
 * @returns {CommandFailure}
 */
export function commandFail(reason, message) {
  return { ok: false, reason, message };
}

/**
 * Splits a command line while preserving quoted arguments.
 * @param {string} line
 * @returns {string[]}
 */
export function parseCommandLine(line) {
  const source = String(line ?? "").trim();
  if (!source) return [];
  const tokens = [];
  const tokenPattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  while (true) {
    const match = tokenPattern.exec(source);
    if (!match) break;
    const token = match[1] ?? match[2] ?? match[3] ?? "";
    tokens.push(token.replace(/\\(["'\\])/g, "$1"));
  }
  return tokens;
}

/**
 * @param {CommandDefinition} def
 * @returns {string}
 */
function formatHelp(def) {
  const usage = `${def.name}${def.args ? ` ${def.args}` : ""}`;
  const aliases = def.aliases?.length ? `; aliases: ${def.aliases.join(", ")}` : "";
  const scope = def.scope && def.scope !== "any" ? ` [${def.scope}-only]` : "";
  return `${usage}${scope} — ${def.help}${aliases}`;
}

export function createCommandRegistry() {
  /** @type {Map<string, CommandDefinition>} */
  const commands = new Map();
  /** @type {Map<string, string>} */
  const aliases = new Map();

  return {
    /** @param {CommandDefinition} definition */
    register(definition) {
      const name = String(definition?.name ?? "").trim().toLowerCase();
      if (!name || typeof definition?.run !== "function" || !definition.help) {
        throw new TypeError("Developer commands require name, help, and run.");
      }
      if (commands.has(name) || aliases.has(name)) {
        throw new Error(`Developer command already registered: ${name}`);
      }
      const normalizedAliases = [...new Set((definition.aliases ?? [])
        .map((alias) => String(alias).trim().toLowerCase())
        .filter(Boolean))];
      for (const alias of normalizedAliases) {
        if (alias === name || commands.has(alias) || aliases.has(alias)) {
          throw new Error(`Developer command alias already registered: ${alias}`);
        }
      }
      const normalized = {
        ...definition,
        name,
        aliases: normalizedAliases,
        scope: definition.scope ?? "any",
      };
      commands.set(name, normalized);
      for (const alias of normalizedAliases) aliases.set(alias, name);
      return normalized;
    },

    /** @param {string} line @returns {CommandResult} */
    execute(line) {
      const tokens = parseCommandLine(line);
      if (!tokens.length) return commandFail("bad-args", "Enter a command. Try: help");
      const requested = tokens.shift().toLowerCase();
      const name = aliases.get(requested) ?? requested;
      const command = commands.get(name);
      if (!command) {
        return commandFail("unknown", `Unknown command "${requested}". Try: help`);
      }
      try {
        const result = command.run(tokens);
        if (!result || typeof result.ok !== "boolean" || typeof result.message !== "string") {
          return commandFail("unknown", `Command "${name}" returned an invalid result.`);
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return commandFail("unknown", `Command "${name}" failed: ${message}`);
      }
    },

    /** @param {string} prefix @returns {string[]} */
    suggest(prefix) {
      const needle = String(prefix ?? "").trim().toLowerCase().split(/\s+/, 1)[0];
      const matches = new Set();
      for (const command of commands.values()) {
        if (!needle || command.name.startsWith(needle)) matches.add(command.name);
        for (const alias of command.aliases ?? []) {
          if (!needle || alias.startsWith(needle)) matches.add(command.name);
        }
      }
      return [...matches].sort();
    },

    /** @param {string} [filter] @returns {string} */
    help(filter = "") {
      const needle = String(filter).trim().toLowerCase();
      const rows = [...commands.values()]
        .filter((command) => (
          !needle
          || command.name.includes(needle)
          || command.help.toLowerCase().includes(needle)
          || command.aliases?.some((alias) => alias.includes(needle))
        ))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(formatHelp);
      return rows.length ? rows.join("\n") : `No commands match "${filter}".`;
    },

    /** @returns {string[]} */
    names() {
      return [...commands.keys()].sort();
    },
  };
}
