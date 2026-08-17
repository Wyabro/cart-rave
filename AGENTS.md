# AGENTS.md — Cart Clash

**Canonical always-on rules.** If any other doc disagrees about how the stack works,
**this file and the code win**. Depth: [docs/reference/agent-manual.md](docs/reference/agent-manual.md)
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
<https://www.cartclash.lol/> (same Worker also serves `cart-rave.wyabro.workers.dev`).
Branch: **`cart-clash`**. Deploy map: [docs/guides/deploy-urls.md](docs/guides/deploy-urls.md).

## ARCHITECTURE INVARIANTS

- **Host-authoritative** client Rapier; predicting clients never own the outcome.
- **Server never simulates physics** (`party/index.ts`: lobby, signaling, TURN, host selection, lifecycle only).
- **Realtime is P2P DataChannels** (`src/netcode/p2p.js`) — not WebSocket relay for transforms/input/spills/kill-feed.
- **`CART_COLORS`** in `src/config.js` is the single source of truth for cart neon; keep it brand-aligned to the 2D roster — [art-direction palette rule](docs/reference/art-direction.md).
- **The cart material traverse stays frozen.**
- **Rounds start only via `MSG.gameStart`.** Round length: `ROUND_DURATION_MS` in
  `shared/roundConstants.js` only (150s).
- **No camera lerp/slerp.** **`index.html`** is menu markup (do not recreate `cart-rave-menu.html`).
- **Null-guard all cart access.** Host migration: oldest connection; clear buffers / re-init P2P.
- **Naming freeze** for Worker / DO / `cartRave*` keys — [docs/brand.md](docs/brand.md).

## HOW WORK IS EXECUTED

- **Plan → Wyatt ack → apply, per WAVE.** One plan (goal · files · asserts · risks · playtest
  checklist), one ack, then levers. **ACTIVE CARD names the card — not permission to edit.**
- **One lever per commit**; mid-wave abort if a lever fails. One card at a time; ideas → BACKLOG.
  Game levers use `CARD-ID: imperative summary`; documentation commits use `docs:`, and
  architecture-manifest maintenance uses `arch:`.
- **Fast lane** (all must hold): one file · stated symptom only · no new file, dependency, `CONFIG` key, or URL query flag ·
  not invariants · not `main.js` / `party/` / `src/netcode*` / physics / player-visible.
  Still needs one-line intent + go + `npm run qa` + commit. Grows past that → full wave plan.
- **Game-card freeze:** no commits to `tools/`, `.claude/hooks/`, `.agents/`, or Command Center styling.
- **Timebox:** ~45 min or 3 failed approaches → STATUS findings (5 lines) →
  `.agents/skills/systematic-debugging` → hand off / ask Wyatt.
- **Done** (only definition): `npm run qa` green **by number** + pushed to `origin/cart-clash` +
  `verify:head` + briefing fresh + STATUS at wave boundary. Behavior change → seed BACKLOG
  `## Playtest owed` and run `npm run playtest:console`. Confirm
  `.diag-captures/playtest-queue.json` lists the id with `steps` before you hand him the console.
  Close / seed format: [BACKLOG.md](docs/planning/BACKLOG.md) header.
- **Post-lever:** no notification-driven follow-ups, no baseline worktrees, no `npm run states` gate
  unless the wave owns that gate. Outside-diff fails = one-line note + stop.

## SHIP PROOF

- Code wins over stale claims. Never "done"/"verified" without the **Done** definition above.
- Ship only on explicit **"ship it"**. Behavior change → production playtest.
- No live URL and no prod playtest until the post-ship poll finds zero 404 responses and the
  expected symbol in the deployed bundle. Poll steps: [docs/guides/deploy-urls.md](docs/guides/deploy-urls.md).
  Do not deploy near a public post.
- No `git add -A`. Report gates by number. STATUS at wave boundaries only. One `qa` per wave
  when possible.
- Playtest: one issue per card.

**Shared enforcement:** git hooks (`npm run setup`) regenerate BRIEFING/ARCHITECTURE; use
`npm run verify:head`. Claude PreToolUse hooks are optional leftover — process authority is
this file + git hooks, not Claude.

## Gates & commands

- **`npm run qa`** = `check` in package.json (read-only): status:size → typecheck → test → knip →
  briefing:check → arch:check → health:check.
- **Dev:** `npm run dev:local` · **Ship it:** `npm run ship` · **Ship glitch:** `npm run ship:glitch`
  (after prod is good) · **Build:** `npm run build`
- Full catalog: [agent-manual.md § STACK](docs/reference/agent-manual.md)

## MODEL / TOOL ROUTING

- **Routing / skills:** Grok and Codex are equal primaries. Cursor is IDE / backup. Claude is
  demoted. Depth: [agent-manual.md § MODEL / TOOL ROUTING](docs/reference/agent-manual.md).
  Pointers (`GROK.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`) stay thin.
- **`loop:`:** [`.cursor/rules/self-improving-loop.mdc`](.cursor/rules/self-improving-loop.mdc).
  The graph stops at Wyatt's `ack`. `ship it` stays separate.
- **Windows / commits / token budget:** [agent-manual.md § STANDING BEHAVIORAL RULES](docs/reference/agent-manual.md)
  (`Select-String`, single-line `-m`, do not re-emit huge docs, do not `grep -C` BACKLOG/STATUS).

## WHAT'S OFF-LIMITS

- Do not edit `docs/archive/handovers/` or `docs/archive/audits/`.
- Do not hand-edit `docs/BRIEFING.md` (edit STATUS → `npm run briefing`).
- Do not recreate deleted menu/partykit files; no open-world WebGPU engine ports.
- Diff quality: delete old paths in the same commit; no speculative knobs; no stopgaps —
  [agent-manual.md § principles](docs/reference/agent-manual.md).
