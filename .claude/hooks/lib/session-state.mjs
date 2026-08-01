// Per-session scratch state shared by the Claude Code hooks, keyed by session_id in a
// tmpdir file. One file per session: { blocks, lastKey, touched: [], staged: [] }.
//   blocks/lastKey — guard-stop-drift's anti-spam counter (its original tenant)
//   touched        — repo-relative paths this session wrote via Write/Edit/etc.
//                    (recorded by track-session-writes.mjs)
//   staged         — pathspecs this session staged via allowed `git add <paths>`
//                    (recorded by guard-git-add.mjs)
// Everything here fails soft: a read/write error yields defaults / a no-op, because a
// missing state file must degrade a guard toward silence, never toward a false block.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import path from 'node:path';

export const DEFAULT_STATE_DIR = join(tmpdir(), 'cart-clash-stopguard');

const DEFAULTS = { blocks: 0, lastKey: '', touched: [], staged: [] };

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
 * @returns {{ blocks: number, lastKey: string, touched: string[], staged: string[], existed: boolean }}
 */
export function readState(dir, sessionId) {
  try {
    const parsed = JSON.parse(readFileSync(statePath(dir, sessionId), 'utf8'));
    return {
      ...DEFAULTS,
      ...parsed,
      touched: Array.isArray(parsed.touched) ? parsed.touched : [],
      staged: Array.isArray(parsed.staged) ? parsed.staged : [],
      existed: true,
    };
  } catch {
    return { ...DEFAULTS, existed: false };
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
 * @param {string} target @param {string} root
 * @returns {string | null}
 */
export function normalizeRepoPath(target, root) {
  if (typeof target !== 'string' || !target) return null;
  const rel = path
    .relative(root, path.resolve(root, target))
    .split(path.sep)
    .join('/')
    .toLowerCase();
  if (!rel || rel.startsWith('../') || path.isAbsolute(rel)) return null;
  return rel;
}
