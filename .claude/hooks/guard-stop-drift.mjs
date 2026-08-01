#!/usr/bin/env node
// Stop guard — blocks a "done / verified" claim while the branch is actually drifted.
// AGENTS.md: "Never say 'done' or 'verified' without git-pulling `cart-clash` and
// confirming the change is actually in HEAD" and "No unpushed claims — call it
// 'unpushed' until it lands on origin/cart-clash". Those rules were enforced by nothing:
// the repo had no fetch capability at all until tools/verify-head.mjs.
//
// Fires only when a completion CLAIM and REAL DRIFT coincide, so a clean turn is never
// interrupted, and most turns cost one regex and touch no git at all.
//
// stop_hook_active POLARITY — verified against the shipped Claude Code binary, not the
// docs (a doc summary got this backwards twice during planning). Verbatim from the
// binary: "For Stop/SubagentStop hooks, check stop_hook_active in the input and return
// success while it's true. Set CLAUDE_CODE_STOP_HOOK_BLOCK_CAP to raise this limit."
//   true  → we are ALREADY continuing because of a prior block → return null, do not re-block
//   false → normal first Stop → run the guard
// Do not invert this. `if (stop_hook_active) run the guard` disables it on every normal
// turn. The platform also caps consecutive blocks at 8 (CLAUDE_CODE_STOP_HOOK_BLOCK_CAP).
//
// Because that flag ends a re-block chain after the first block, the tmpdir counter below
// is NOT loop prevention — it is session-level anti-spam across separate stop attempts,
// so the same unchanged drift is not re-flagged all session.
//
// Escape hatch: CART_CLASH_SKIP_HOOKS=1 or SKIP_STOP_GUARD=1, read from this process's
// own inherited env — never parsed out of any model-authored text. See guard-git-add.mjs.
//
// Fails open by design: any parse or logic error exits 0.
//
// Shape: evaluateStop() is pure-ish logic that RETURNS {decision, reason} | null and
// never writes stdout or exits. The stdin wrapper at the bottom owns all I/O. Keep it
// that way — tests/claudeHooks.test.js drives evaluateStop directly with a fake
// checkHeadDrift, which is the only way to exercise drift without live git state.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkHeadDrift } from '../../tools/verify-head.mjs';

/** Max blocks per session before this guard goes quiet. */
const MAX_BLOCKS = 2;

/** Fenced blocks, inline code, and indented code — a pasted `git log` must not fire a claim. */
function stripCode(s) {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/^\s{4,}\S.*$/gm, ' ');
}

/** Completion claims, in the vocabulary AGENTS.md actually targets. */
const CLAIM = [
  /\b(?:i|we)(?:'ve| have)\s+(?:\w+\s+){0,3}?(?:shipped|landed|pushed|deployed|verified|finished|completed)\b/i,
  /\b(?:it's|that's|this is|everything(?:'s| is)|the (?:fix|change|work|card|branch|commit) is)\s+(?:now\s+)?(?:done|complete|completed|shipped|landed|live)\b/i,
  /(?:^|[.!?\n]\s*|\*\*)\s*(?:done|complete|completed|shipped|landed|verified|finished)\b\s*(?:[.!:—-]|\*\*|$)/im,
  /\b(?:is|are)\s+(?:now\s+)?in\s+(?:origin\/)?\S*HEAD\b/i,
  /\bverified\s+(?:in|on|against)\b/i,
  /\ball\s+(?:gates?|checks?|tests?)\s+(?:are\s+)?green\b/i,
  /\bready\s+to\s+(?:ship|merge)\b/i,
];

/** Applied to the ~60 chars before a hit: kills "not done", "once done", "will be complete". */
const VETO =
  /\b(?:not|isn't|aren't|wasn't|never|before|until|once|when|after|todo|cannot|can't|needs? to|need to|still|remains?|pending|yet|would be|will be|should be|planned|next step)\b[^.!?]{0,50}$/i;

/**
 * True when the text asserts the work is finished. Exported for tests.
 * @param {string} text
 * @returns {boolean}
 */
export function claimsCompletion(text) {
  if (typeof text !== 'string' || !text) return false;
  const clean = stripCode(text);
  for (const re of CLAIM) {
    const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m;
    while ((m = rx.exec(clean)) !== null) {
      if (!VETO.test(clean.slice(Math.max(0, m.index - 60), m.index))) return true;
      if (m.index === rx.lastIndex) rx.lastIndex++;
    }
  }
  return false;
}

/** Windows rejects <>:"/\|?* in filenames, and session ids are not guaranteed safe. */
function counterPath(dir, sessionId) {
  const safe = String(sessionId || 'unknown')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 64);
  return join(dir, `${safe}.json`);
}

/**
 * Consume one block from this session's budget. Returns false when the guard should stay
 * quiet: budget spent, or this exact drift state was already flagged.
 * @param {string} dir @param {string} sessionId @param {string} key
 * @returns {boolean}
 */
function spendBlock(dir, sessionId, key) {
  const file = counterPath(dir, sessionId);
  let state = { blocks: 0, lastKey: '' };
  try {
    state = { ...state, ...JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    /* first block of the session — defaults stand */
  }
  if (state.lastKey === key) return false;
  if (state.blocks >= MAX_BLOCKS) return false;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ blocks: state.blocks + 1, lastKey: key }));
  } catch {
    /* tmpdir unwritable — still worth blocking once, just without memory */
  }
  return true;
}

/**
 * All the logic, none of the I/O. Returns null to let the turn end.
 * @param {any} input Stop hook payload
 * @param {{ checkHeadDrift?: typeof checkHeadDrift, counterDir?: string, env?: Record<string, string | undefined> }} [deps]
 * @returns {{ decision: 'block', reason: string } | null}
 */
export function evaluateStop(input, deps = {}) {
  const env = deps.env ?? process.env;
  if (env.CART_CLASH_SKIP_HOOKS || env.SKIP_STOP_GUARD) return null;

  // See the polarity note in the header. true = already continuing after a prior block.
  if (input?.stop_hook_active === true) return null;

  if (!claimsCompletion(input?.last_assistant_message)) return null;

  const drift = (deps.checkHeadDrift ?? checkHeadDrift)(
    input?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd()
  );
  if (!drift?.drifted) return null;

  const key = `${drift.branch}|${drift.ahead}|${drift.behind}|${drift.trackedDirty.join(',')}`;
  const dir = deps.counterDir ?? join(tmpdir(), 'cart-clash-stopguard');
  if (!spendBlock(dir, input?.session_id, key)) return null;

  return {
    decision: 'block',
    reason:
      `That reads as a completion claim, but this tree is NOT in sync: ${drift.reasons.join('; ')}. ` +
      'AGENTS.md: "Never say \'done\' or \'verified\' without git-pulling `cart-clash` and confirming ' +
      'the change is actually in HEAD", and "call it **unpushed** until it lands on origin/cart-clash". ' +
      'Either push and re-check with `npm run verify:head`, or restate the status honestly — ' +
      '"applied, unpushed" is the accurate phrasing and will not be blocked. ' +
      '(Guard: .claude/hooks/guard-stop-drift.mjs — set SKIP_STOP_GUARD=1 to bypass.)',
  };
}

async function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  const verdict = evaluateStop(JSON.parse(raw));
  if (verdict) process.stdout.write(JSON.stringify(verdict));
}

const isMain =
  process.argv[1] && /guard-stop-drift\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));

if (isMain) {
  try {
    await main();
  } catch {
    // Fail open — never wedge a session on a bug in this guard.
  }
  process.exit(0);
}
