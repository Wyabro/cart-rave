#!/usr/bin/env node
/**
 * commit-msg-guard.mjs — BACKLOG-GATE-3 lever 1. Stops one commit from carrying two
 * cards' claims.
 *
 * Why this exists (the 08-07 audit, one provable chain):
 *   `c8f65d8` subject = "SPAWN-SUNDIAL-GAP-1: bump zanzibar gap to 3.75; ONBOARD-SCROLL-1:
 *   overflow:hidden on cr-howto-body" — two claims, one commit, and the diff held only
 *   the CSS and a test. The config bump it advertised had already been swept into
 *   `92c44f2` twenty-four seconds earlier, a commit titled for AI-DAY-SELFKO-1. So the
 *   ID was in the wrong commit, `git log --grep SPAWN-SUNDIAL-GAP-1` showed a fix that
 *   wasn't there, and the row stayed open for a day until Wyatt hit it again.
 *
 * What it can and cannot do — read this before "strengthening" it:
 *   It reads the SUBJECT, never the diff's meaning. It cannot know which files a card
 *   owns, so it cannot prove a commit contains the change it claims. It only enforces
 *   the one rule that makes the claim legible: a code commit states ONE card.
 *   The detector for work that lands with no ID at all is `npm run backlog:audit`
 *   (lever 2) — pickaxe over each open row's cited lever. The two are a pair; this one
 *   alone would not have caught `92c44f2`.
 *
 * Docs-only commits are exempt: closing a wave legitimately names every card it retires
 * ("docs: close Block I desk-only wave — 4 cards closed (…)"). The rule is about code.
 *
 * Measured against 400 commits of real history: 245 code commits, 7 named >1 id, of
 * which 2 are the defect above. Hence the split — hard error only for the ";"-joined
 * two-claim subject that is unambiguously two cards, warn for the rest (a card named in
 * passing, e.g. "MAIN-1 Lever G: extract menuPlayEntry (BUNDLE-1 unlock seam)", is
 * normal and must stay committable).
 *
 * Escape hatch: SKIP_GIT_GUARD=1 git commit …
 */

import fs from "node:fs";
import { execFileSync } from "node:child_process";

/** Card ids: uppercase segments, at least one hyphen, and a digit somewhere (NET-RING-1). */
const ID_RE = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g;

/** @param {string[]} argv @returns {string | null} */
function git(argv) {
  try {
    return execFileSync("git", argv, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

const msgPath = process.argv[2];
if (!msgPath) process.exit(0);

let raw = "";
try {
  raw = fs.readFileSync(msgPath, "utf8");
} catch {
  process.exit(0);
}

const subject = raw.split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "";

// Merges, fixups and reverts are not authored claims — leave them alone.
if (/^(Merge |Revert |fixup!|squash!)/.test(subject)) process.exit(0);

const staged = (git(["diff", "--cached", "--name-only"]) ?? "").split("\n").filter(Boolean);
const codeFiles = staged.filter((f) => !f.startsWith("docs/") && !f.endsWith(".md"));
if (!codeFiles.length) process.exit(0);

const ids = [...new Set(subject.match(ID_RE) ?? [])].filter((s) => /\d/.test(s));
if (ids.length < 2) process.exit(0);

// Two claims = two ids each introducing their own clause. That is two cards in one
// commit, and it is what makes an id land on a diff that does not hold its change.
const twoClaims = ids.filter((id) => new RegExp(`${id}\\s*:`).test(subject)).length >= 2;

if (twoClaims) {
  console.error(`
[commit-msg] BACKLOG-GATE-3: this subject makes ${ids.length} card claims in one code commit.

  ${subject}

  ids: ${ids.join(", ")}

  One card per code commit — otherwise an id ends up on a diff that does not contain its
  change, and the next agent greps for it, finds this commit, and believes the card shipped.
  Split it: commit each card's files under its own subject.

  Bypass (you are sure): SKIP_GIT_GUARD=1 git commit …
`);
  process.exit(1);
}

console.error(
  `[commit-msg] BACKLOG-GATE-3 warning: subject names ${ids.length} cards (${ids.join(", ")}) on a code commit. ` +
    `Fine if only one of them owns this diff — but the others will still answer to \`git log --grep\`.`,
);
process.exit(0);
