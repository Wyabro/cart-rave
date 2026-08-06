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
//   - Disk and index reads now use normalizeRepoPath's CASE-PRESERVED form (HOOK-CASE-1).
//     The previous note here claimed the lowercased form was "not a factor on this repo's
//     Windows tree" — that was false for the index read, and measurably so: `git show :0:`
//     resolves case-sensitively even with core.ignorecase=true (`git show HEAD:docs/status.md`
//     is fatal on this box while `docs/STATUS.md` succeeds), so Check B matched nothing at all
//     for the 37% of tracked files containing an uppercase letter — docs/STATUS.md included.
//     Check A survived only because NTFS folds for readFileSync. Both are live now, which
//     means the documented residuals below (edit→add→edit, `git add -p`, Bash-written files)
//     start firing on paths where they previously could not.
//   - maskQuoted (HOOK-WHOLETREE-2, was stripQuoted) models quoting and nothing else.
//     UNBALANCED quoting — a heredoc, an apostrophe in prose, a multi-line literal —
//     desyncs any pairing scheme, so it deliberately falls back to the raw text and a
//     literal `git add -A` inside such text still false-positives. That direction is
//     chosen: a mask that swallowed a real bulk stage would be a silent hole. Committing
//     the HOOK-WHOLETREE-1 fix hit exactly this — a heredoc quoting the forbidden forms
//     as EXAMPLES — and the answer is `git commit -F <file>` (or SKIP_GIT_GUARD=1), not
//     a cleverer regex.
//   - Quoted pathspecs are now REAL to this guard: `git add "docs/STATUS.md"` used to be
//     recorded as the literal path `""` (so the file it staged read as unowned, and the
//     next pathspec-less commit denied it as foreign — a silent fail-closed positive).
//     It now records the true path, which also means GIT-INDEX-2's content checks start
//     firing on quoted paths where they previously could not see anything at all.
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
//     express `-vA`, `:`, `:(top)`, a literal `*` (in rule syntax `*` IS the wildcard),
//     or the HOOK-WHOLETREE-1 forms (`.\`, `.\\`, an absolute pathspec naming the repo
//     root). Those forms are hook-only. settings.json is strict JSON, not JSONC,
//     so that caveat lives here and in docs/guides/hook-enforcement.md — never as a
//     comment in the settings file, where it would break parsing and drop every hook.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_STATE_DIR,
  GENERATED_DOCS,
  foldKey,
  hashContent,
  normalizeRepoPath,
  readState,
  updateState,
} from './lib/session-state.mjs';

/**
 * Whole-tree pathspecs — staging any of these sweeps the entire worktree. Exact strings,
 * tested against {@link canonicalPathspec}'s output rather than the raw token. (`'./'` is
 * redundant post-canonicalization — it folds to `'.'` — but both are forms an agent actually
 * types, so the table stays readable.)
 */
const WHOLE_TREE = new Set(['.', './', ':/', ':', '*', ':(top)']);

/**
 * Canonical form for the WHOLE_TREE membership test: separators unified, trailing slashes
 * dropped. HOOK-WHOLETREE-1 — `git add .\` is the PowerShell-idiomatic whole-tree stage and
 * git accepts it (verified in a throwaway repo: it stages every file), so an exact-string
 * table was holed on the platform this repo is developed on — the mirror image of the POSIX
 * hole f11e014 closed. `.\\` folds here too, via `.//` → `.`.
 *
 * Used for the membership TEST only: extractAddPaths still returns the raw token, which
 * normalizeRepoPath handles.
 */
function canonicalPathspec(arg) {
  const unified = arg.replace(/\\/g, '/');
  return unified.length > 1 ? unified.replace(/\/+$/, '') : unified;
}

/**
 * True when one `git add` token stages the whole worktree: a literal whole-tree pathspec, or
 * any path that resolves to the repo ROOT — `git add C:\Users\wyatt\cart-rave`,
 * `git add /repo`, `git add src/..`. No literal can express those; the string is
 * machine-specific.
 *
 * That second rule resolves by hand instead of calling normalizeRepoPath, which cannot answer
 * it: normalizeRepoPath maps the repo root to `null`, the SAME value it returns for a path
 * OUTSIDE the tree (tests pin `normalizeRepoPath('.')` as null), so through it "everything"
 * and "nothing" are the same answer.
 *
 * `root` is optional and the rule is inert without it, so a command-only caller — every
 * `offends(cmd)` row in the tests — keeps the pure literal behaviour, while
 * evaluateGitCommand, the only production caller, always threads the real root.
 *
 * @param {string} arg
 * @param {{ root?: string, p?: typeof path }} [opts] path flavour injectable ONLY so tests
 *   can assert both platforms from one machine; production always takes the default.
 */
