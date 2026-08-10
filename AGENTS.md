# AGENTS.md — Cart Clash

**Canonical always-on rules** (~2k tokens). If any other doc disagrees with this file about
how the stack works, **this file and the code win**. Deep process, stack tables, playtest
authoring, and enforcement internals: [docs/reference/agent-manual.md](docs/reference/agent-manual.md)
(**read when** needed — do not load every session).

**Product:** Cart Clash (legacy host/IDs may still say `cart-rave` — [docs/brand.md](docs/brand.md)).
Player copy / announcer: [docs/style-guide.md](docs/style-guide.md).

## Cold start

1. [docs/BRIEFING.md](docs/BRIEFING.md) — phase, active card, do-nots (generated; never hand-edit)
2. **This file**
3. [docs/STATUS.md](docs/STATUS.md) top — session memory
4. `npm run dashboard` when you can run npm — observed evidence
5. Deeper docs only as needed (manual, ARCHITECTURE.json lookup, control-flow, art-direction)

**ARCHITECTURE.json** (~30k tokens): look up files with
`Select-String -Path docs/ARCHITECTURE.json -Pattern <filename> -Context 4,12` — never read whole.
Cross-module work: [docs/reference/control-flow.md](docs/reference/control-flow.md) first.
History: [docs/archive/](docs/archive/README.md), not STATUS.

**Paste-able opener** (tools that do not auto-read files):

```text
You are working on Cart Clash (repo cart-rave, branch cart-clash). Read docs/BRIEFING.md,
then AGENTS.md, then the top of docs/STATUS.md. Plan → Wyatt ack → apply before any edit.
Ack is per WAVE. One card at a time. Do not touch tools/, .claude/hooks/, or .agents/
during a game card. Gates: npm run qa — report by number. Ship only on "ship it"; never
git add -A. Never claim "done" without pulling cart-clash and verifying HEAD.
```

Cart Clash: browser **4-player shopping-cart physics sumo**. Production:
<https://cart-rave.wyabro.workers.dev/>. Branch: **`cart-clash`**.

## ARCHITECTURE INVARIANTS

- **Host-authoritative** client Rapier; predicting clients never own the outcome.
- **Server never simulates physics** (`party/index.ts`: lobby, signaling, TURN, host selection, lifecycle only).
- **Realtime is P2P DataChannels** (`src/netcode/p2p.js`) — not WebSocket relay for transforms/input/spills/kill-feed.
- **`CART_COLORS` + cart material traverse** in `src/config.js` are frozen (Original Rave).
- **Rounds start only via `MSG.gameStart`.** Round length: `ROUND_DURATION_MS` in
  `shared/roundConstants.js` only (150s).
- **No camera lerp/slerp.** **`index.html`** is menu markup (do not recreate `cart-rave-menu.html`).
- **Null-guard all cart access.** Host migration: oldest connection; clear buffers / re-init P2P.
- **Naming freeze** for Worker / DO / `cartRave*` keys — [docs/brand.md](docs/brand.md).

## HOW WORK IS EXECUTED

- **Plan → Wyatt ack → apply, per WAVE.** One plan (goal · files · asserts · risks · playtest
  checklist), one ack, then levers. **ACTIVE CARD names the card — not permission to edit.**
- **One lever per commit**; mid-wave abort if a lever fails. One card at a time; ideas → BACKLOG.
- **Closing a BACKLOG card:** delete its row + writeup to `completed-work.md` + add its ID to
  BACKLOG's closed do-not-reopen list, same session — skip the third step and `health:check`'s
  reopen gate goes blind for that ID forever. Full house rules: BACKLOG.md's own header.
- **Fast lane** (all must hold): one file · stated symptom only · no new file/dep/CONFIG/?flag ·
  not invariants · not `main.js` / `party/` / `src/netcode*` / physics / player-visible.
  Still needs one-line intent + go + `npm run qa` + commit. Grows past that → full wave plan.
