#!/usr/bin/env node
// PreToolUse guard — blocks `git add -A` / `git add .` (AGENTS.md session opener:
// "never git add -A"). Whole-worktree staging sweeps up .diag-captures/, worktrees,
// and whatever else is mid-flight; this repo stages explicit paths only.
//
// Fails open by design: any parse or logic error exits 0, so a bug in this file can
// never wedge a session.

/** Strip quoted spans so a commit message that mentions "git add -A" isn't a false positive. */
function stripQuoted(s) {
  return s
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

/** True when a `git add` argument list stages the whole worktree. */
function stagesEverything(args) {
  for (const arg of args) {
    if (arg === '--all' || arg === '--no-ignore-removal') return true;
    if (arg === '.' || arg === './' || arg === ':/' || arg === '*') return true;
    // Combined short flags: -A, -Av, -vA. Case-sensitive — `-a` is not `-A`.
    if (/^-[A-Za-z]*A[A-Za-z]*$/.test(arg)) return true;
  }
  return false;
}

/** Scan every shell segment of a command line for an offending `git add`. */
function offends(command) {
  for (const segment of stripQuoted(command).split(/&&|\|\||[;\n|]/)) {
    // Lazy `\S+\s+` skips global options and their values (`git -C some/path add …`).
    // `add` must still be a whitespace-delimited token, so `--grep=add` never matches.
    const m = /(?:^|\s)git\s+(?:\S+\s+)*?add\s+(.+)$/.exec(segment.trim());
    if (m && stagesEverything(m[1].split(/\s+/).filter(Boolean))) return true;
  }
  return false;
}

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
  process.exit(0);
}

try {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  const command = JSON.parse(raw)?.tool_input?.command;
  if (typeof command === 'string' && offends(command)) {
    deny(
      'Blocked by .claude/hooks/guard-git-add.mjs. AGENTS.md forbids whole-worktree staging ' +
        '(`git add -A`, `git add .`, `git add --all`) on this repo — it sweeps up generated ' +
        'captures and unrelated in-flight work. Stage the paths you actually changed: ' +
        '`git add <path> <path>`. Use `git status --short` first if you need the list.'
    );
  }
} catch {
  // Fail open — never block on a bug in this guard.
}

process.exit(0);