function isWholeTree(arg, opts = {}) {
  if (WHOLE_TREE.has(canonicalPathspec(arg))) return true;
  const { root, p = path } = opts;
  if (!root) return false;
  try {
    const rel = p.relative(root, p.resolve(root, arg.replace(/\\/g, '/')));
    return rel === '' || rel === '.';
  } catch {
    return false; // fail open, like everything else in this file
  }
}

/**
 * Skip global options and their values (`git -C some/path add …`), then capture the
 * subcommand and its argument list. Each skipped group must start with `-`, so a
 * non-flag token like `log` can never be skipped to reach a later literal `add`
 * (which would false-positive on `git log --grep add --all`). The `\b` keeps `add`
 * a whole token, so `git addendum` never matches.
 *
 * The `d` flag is load-bearing: `indices[2]` is how the argument list is located in the RAW
 * command after the scan has run on the MASKED one (see {@link maskQuoted}).
 */
const SEGMENT = /(?:^|\s)git\s+(?:-\S+\s+(?:\S+\s+)?)*?(add|commit)\b\s*(.*)$/d;

/** Filler for a masked quote interior. A word character, so it can never close a `\b`. */
const MASK = '_';

/**
 * Mask the INTERIOR of quoted spans, preserving length and therefore every character offset.
 *
 * HOOK-WHOLETREE-2. The predecessor, `stripQuoted`, collapsed `"…"` to `""` — which did
 * neutralize a commit message that quotes the forbidden command, but it destroyed the token,
 * and the matcher runs on what is left. Two consequences, in BOTH directions:
 *   - `git add "."` reached the matcher as the token `""`, in no whole-tree table → allowed.
 *     Same for `git add '.'` and for a quoted absolute root. That is the card.
 *   - `git add "docs/STATUS.md"` was recorded into session state as the literal path `""`,
 *     so the file it actually staged read as UNOWNED and the next pathspec-less commit
 *     denied as foreign. A silent, fail-closed false positive nobody had traced.
 * Masking instead of deleting keeps the structural protection (the split and the `git add`
 * scan see `_____`, never the message text) while the pathspec survives in the raw string
 * at the same offsets, where {@link tokenize} reads it.
 *
 * Deliberately NOT a shell parser: quoting is the only thing modelled.
 */
function maskQuoted(s) {
  const out = s.split('');
  let quote = null;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (quote === null) {
      if (c === '"' || c === "'") quote = c;
      continue;
    }
    if (c === quote) {
      quote = null;
      continue;
    }
    // Inside "…" a backslash escapes the next character, including a quote — without this,
    // `git commit -m "say \"git add -A\""` closes early and the tail scans as a real command.
    if (c === '\\' && quote === '"' && i + 1 < out.length) {
      out[i] = MASK;
      out[++i] = MASK;
      continue;
    }
    out[i] = MASK;
  }
  // Unbalanced quotes — a heredoc, an apostrophe in prose — desync any pairing scheme, the
  // old regex pair included. Fall back to the RAW text so the literal scan still sees
  // everything: that keeps the failure in the false-POSITIVE direction, which is where it
  // already was and where it must stay. A mask that swallowed a real `git add -A` would be a
  // silent hole, which is strictly worse than a denial with a named escape hatch.
  return quote === null ? out.join('') : s;
}

/** `[start, end)` ranges of each shell segment, as offsets into the masked string. */
function segmentRanges(masked) {
  const ranges = [];
  const re = /&&|\|\||[;\n|]/g;
  let last = 0;
  for (let m; (m = re.exec(masked)); ) {
    ranges.push([last, m.index]);
    last = m.index + m[0].length;
  }
  ranges.push([last, masked.length]);
  return ranges;
}

/** Drop balanced quote pairs from one token: `"."` → `.`, `"C:\repo"` → `C:\repo`. */
function unquote(tok) {
  return tok.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (s) => s.slice(1, -1));
}

/**
 * Tokenize an argument list by the MASKED text — so a quoted value keeps its spaces and stays
 * ONE token — while taking each token's characters from the RAW text at the same offsets.
 * Lengths match exactly; that is what maskQuoted preserves length for.
 */
function tokenize(maskedArgs, rawArgs) {
  const out = [];
  const re = /\S+/g;
  for (let m; (m = re.exec(maskedArgs)); ) {
    const tok = unquote(rawArgs.slice(m.index, m.index + m[0].length));
    if (tok) out.push(tok);
  }
  return out;
}