- **Game-card freeze:** no commits to `tools/`, `.claude/hooks/`, `.agents/`, or CC styling.
- **Timebox:** ~45 min or 3 failed approaches → STATUS findings (5 lines) before #4.
- **Escalation:** timebox → findings → `.agents/skills/systematic-debugging` → hand off / ask Wyatt.
- **Done:** `npm run qa` green **by number** + pushed + `verify:head` + briefing fresh + STATUS
  at wave boundary. Behavior change → Wyatt playtest on production (console ready first).
- **Post-lever:** no notification-driven follow-ups, no baseline worktrees, no `states` gate
  unless the wave owns that gate. Outside-diff fails = one-line note + stop.

## Standing rules

- Verify before you speak; **code wins** over stale claims.
- Never "done"/"verified" without pull + HEAD check. **Post-deploy (DEPLOY-STALE-HTML-1 process A):**
  poll `GET /` + every hashed asset it references until **0×404** (window can be ~45 s; mixed
  HTML/asset state is real), *then* fetch a symbol + `Select-String`. Do not share the live URL or
  start prod playtest inside a dirty window. **Do not deploy near a public post.**
- **Unpushed** until on `origin/cart-clash`. Report gates by number. No `git add -A`.
- Ship only on explicit **"ship it"**. Behavior change → production playtest.
- PowerShell: `Select-String`, not `grep`; single-line `-m` commits.
- STATUS at **wave** boundaries only (not per lever). One `qa` per wave when possible.
- No URL to Wyatt until the symbol is in the **deployed** bundle.
- Playtest: one issue per card; non-empty numbered steps; deploy context truthful.
- Budget: don't re-emit huge docs to move them; don't `grep -C` BACKLOG/STATUS.

**Shared enforcement:** git hooks (`npm run setup`) regenerate BRIEFING/ARCHITECTURE; use
`npm run verify:head`. Claude PreToolUse hooks in `.claude/hooks/` are **optional leftover**
for that runtime only — process authority is this file + git hooks, not Claude.

## Gates & commands (short)

- **`npm run qa`** = `check` in package.json (read-only): status:size → typecheck → test → knip →
  briefing:check → arch:check → health:check.
- **Dev:** `npm run dev:local` · **Ship:** `npm run ship` · **Build:** `npm run build`
- Full command catalog + stack detail: [agent-manual.md § STACK](docs/reference/agent-manual.md)

## MODEL / TOOL ROUTING

No single “main driver” yet. **Grok and Codex are equal heavy-lift defaults.** Cursor is IDE /
backup. Claude is **demoted** (do not design process around it; cancel path).

- **Grok** — equal primary: implementation, investigation, docs.
- **Codex** — equal primary: implementation, investigation, mechanical depth.
- **Cursor** — IDE surface + backup refactors.
- **Qwen / others** — secondary heavy lift when chosen.
- **Claude** — demoted / cancel path; only if Wyatt explicitly opens it.
- **Pointers** (`GROK.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`) are thin extras only —
  never restate stack/invariants/gates there.
- **Skills:** repo source `.agents/skills/` → `npm run skills:sync` fans out. User-level skills
  (including third-party) live under each runtime’s `skills/`; do not vendor huge packs into
  `.agents/skills/`. Details: [agent-manual.md § routing](docs/reference/agent-manual.md).

## SELF-IMPROVING LOOP

When Wyatt starts a message with `loop:`, run the sequential three-model workflow described in
`.cursor/rules/self-improving-loop.mdc`: DeepSeek-v4-flash maker, `gpt-5.6-luna` with high
reasoning as Luna watcher, and `gpt-5.6-sol` with medium reasoning as Sol rewriter. The first pass
is always plan-only and stops at Wyatt's `ack`; `ship it` remains separate deployment
authorization.

## WHAT'S OFF-LIMITS

- Do not edit `docs/archive/handovers/` or `docs/archive/audits/`.
- Do not hand-edit `docs/BRIEFING.md` (edit STATUS → `npm run briefing`).
- Do not recreate deleted menu/partykit files; no open-world WebGPU engine ports.
- Diff quality: delete old paths in the same commit; no speculative knobs; no stopgaps —
  full list in [agent-manual.md § principles](docs/reference/agent-manual.md).
