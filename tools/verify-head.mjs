/**
 * verify-head.mjs — is this working tree actually in sync with its upstream?
 *
 *   npm run verify:head               # report drift; exit 1 when out of sync
 *   npm run verify:head -- --json     # machine-readable (hooks / CI consumers)
 *
 * AGENTS.md forbids claiming "done"/"verified" without confirming the change is in
 * `origin/cart-clash` HEAD, and requires calling local work **"unpushed"** until it
 * lands. Until this file existed the repo had no way to check: `collectGit` in
 * lib/projectHealth.mjs derives ahead/behind from the local `origin/<branch>` ref,
 * which is only as fresh as the last manual fetch — this tree once reported "in sync"
 * against a ref that was ten hours stale. This asks the remote directly.
 *
 * Uses `git ls-remote`, never `git fetch`: it makes ZERO writes — no ref updates, no
 * FETCH_HEAD, no lock contention with a concurrent agent session sharing this tree —
 * and still yields exact ahead/behind counts.
 *
 * Deliberately NOT in `npm run qa`: a network call must never become a hard dependency
 * of CI or of offline QA. It runs in `npm run release:check`, and the Stop hook
 * (.claude/hooks/guard-stop-drift.mjs) imports checkHeadDrift directly rather than
 * shelling out, so there is one implementation and one process.
 *
 * Exit codes: 0 in sync · 1 drift (unpushed / behind / dirty tracked files) · 2 setup error.
 */

import { execFileSync } from "node:child_process";
import { parseArgs, makeLogger } from "./lib/harness.mjs";

const log = makeLogger("verify:head");

/** Hard ceiling on the one network call — well inside the Stop hook's 15s budget. */
const REMOTE_TIMEOUT_MS = 4_000;

/**
 * Git without a shell, degrading to null on failure — the convention shared by
 * briefing / architecture / playtest-console / battery / projectHealth.
 * @param {string} cwd
 * @param {string[]} argv
 * @returns {string | null}
 */
function git(cwd, argv) {
  try {
    return execFileSync("git", argv, { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * Ask the remote for a branch tip. Separate from git() because it needs a hard timeout
 * and prompt suppression: without GIT_TERMINAL_PROMPT / *_ASKPASS a credential helper
 * can block past the hook timeout and wedge the turn. Not optional.
 * @param {string} cwd
 * @param {string} remote
 * @param {string} branch
 * @returns {string | null} tip SHA, or null when the remote is unreachable
 */
function lsRemote(cwd, remote, branch) {
  try {
    const out = execFileSync("git", ["ls-remote", "--heads", remote, branch], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: REMOTE_TIMEOUT_MS,
      killSignal: "SIGKILL",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "",
        SSH_ASKPASS: "",
        GCM_INTERACTIVE: "never",
        GIT_OPTIONAL_LOCKS: "0",
      },
    })
      .toString()
      .trim();
    const m = /^([0-9a-f]{40})\b/.exec(out);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * @typedef {object} HeadDrift
 * @property {string | null} branch           "HEAD" when detached
 * @property {string | null} upstream         e.g. "origin/cart-clash"; null when unset/detached
 * @property {number | null} ahead            null when the remote could not be reached
 * @property {number | null} behind
 * @property {string[]} trackedDirty          porcelain lines; untracked excluded by construction
 * @property {boolean} remoteReachable
 * @property {boolean} drifted
 * @property {string[]} reasons               one per drift condition, human-readable
 */

/**
 * Pure data — never prints, never exits. The CLI below and the Stop hook both render it.
 * @param {string} cwd
 * @param {{ lsRemote?: (cwd: string, remote: string, branch: string) => string | null }} [opts]
 * @returns {HeadDrift}
 */
export function checkHeadDrift(cwd, opts = {}) {
  const ask = opts.lsRemote ?? lsRemote;
  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const upstream = git(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);

  // * Untracked files are excluded by the flag, not by parsing porcelain status codes:
  // * .agents/, .claude/skills/ and friends are legitimately untracked and must never
  // * read as drift. No code-parsing bug surface.
  const dirtyRaw = git(cwd, ["status", "--porcelain", "--untracked-files=no"]);
  const trackedDirty = dirtyRaw ? dirtyRaw.split("\n").filter(Boolean) : [];

  /** @type {HeadDrift} */
  const out = {
    branch,
    upstream,
    ahead: null,
    behind: null,
    trackedDirty,
    remoteReachable: false,
    drifted: false,
    reasons: [],
  };

  if (upstream) {
    // * Split on the FIRST slash only: "origin/feat/foo" is remote "origin" + branch
    // * "feat/foo". split("/")[1] would yield "feat" and silently query a branch that
    // * does not exist, which ls-remote reports as "unreachable" rather than an error.
    const slash = upstream.indexOf("/");
    const remote = slash === -1 ? "origin" : upstream.slice(0, slash);
    const remoteBranch = slash === -1 ? upstream : upstream.slice(slash + 1);

    const tip = ask(cwd, remote, remoteBranch);
    if (tip) {
      out.remoteReachable = true;
      if (git(cwd, ["cat-file", "-e", `${tip}^{commit}`]) === null) {
        // The tip is an object this clone has never seen, so rev-list would just error.
        out.ahead = 0;
        out.reasons.push(`${upstream} has commits this clone has never seen — run \`git fetch\``);
      } else {
        out.ahead = Number(git(cwd, ["rev-list", "--count", `${tip}..HEAD`]) ?? 0) || 0;
        out.behind = Number(git(cwd, ["rev-list", "--count", `HEAD..${tip}`]) ?? 0) || 0;
      }
    }
  }

  if (out.ahead) out.reasons.push(`${out.ahead} unpushed commit(s) on ${branch}`);
  if (out.behind) out.reasons.push(`${out.behind} commit(s) behind ${upstream}`);
  if (trackedDirty.length) out.reasons.push(`${trackedDirty.length} modified tracked file(s)`);
  out.drifted = out.reasons.length > 0;
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const r = checkHeadDrift(process.cwd());

  if (args.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.drifted ? 1 : 0);
  }

  if (!r.branch) {
    log("FATAL: not a git worktree");
    process.exit(2);
  }
  if (!r.upstream) {
    log(`${r.branch} has no upstream — remote comparison skipped (detached HEAD or unpublished branch)`);
  } else if (!r.remoteReachable) {
    log(`WARN ${r.upstream} unreachable (offline or auth) — ahead/behind unknown`);
  }

  if (!r.drifted) {
    log(r.remoteReachable ? `in sync with ${r.upstream}` : "no local drift");
    process.exit(0);
  }
  for (const reason of r.reasons) log(`DRIFT ${reason}`);
  log('AGENTS.md: call local work "unpushed" until it lands on the upstream.');
  process.exit(1);
}

const isMain = process.argv[1] && /verify-head\.mjs$/.test(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  main().catch((e) => {
    console.error("[verify:head] FATAL:", e instanceof Error ? e.stack : e);
    process.exit(2);
  });
}
