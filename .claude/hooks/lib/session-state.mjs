// Per-session scratch state shared by the Claude Code hooks, keyed by session_id in a
// tmpdir file. One file per session:
// { blocks, lastKey, touched: [], staged: [], writes: {} }.
//   blocks/lastKey — guard-stop-drift's anti-spam counter (its original tenant)
//   touched        — repo-relative paths this session wrote via Write/Edit/etc.
//                    (recorded by track-session-writes.mjs)
//   staged         — pathspecs this session staged via allowed `git add <paths>`
//                    (recorded by guard-git-add.mjs)
//   writes         — path → content hash of what this session actually wrote, the
//                    GIT-INDEX-2 fingerprint (recorded by track-session-writes.mjs).
//                    `touched` answers "did this session write this path"; `writes`
//                    answers "is the content still what this session wrote".
// Everything here fails soft: a read/write error yields defaults / a no-op, because a
// missing state file must degrade a guard toward silence, never toward a false block.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import path from 'node:path';

export const DEFAULT_STATE_DIR = join(tmpdir(), 'cart-clash-stopguard');

/**
 * Generated, pre-commit-managed files (lowercase repo-relative): the pre-commit hook
 * regenerates and stages these on every commit, so no guard treats their dirt or their
 * staged presence as another session's work.
 */
export const GENERATED_DOCS = new Set(['docs/briefing.md', 'docs/architecture.json']);

const DEFAULTS = { blocks: 0, lastKey: '', touched: [], staged: [], writes: {} };

/** Hex characters kept from the sha256 in {@link hashContent}. */
export const HASH_HEX_LEN = 16;

/**
 * The content fingerprint used on BOTH sides of the GIT-INDEX-2 comparison — recorded from
 * the worktree by track-session-writes.mjs, recomputed from the worktree or the staged blob
 * by guard-git-add.mjs. Shared so the two can never drift on algorithm.
 *
 * CRLF is normalized away deliberately: this repo runs `core.autocrlf`, so worktree bytes
 * and index blob bytes differ by line ending and a raw hash of one would never match the
 * other.
 *
 * @param {Buffer | string} content
 * @returns {string} the first HASH_HEX_LEN hex chars of the sha256
 */
export function hashContent(content) {
  const text = (typeof content === 'string' ? content : content.toString('utf8')).replace(
    /\r\n/g,
    '\n'
  );
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, HASH_HEX_LEN);
}

/**
 * True for a plain object usable as a string→string map. `typeof [] === 'object'`, so an
 * array would sail through a bare typeof check and then misbehave on key access — a corrupt
 * or pre-GIT-INDEX-2 `writes: []` must degrade to {}, not throw.
 * @param {unknown} v
 */
function isMap(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Windows rejects <>:"/\|?* in filenames, and session ids are not guaranteed safe. */
export function statePath(dir, sessionId) {
  const safe = String(sessionId || 'unknown')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 64);
  return join(dir, `${safe}.json`);
}

/**
 * Read this session's state. `existed` distinguishes "no file yet" (a session the
 * trackers have never seen — guards should stay quiet about dirt) from real content.
 * @param {string} dir @param {string} sessionId
 * @returns {{ blocks: number, lastKey: string, touched: string[], staged: string[], writes: Record<string, string>, existed: boolean }}
 */
export function readState(dir, sessionId) {
  try {
    const parsed = JSON.parse(readFileSync(statePath(dir, sessionId), 'utf8'));
    return {
      ...DEFAULTS,
      ...parsed,
      touched: Array.isArray(parsed.touched) ? parsed.touched : [],
      staged: Array.isArray(parsed.staged) ? parsed.staged : [],
      writes: isMap(parsed.writes) ? parsed.writes : {},
      existed: true,
    };
  } catch {
    // Fresh containers, not DEFAULTS' own — spreading would hand every caller the same
    // array and map instances.
    return { ...DEFAULTS, touched: [], staged: [], writes: {}, existed: false };
  }
}

/**
 * Read-merge-write this session's state. All failures swallowed.
 * @param {string} dir @param {string} sessionId
 * @param {(state: ReturnType<typeof readState>) => object} fn returns the fields to merge
 */
export function updateState(dir, sessionId, fn) {
  try {
    const state = readState(dir, sessionId);
    const next = { ...state, ...fn(state) };
    delete next.existed;
    const file = statePath(dir, sessionId);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(next));
  } catch {
    /* fail soft */
  }
}

/**
 * Normalize a file path to the repo-relative lowercase forward-slash form used for
 * membership checks against `touched` / `staged`. Returns null for paths outside root.
 *
 * The backslash pass on the way IN is load-bearing and platform-independent. `path.sep` is
 * `\` on Windows and `/` on POSIX, and on POSIX a backslash is a legal filename BYTE — so
 * `path.resolve` never treats it as a separator there and `split(path.sep)` is a no-op.
 * Windows-shaped input (which Claude Code genuinely sends: `src\Main.js`) therefore
 * normalized on the dev box and passed through untouched on Linux CI, which is what put
 * two of these tests red for a day. Folding separators before resolving makes both
 * platforms agree.
 *
 * Two consequences, both accepted: a legal POSIX filename containing a backslash is
 * rewritten (`git ls-files` finds none in this repo, and the miss is fail-closed — the path
 * stops reading as owned, so a pathspec-less commit denies rather than allows); and on
 * POSIX several previously-tracked oddities (UNC forms, `..\..\etc\passwd`) now resolve
 * out of the tree and return null, which is strictly stricter.
 *
 * @param {string} target @param {string} root
 * @param {typeof path} [p] path flavour — injectable ONLY so tests can assert both
 *   platforms from one machine; production always takes the default.
 * @returns {string | null}
 */
export function normalizeRepoPath(target, root, p = path) {
  if (typeof target !== 'string' || !target) return null;
  const unified = target.replace(/\\/g, '/');
  const rel = p
    .relative(root, p.resolve(root, unified))
    .split(p.sep)
    .join('/')
    .toLowerCase();
  if (!rel || rel === '..' || rel.startsWith('../') || p.isAbsolute(rel)) return null;
  return rel;
}
