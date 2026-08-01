#!/usr/bin/env node
// PreToolUse guard — blocks whole-worktree staging: `git add -A` / `git add .` /
// `git add --all` and every `git commit -a` form (AGENTS.md session opener: "never
// git add -A"; docs/STATUS.md:289: "Concurrent agent sessions may `git add -A` —
// commit surgically when working alongside one"). Whole-worktree staging sweeps up
// .diag-captures/, worktrees, and another session's in-flight work; this repo stages
// explicit paths only.
//
// Escape hatch: CART_CLASH_SKIP_HOOKS=1 or SKIP_GIT_GUARD=1, mirroring SKIP_DOCS_HOOK=1
// in .git/hooks/pre-commit. This is safe *because* the hook reads its own inherited env
// — the env of the Claude Code process — and never parses the command string for
// assignments. A model writing `SKIP_GIT_GUARD=1 git add -A` is still blocked, since that
// assignment never reaches this process. Do not "fix" this by scanning the command.
//
// Fails open by design: any parse or logic error exits 0, so a bug in this file can
// never wedge a session.
//
// Residual risks — known and accepted, do not assume coverage:
//   - stripQuoted pairs quotes naively. Nested or unbalanced quoting (a heredoc, a
//     JS string array, a multi-line python literal) desyncs it, so a literal
//     `git add -A` inside such text can false-positive. Unfixable without a real
//     shell parser; the escape hatch above is the answer.
//   - A .sh/.ps1 that itself runs `git add -A` is invisible — the hook only sees the
//     outer command. The permissions.deny backstop does not cover this either.
//   - Bare `git add -u` stages every tracked modification, the same concurrent-agent
//     hazard as -A, but is deliberately NOT blocked: `git add -u src/` is legitimate
//     and common. Documented gap, not an oversight.
//   - The permissions.deny backstop in .claude/settings.json is glob-only and cannot
//     express `-vA`, `:`, `:(top)`, or a literal `*` (in rule syntax `*` IS the
//     wildcard). Those forms are hook-only. settings.json is strict JSON, not JSONC,
//     so that caveat lives here and in AGENTS.md § Enforcement — never as a comment
//     in the settings file, where it would break parsing and drop every hook.

/** Whole-tree pathspecs — staging any of these sweeps the entire worktree. */
const WHOLE_TREE = new Set(['.', './', ':/', ':', '*', ':(top)']);

/**
 * Skip global options and their values (`git -C some/path add …`), then capture the
 * subcommand and its argument list. Each skipped group must start with `-`, so a
 * non-flag token like `log` can never be skipped to reach a later literal `add`
 * (which would false-positive on `git log --grep add --all`). The `\b` keeps `add`
 * a whole token, so `git addendum` never matches.
 */
const SEGMENT = /(?:^|\s)git\s+(?:-\S+\s+(?:\S+\s+)?)*?(add|commit)\b\s*(.*)$/;

/** Strip quoted spans so a commit message that mentions "git add -A" isn't a false positive. */
function stripQuoted(s) {
  return s
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

/** Split an argument list on the first `--` separator into [flags, paths]. */
function splitDoubleDash(args) {
  const i = args.indexOf('--');
  return i === -1 ? [args, []] : [args.slice(0, i), args.slice(i + 1)];
}

/** True when a `git add` argument list stages the whole worktree. */
function addStagesEverything(args) {
  const [flags, paths] = splitDoubleDash(args);
  for (const arg of flags) {
    if (arg === '--all' || arg === '--no-ignore-removal') return true;
    if (WHOLE_TREE.has(arg)) return true;
    // Combined short flags: -A, -Av, -vA. Case-sensitive — `-a` is not `-A`.
    if (/^-[A-Za-z]*A[A-Za-z]*$/.test(arg)) return true;
  }
  // Everything after `--` is a path, so `-A` there names a FILE and is allowed —
  // but `.` still stages the tree.
  for (const p of paths) if (WHOLE_TREE.has(p)) return true;
  return false;
}

/** True when a `git commit` flag list implicitly stages tracked files (-a / --all). */
function commitStagesEverything(args) {
  const [flags] = splitDoubleDash(args);
  for (let i = 0; i < flags.length; i++) {
    const arg = flags[i];
    if (arg === '--all') return true;
    // ORDER IS LOAD-BEARING: test staging intent BEFORE the value-skip below.
    // `-am` ends in `m`, so skipping first would treat it as an option that consumes
    // its value and the `a` would never be seen. Do not reorder these two lines.
    if (/^-[A-Za-z]*a[A-Za-z]*$/.test(arg)) return true;
    // Short options that consume the next token: -m msg, -c commit, -F file, -S keyid.
    if (/^-[A-Za-z]*[mcCFS]$/.test(arg)) i++;
  }
  return false;
}

/**
 * Scan every shell segment of a command line for an offending `git add` / `git commit`.
 * Exported for tests/claudeHooks.test.js — keep it pure.
 * @param {string} command
 * @returns {boolean}
 */
export function offends(command) {
  for (const segment of stripQuoted(command).split(/&&|\|\||[;\n|]/)) {
    const m = SEGMENT.exec(segment.trim());
    if (!m) continue;
    const args = m[2].split(/\s+/).filter(Boolean);
    const bulk = m[1] === 'add' ? addStagesEverything(args) : commitStagesEverything(args);
    if (bulk) return true;
  }
  return false;
}

const DENIAL =
  'Blocked by .claude/hooks/guard-git-add.mjs. AGENTS.md forbids whole-worktree staging ' +
  'on this repo (`git add -A`, `git add .`, `git add --all`, `git commit -a`) — concurrent ' +
  'agent sessions share this tree, so a bulk stage sweeps up generated captures and another ' +
  "session's in-flight work. Stage the paths you actually changed: `git add <path> <path>`, " +
  'then `git commit -m "…"`. Run `git status --short` first if you need the list.';

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })
  );
}

async function main() {
  // Escape hatch first — see the header for why reading our own env is the safe form.
  if (process.env.CART_CLASH_SKIP_HOOKS || process.env.SKIP_GIT_GUARD) return;

  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  const command = JSON.parse(raw)?.tool_input?.command;
  if (typeof command === 'string' && offends(command)) deny(DENIAL);
}

const isMain =
  process.argv[1] && /guard-git-add\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));

if (isMain) {
  try {
    await main();
  } catch {
    // Fail open — never block on a bug in this guard.
  }
  process.exit(0);
}
