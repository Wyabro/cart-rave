#!/usr/bin/env node
// PostToolUse tracker — records which repo files THIS session has written
// (Write|Edit|MultiEdit|NotebookEdit) into the per-session state file, so
// guard-stop-drift can scope its dirty-tree check to this session's own edits
// instead of blocking on every concurrent session's in-flight work (STOP-DIRT-1).
//
// Known blind spot, accepted: files written via Bash (sed, heredocs, npm scripts)
// are not seen here. Generated docs are covered by guard-stop-drift's allowlist;
// other Bash-only edits simply go untracked, which degrades the Stop guard toward
// silence (a false-negative), never toward a false block.
//
// Never blocks, never outputs, fails open on any error. Escape: CART_CLASH_SKIP_HOOKS=1.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_STATE_DIR,
  hashContent,
  normalizeRepoPath,
  updateState,
} from './lib/session-state.mjs';

/** Above this, skip the content hash — the GIT-INDEX-2 checks then simply don't cover it. */
const MAX_HASH_BYTES = 4 * 1024 * 1024;

/**
 * Pure recorder — exported for tests/claudeHooks.test.js.
 * @param {any} input PostToolUse payload
 * @param {{ stateDir?: string, env?: Record<string, string | undefined>, readFile?: (abs: string) => Buffer | string | null }} [deps]
 */
export function trackWrite(input, deps = {}) {
  const env = deps.env ?? process.env;
  if (env.CART_CLASH_SKIP_HOOKS) return;

  const target = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
  const root = env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
  const rel = normalizeRepoPath(target, root);
  if (!rel) return;

  // GIT-INDEX-2: fingerprint the content NOW, at PostToolUse, when disk holds exactly what
  // this session produced. Hashing later (at `git add`) would fingerprint whatever a
  // concurrent session had since written — i.e. it would bless the very leak this catches.
  const hash = hashWritten(path.resolve(root, target), deps);

  updateState(deps.stateDir ?? DEFAULT_STATE_DIR, input?.session_id, (state) => ({
    touched: state.touched.includes(rel) ? state.touched : [...state.touched, rel],
    ...(hash ? { writes: { ...state.writes, [rel]: hash } } : {}),
  }));
}

/**
 * Content hash of the file just written, or null on any problem (missing, unreadable,
 * oversized). Null means the path keeps its `touched` entry but gains no `writes` entry, so
 * the content checks skip it and only GIT-INDEX-1's path ownership applies.
 * @param {string} abs @param {{ readFile?: (abs: string) => Buffer | string | null }} deps
 */
function hashWritten(abs, deps) {
  try {
    const read = deps.readFile ?? ((p) => readFileSync(p));
    const buf = read(abs);
    if (buf == null || buf.length > MAX_HASH_BYTES) return null;
    return hashContent(buf);
  } catch {
    return null;
  }
}

const isMain =
  process.argv[1] && /track-session-writes\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));

if (isMain) {
  try {
    let raw = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) raw += chunk;
    trackWrite(JSON.parse(raw));
  } catch {
    // Fail open — a tracker must never wedge a session.
  }
  process.exit(0);
}
