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
// GIT-INDEX-2 (content, not paths): GIT-INDEX-1 above compares staged PATHS against what
// this session owns, so a file this session legitimately wrote and staged passes even when
// a concurrent session appended to it in between — an owned path can carry a foreign hunk.
// Two content checks close that, both keyed off the write-time hashes in session state:
//   Check A — at `git add`, hash the WORKTREE for each added path this session wrote. For a
//     path being added the worktree is the content about to be staged, so this is also the
//     only check that can see `git add X && git commit` in ONE command (see the same-command
//     residual below: the index is still pre-add at PreToolUse time).
//   Check B — at a pathspec-less commit, hash the STAGED BLOB. Backstop for content staged
//     without an observed `git add`. Deliberately reads the index, not the worktree, so
//     "staged clean, worktree since dirtied, no re-add" is ALLOWED — that commit ships the
//     clean bytes.
// NOTE: Check A means an explicit-path `git add` can now be denied. That is new — this guard
// previously only ever denied bulk staging — and it is the contract working, not a bug.
//
// Residual risks — known and accepted, do not assume coverage:
//   - A file this session wrote via Bash (sed, heredoc, an npm script) and then staged reads
//     as drifted, because only Write/Edit/MultiEdit/NotebookEdit record a hash. Same answer
//     as every other residual here: SKIP_GIT_GUARD=1.
//   - `edit → add → edit again → commit` without re-adding: the staged blob is the earlier
//     write, so Check B denies. Re-`git add` clears it.
//   - `git add -p`: the recorded hash covers the whole worktree file while the staged blob is
//     partial, so that path always denies. Agents on this repo do not use -p.
//   - Files over the tracker's ~4 MB hash cap get no `writes` entry, so both content checks
//     skip them and only GIT-INDEX-1 path ownership applies.
//   - Disk and index reads use normalizeRepoPath's lowercased form. On a case-sensitive
//     filesystem a case mismatch misses the file, the read returns null, and the check falls
//     open. Not a factor on this repo's Windows tree.
//   - stripQuoted pairs quotes naively. Nested or unbalanced quoting (a heredoc, a
//     JS string array, a multi-line python literal) desyncs it, so a literal
//     `git add -A` inside such text can false-positive. Unfixable without a real
//     shell parser; the escape hatch above is the answer.
//   - A .sh/.ps1 that itself runs `git add -A` is invisible — the hook only sees the
//     outer command. The permissions.deny backstop does not cover this either.
//   - The commit-scope check reads the index BEFORE the Bash command executes, so
//     `git add X && git commit …` in ONE command is checked against the pre-add index
//     plus X (the same-command union). Two separate tool calls work identically —
//     the add is recorded into session state when it is allowed.
//   - Paths are normalized against CLAUDE_PROJECT_DIR (fallback: the tool call's cwd).
//     Running git from a subdirectory can mis-normalize; agents on this repo run git
//     from the root, and every miss here fails toward a deny with named remedies.
//   - The permissions.deny backstop in .claude/settings.json is glob-only and cannot
//     express `-vA`, `:`, `:(top)`, or a literal `*` (in rule syntax `*` IS the
//     wildcard). Those forms are hook-only. settings.json is strict JSON, not JSONC,
//     so that caveat lives here and in AGENTS.md § Enforcement — never as a comment
//     in the settings file, where it would break parsing and drop every hook.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_STATE_DIR,
  GENERATED_DOCS,
  hashContent,
  normalizeRepoPath,
  readState,
  updateState,
} from './lib/session-state.mjs';

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

/** Pathspecs of a `git add` argument list: non-flag tokens plus everything after `--`. */
function extractAddPaths(args) {
  const [flags, paths] = splitDoubleDash(args);
  const out = [];
  for (const arg of flags) {
    if (!arg.startsWith('-') && !WHOLE_TREE.has(arg)) out.push(arg);
  }
  for (const p of paths) {
    if (!WHOLE_TREE.has(p)) out.push(p);
  }
  return out;
}

