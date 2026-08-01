#!/usr/bin/env node
// SessionStart hook — injects the committed cold-start briefing so every session
// starts rehydrated, instead of relying on the agent to go read it.
// AGENTS.md: "Session rehydration (read first when cold): read docs/BRIEFING.md".
//
// Deliberately does nothing but two file reads. SessionStart runs on every session
// and must stay fast, so this never shells out to `npm run briefing` — if the
// briefing looks stale it says so and lets the agent decide.

import fs from 'node:fs';
import path from 'node:path';

// A STATUS.md edit always lands before the regenerate, so a small grace window keeps
// a fresh clone — where every file shares one checkout mtime — from warning on nothing.
const STALE_GRACE_MS = 60_000;

const HEADER = [
  'Repo cold-start context, injected automatically from the committed docs/BRIEFING.md',
  'by .claude/hooks/session-briefing.mjs. This is the read-order door named in CLAUDE.md',
  'and AGENTS.md — the file is already below, no need to read it again.',
].join('\n');

function emit(additionalContext) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
    })
  );
}

/** Warn when STATUS.md has moved on but the briefing has not been regenerated. */
function stalenessNote(briefingPath, statusPath) {
  try {
    const drift = fs.statSync(statusPath).mtimeMs - fs.statSync(briefingPath).mtimeMs;
    if (drift <= STALE_GRACE_MS) return null;
    return (
      '> WARNING: docs/STATUS.md is newer than this briefing, so the phase / ACTIVE CARD below ' +
      'may be stale. Run `npm run briefing` to refresh it — `npm run health:check` red-gates ' +
      'on the same drift.'
    );
  } catch {
    return null; // No STATUS.md to compare against.
  }
}

try {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  const input = raw ? JSON.parse(raw) : {};
  const root = process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
  const briefingPath = path.join(root, 'docs', 'BRIEFING.md');
  const statusPath = path.join(root, 'docs', 'STATUS.md');

  const briefing = fs.readFileSync(briefingPath, 'utf8').trim();
  const note = stalenessNote(briefingPath, statusPath);

  emit([HEADER, note, briefing].filter(Boolean).join('\n\n'));
} catch {
  // Fail soft — a missing or unreadable briefing must not swallow the rehydration step.
  emit(
    'docs/BRIEFING.md could not be read at session start. Regenerate it with `npm run briefing`, ' +
      'then follow the cold-start read order: AGENTS.md (canonical rules) then the top of ' +
      'docs/STATUS.md, before touching code.'
  );
}

process.exit(0);