/** Split an argument list on the first `--` separator into [flags, paths]. */
function splitDoubleDash(args) {
  const i = args.indexOf('--');
  return i === -1 ? [args, []] : [args.slice(0, i), args.slice(i + 1)];
}

/**
 * Pathspecs of a `git add` argument list: non-flag tokens plus everything after `--`.
 * @param {string[]} args @param {{ root?: string, p?: typeof path }} [opts] see isWholeTree
 */
function extractAddPaths(args, opts) {
  const [flags, paths] = splitDoubleDash(args);
  const out = [];
  for (const arg of flags) {
    if (!arg.startsWith('-') && !isWholeTree(arg, opts)) out.push(arg);
  }
  for (const p of paths) {
    if (!isWholeTree(p, opts)) out.push(p);
  }
  return out;
}

/**
 * True when a `git add` argument list stages the whole worktree.
 * @param {string[]} args @param {{ root?: string, p?: typeof path }} [opts] see isWholeTree
 */
function addStagesEverything(args, opts) {
  const [flags, paths] = splitDoubleDash(args);
  let update = false;
  for (const arg of flags) {
    if (arg === '--all' || arg === '--no-ignore-removal') return true;
    if (isWholeTree(arg, opts)) return true;
    // Combined short flags: -A, -Av, -vA. Case-sensitive — `-a` is not `-A`.
    if (/^-[A-Za-z]*A[A-Za-z]*$/.test(arg)) return true;
    if (arg === '--update' || /^-[A-Za-z]*u[A-Za-z]*$/.test(arg)) update = true;
  }
  // Everything after `--` is a path, so `-A` there names a FILE and is allowed —
  // but `.` still stages the tree.
  for (const p of paths) if (isWholeTree(p, opts)) return true;
  // Bare `-u`/`--update` with no pathspec stages every tracked modification — the same
  // concurrent-agent hazard as -A (this closed the long-documented `-u` gap).
  // `git add -u <path>` stays legitimate. `opts` threads through here too, so this call
  // and the `paths` this segment reports agree on what counts as a pathspec.
  if (update && extractAddPaths(args, opts).length === 0) return true;
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
 * @param {{ root?: string, p?: typeof path }} [opts] repo root (and path flavour) for the
 *   absolute-root whole-tree rule — see {@link isWholeTree}. Omit and that rule is inert.
 * @returns {Array<{ kind: 'add' | 'commit', offense: boolean, paths: string[], isPathless: boolean }>}
 */
export function walkGitSegments(command, opts) {
  const out = [];
  const masked = maskQuoted(command);
  for (const [start, end] of segmentRanges(masked)) {
    const segment = masked.slice(start, end);
    const m = SEGMENT.exec(segment);
    if (!m) continue;
    // Scan on the masked segment, read the arguments from the raw one at the same offsets.
    const [as, ae] = m.indices[2];
    const args = tokenize(segment.slice(as, ae), command.slice(start + as, start + ae));
    if (m[1] === 'add') {
      out.push({ kind: 'add', offense: addStagesEverything(args, opts), paths: extractAddPaths(args, opts), isPathless: false });
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
 * @param {{ root?: string, p?: typeof path }} [opts] see {@link walkGitSegments}
 * @returns {boolean}
 */
export function offends(command, opts) {
  return walkGitSegments(command, opts).some((s) => s.offense);
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
    if (GENERATED_DOCS.has(foldKey(rel))) continue;
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

  // ORDER IS LOAD-BEARING: `root` must be resolved BEFORE the walk. The whole-tree matcher
  // needs it to recognize an absolute pathspec naming the repo root (HOOK-WHOLETREE-1), and
  // the offense check below short-circuits — resolve root after it, as this did, and that
  // rule can never fire in production no matter how green its unit tests are.
  const root = env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
  const segments = walkGitSegments(command, { root });
  if (segments.length === 0) return null;
  if (segments.some((s) => s.offense)) return DENIAL;

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
      // * Case-PRESERVED (HOOK-CASE-1): git reports the index's real case here, and that is
      // * both the ownership key and — via Check B below — the path handed to `git show :0:`,
      // * whose lookup is case-sensitive even under core.ignorecase. Folding made every
      // * uppercase path miss on both counts. GENERATED_DOCS is the one authored-lowercase
      // * table in this line, so it gets an explicit foldKey and nothing else does.
      const normalized = staged.map((p) => p.replace(/\\/g, '/')).filter(Boolean);
      const owned = new Set([...session.staged, ...session.touched, ...addPaths]);
      const foreign = normalized.filter((p) => !GENERATED_DOCS.has(foldKey(p)) && !owned.has(p));
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