/** True when a `git add` argument list stages the whole worktree. */
function addStagesEverything(args) {
  const [flags, paths] = splitDoubleDash(args);
  let update = false;
  for (const arg of flags) {
    if (arg === '--all' || arg === '--no-ignore-removal') return true;
    if (WHOLE_TREE.has(arg)) return true;
    // Combined short flags: -A, -Av, -vA. Case-sensitive — `-a` is not `-A`.
    if (/^-[A-Za-z]*A[A-Za-z]*$/.test(arg)) return true;
    if (arg === '--update' || /^-[A-Za-z]*u[A-Za-z]*$/.test(arg)) update = true;
  }
  // Everything after `--` is a path, so `-A` there names a FILE and is allowed —
  // but `.` still stages the tree.
  for (const p of paths) if (WHOLE_TREE.has(p)) return true;
  // Bare `-u`/`--update` with no pathspec stages every tracked modification — the same
  // concurrent-agent hazard as -A (this closed the long-documented `-u` gap).
  // `git add -u <path>` stays legitimate.
  if (update && extractAddPaths(args).length === 0) return true;
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

/** Long `git commit` options that consume the NEXT token unless written as --opt=value. */
const COMMIT_LONG_VALUE_FLAGS = new Set([
  '--message', '--file', '--author', '--date', '--cleanup', '--fixup', '--squash',
  '--reuse-message', '--reedit-message', '--trailer', '--pathspec-from-file', '--template',
]);

/**
 * True when a `git commit` argument list names NO pathspec — i.e. it commits whatever
 * the shared index holds. Unknown bare tokens count as pathspecs, so uncertainty fails
 * open (the scope check is skipped, never over-applied).
 */
function commitIsPathless(args) {
  const [flags, paths] = splitDoubleDash(args);
  if (paths.length > 0) return false;
  for (let i = 0; i < flags.length; i++) {
    const arg = flags[i];
    if (arg.startsWith('-')) {
      if (/^-[A-Za-z]*[mcCFS]$/.test(arg)) i++;
      else if (COMMIT_LONG_VALUE_FLAGS.has(arg)) i++;
      continue;
    }
    return false; // bare token = pathspec (or something we can't model — skip the check)
  }
  return true;
}

/**
 * Walk every shell segment of a command line and describe each `git add` / `git commit`.
 * Sibling of {@link offends} — that one stays a boolean for the bulk-staging contract;
 * this one feeds the commit-scope check. Exported for tests — keep it pure.
 * @param {string} command
 * @returns {Array<{ kind: 'add' | 'commit', offense: boolean, paths: string[], isPathless: boolean }>}
 */
export function walkGitSegments(command) {
  const out = [];
  for (const segment of stripQuoted(command).split(/&&|\|\||[;\n|]/)) {
    const m = SEGMENT.exec(segment.trim());
    if (!m) continue;
    const args = m[2].split(/\s+/).filter(Boolean);
    if (m[1] === 'add') {
      out.push({ kind: 'add', offense: addStagesEverything(args), paths: extractAddPaths(args), isPathless: false });
    } else {
      out.push({ kind: 'commit', offense: commitStagesEverything(args), paths: [], isPathless: commitIsPathless(args) });
    }
  }
  return out;
}

/**
 * Scan every shell segment of a command line for an offending `git add` / `git commit`.
 * Exported for tests/claudeHooks.test.js — keep it pure.
 * @param {string} command
 * @returns {boolean}
 */
export function offends(command) {
  return walkGitSegments(command).some((s) => s.offense);
}

const DENIAL =
  'Blocked by .claude/hooks/guard-git-add.mjs. AGENTS.md forbids whole-worktree staging ' +
  'on this repo (`git add -A`, `git add .`, `git add --all`, bare `git add -u`, ' +
  '`git commit -a`) — concurrent agent sessions share this tree, so a bulk stage sweeps up ' +
  "generated captures and another session's in-flight work. Stage the paths you actually " +
  'changed: `git add <path> <path>`, then `git commit -m "…"`. Run `git status --short` ' +
  'first if you need the list.';

/** @param {string[]} foreign */
function foreignDenial(foreign) {
  return (
    'Blocked by .claude/hooks/guard-git-add.mjs (GIT-INDEX-1). This pathspec-less ' +
    '`git commit` would ship staged work this session never touched — concurrent sessions ' +
    'share one git index, so foreign staged paths ride along silently. Foreign: ' +
    `${foreign.slice(0, 8).join(', ')}${foreign.length > 8 ? ', …' : ''}. Remedies, in order: ` +
    '(1) `git restore --staged <those paths>` then commit; ' +
    '(2) `git commit -m "…" -- <your paths>` — WARNING: a pathspec commit skips the ' +
    "pre-commit hook's staged docs ride-along, so BRIEFING/ARCHITECTURE may lag until the " +
    'next normal commit — an escape, not the convention; ' +
    '(3) SKIP_GIT_GUARD=1 when deliberately shipping cross-session work.'
  );
}

/**
 * Paths whose content no longer hashes to what this session recorded writing.
 *
 * Only paths carrying a `writes` entry are considered — a file this session never wrote is
 * GIT-INDEX-1's business, not this check's. A read returning null (missing, unreadable,
 * git failure) is skipped rather than reported: fail open, always.
 *
 * @param {string[]} paths repo-relative, normalized
 * @param {Record<string, string>} writes session write-time hashes
 * @param {(rel: string) => Buffer | string | null} read
 * @returns {string[]}
 */
function driftedAgainstWrites(paths, writes, read) {
  const out = [];
  for (const rel of new Set(paths)) {
    if (GENERATED_DOCS.has(rel)) continue;
    const expected = writes?.[rel];
    if (!expected) continue;
    let actual = null;
    try {
      actual = read(rel);
    } catch {
      actual = null;
    }
    if (actual == null) continue;
    if (hashContent(actual) !== expected) out.push(rel);
  }
  return out;
}

/**
 * GIT-INDEX-2 denial. The two checks need different remedies: Check A fires at `git add`
 * when the WORKTREE drifted and nothing useful is in the index yet, so pointing that case at
 * `--cached` would send the agent somewhere empty.
 * @param {string[]} paths @param {'add' | 'commit'} kind
 */
function driftedDenial(paths, kind) {
  const named = `${paths.slice(0, 8).join(', ')}${paths.length > 8 ? ', …' : ''}`;
  const head = 'Blocked by .claude/hooks/guard-git-add.mjs (GIT-INDEX-2). ';
  if (kind === 'add') {
    return (
      `${head}The worktree content of a file THIS session wrote no longer matches what this ` +
      'session wrote — a concurrent session (or a Bash/script edit) changed it underneath ' +
      `you, and this \`git add\` would stage those bytes as yours. Drifted: ${named}. ` +
      'Remedies, in order: (1) inspect the worktree — `git diff -- <file>`; ' +
      '(2) reconcile to your own write, or re-Edit the file to deliberately claim the ' +
      'foreign bytes, then re-add; ' +
      '(3) SKIP_GIT_GUARD=1 when the drift is your own Bash/script edit.'
    );
  }
  return (
    `${head}Staged content for a file THIS session wrote does not match what this session ` +
    'wrote, so this pathspec-less commit would ship bytes it did not author. Drifted: ' +
    `${named}. Remedies, in order: (1) inspect with \`git diff --cached -- <file>\`; ` +
    '(2) `git restore --staged <file>` — that unstages the WHOLE path, it does not select ' +
    'hunks — then reconcile the worktree and re-add, or `git restore -p --staged` for ' +
    'hunk-level; ' +
    '(3) `git commit -m "…" -- <your paths>`, or SKIP_GIT_GUARD=1 when the drift is yours.'
  );
}

/**
 * The full guard: bulk-staging denial, the GIT-INDEX-1 commit-scope check, the GIT-INDEX-2
 * content checks, and the session staging recorder. Returns a denial reason or null; records
 * allowed `git add` pathspecs into session state as a side effect. Exported for tests — drive
 * it with injected deps ({ env, stateDir, listStaged, readWorktree, readStaged }).
 * @param {any} input PreToolUse payload
 * @param {{ env?: Record<string, string | undefined>, stateDir?: string, listStaged?: (root: string) => string[] | null, readWorktree?: (root: string, rel: string) => Buffer | string | null, readStaged?: (root: string, rel: string) => Buffer | string | null }} [deps]
 * @returns {string | null}
 */
export function evaluateGitCommand(input, deps = {}) {
  const env = deps.env ?? process.env;
  // Escape hatch first — see the header for why reading our own env is the safe form.
  if (env.CART_CLASH_SKIP_HOOKS || env.SKIP_GIT_GUARD) return null;

  const command = input?.tool_input?.command;
  if (typeof command !== 'string' || !command) return null;

  const segments = walkGitSegments(command);
  if (segments.length === 0) return null;
  if (segments.some((s) => s.offense)) return DENIAL;

  const root = env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
  const stateDir = deps.stateDir ?? DEFAULT_STATE_DIR;
  const addPaths = segments
    .filter((s) => s.kind === 'add')
    .flatMap((s) => s.paths)
    .map((p) => normalizeRepoPath(p, root))
    .filter(Boolean);

  // ORDER IS LOAD-BEARING: bulk deny (above) → Check A → GIT-INDEX-1 → Check B → record.
  // The recorder must stay last. If a denied add still landed in `staged`, that path would
  // count as session-owned on the next call and quietly weaken GIT-INDEX-1's own reasoning —
  // the guard would have taught itself to trust exactly what it just rejected.
  const session = readState(stateDir, input?.session_id);

  // GIT-INDEX-2 Check A — worktree, at `git add`. The worktree is what this add is about to
  // stage, which is also why this is the only check that sees a same-command
  // `git add X && git commit` (the index is still pre-add here).
  if (session.existed && addPaths.length > 0) {
    const read = deps.readWorktree ?? readWorktreeContent;
    const drifted = driftedAgainstWrites(addPaths, session.writes, (rel) => read(root, rel));
    if (drifted.length > 0) return driftedDenial(drifted, 'add');
  }

  // GIT-INDEX-1: a pathspec-less commit ships the ENTIRE index. Compare what is staged
  // against what this session owns (touched via Write/Edit, staged via git add — including
  // adds earlier in this same command line, which have not executed yet at PreToolUse
  // time). No session record → allow (tracking may postdate the staging; fail open).
  const pathless = segments.some((s) => s.kind === 'commit' && s.isPathless);
  if (pathless && session.existed) {
    const staged = (deps.listStaged ?? listStagedInIndex)(root);
    if (Array.isArray(staged)) {
      const normalized = staged.map((p) => p.replace(/\\/g, '/').toLowerCase()).filter(Boolean);
      const owned = new Set([...session.staged, ...session.touched, ...addPaths]);
      const foreign = normalized.filter((p) => !GENERATED_DOCS.has(p) && !owned.has(p));
      if (foreign.length > 0) return foreignDenial(foreign);

      // GIT-INDEX-2 Check B — staged blob. Backstop for content staged without an observed
      // `git add`. Reads the index on purpose: worktree drift after a clean add is fine,
      // because the commit ships the clean staged bytes.
      const readBlob = deps.readStaged ?? readStagedBlob;
      const drifted = driftedAgainstWrites(normalized, session.writes, (rel) =>
        readBlob(root, rel)
      );
      if (drifted.length > 0) return driftedDenial(drifted, 'commit');
    }
  }

  if (addPaths.length > 0) {
    updateState(stateDir, input?.session_id, (s) => ({
      staged: [...new Set([...s.staged, ...addPaths])],
    }));
  }
  return null;
}

/** Worktree bytes for a repo-relative path. null on any failure — fail open. */
function readWorktreeContent(root, rel) {
  try {
    return readFileSync(path.resolve(root, rel));
  } catch {
    return null;
  }
}

/**
 * Staged blob for a repo-relative path. `:0:` names stage 0 explicitly, so this stays
 * unambiguous if the index ever carries unmerged stages. null on any failure — fail open.
 */
function readStagedBlob(root, rel) {
  try {
    return execFileSync('git', ['show', `:0:${rel}`], {
      cwd: root,
      timeout: 5000,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/** `git diff --cached --name-only` — the paths currently staged. null on any failure. */
function listStagedInIndex(root) {
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return null; // fail open — a broken git must not block all commits
  }
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
}

async function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  const reason = evaluateGitCommand(JSON.parse(raw));
  if (reason) deny(reason);
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
