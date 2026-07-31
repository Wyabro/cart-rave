# Observability platform (bug capture · analytics · living dashboard)

**What is this?** The layer that closes the feedback loop the dev toolkit opened:

```
gameplay → diagnostics (__ccDiag) → bug capture → harness regression → dashboard → analytics → better game
```

Three connected systems, all built on the existing diagnostics spine — there is **one**
event log (`recordDiagEvent`), **one** capture format (the bundle), **one** ingestion
pattern (beacon → Worker route → SQLite DO), and **one** generated health view. No second
logging system exists. Siblings: [dev-toolkit.md](./dev-toolkit.md) (umbrella),
[diagnostics.md](./diagnostics.md) (the `__ccDiag` core).

---

## 1. Bug capture (unified evidence collection)

One artifact — the **capture bundle** (`__ccDiag.captureBundle()`): snapshot of every
probe + the full event ring buffer + device context + **build stamp** (`__CC_BUILD__`,
baked by vite.config.js: git sha + build time). `bundleVersion: 2`.

| Trigger | Gate | Where it lands |
|---|---|---|
| **Automatic** — any `error` or `assert` event (gameLoop fatal/step faults, window errors, unhandled rejections, invariant violations) | `?diag` active | `__ccDiag.captures()` — in-memory, last 3, assembled one tick after the trigger so trailing events are included. Debounced (5 s) + session-capped (5) so an error loop can't spin bundle assembly. |
| **Manual** — `F8` (or legacy `Ctrl+Shift+D`) | `?diag` (prod + dev) | Console + clipboard + downloaded `cc-capture-*.json` **+ POST `/api/captures`** (CaptureLog DO, migration v4). Optional `?captureLabel=run7-A-intel` overrides the auto label. |
| **Harness** — any failed check | rigs | `.diag-captures/<scenario>-<label>-NNN.json` + `.png` (unchanged, `dumpFailureBundle`) |
| **Production crash** | always | `/api/log-error` beacon (errorReporter.js) — now carries the build stamp; full bundles stay a `?diag` feature |

### Pulling remote F8s (no email hop)

Both playtest machines upload on F8. On the machine with the repo:

```bash
# one-time: put the same token as the Worker secret into a gitignored file
# ERROR_LOG_TOKEN=…   →  .env.local

npm run captures:pull            # last 20 → .diag-captures/playtest/
npm run captures:pull -- --list  # metadata only
npm run captures:pull -- --id 12 # one bundle
```

Token-gated `GET /api/captures` (same `ERROR_LOG_TOKEN` as `/api/errors`). Agent reads
`.diag-captures/playtest/` after you pull (or runs the pull itself if the token is in env).

A future player-facing "Report problem" button is one call: `captureBundle({scenario:
"player-report"})` + a beacon POST — the format and transport both already exist.

## 2. Gameplay analytics (production-safe, event-level)

`src/analytics/analytics.js` (core: queue/batch/transport, no game imports) +
`src/analytics/gameplayAnalytics.js` (emission wiring, mirrors gameplayDiagnostics.js).
Installed unconditionally from main(); DEV routes batches to `console.debug` (never the
network — same reasoning as the errorReporter DEV skip), prod beacons to
**`POST /api/analytics`** → `party/analyticsLog.ts` (SQLite DO, singleton "v1",
ring-buffered at 20k rows, migration v3).

**Events (the complete list):** `session_start` (tier/dpr/touch/menuReadyMs) ·
`match_started` {arena, mode} · `match_ended` {arena, mode, durationMs, endReason,
result, suddenDeath, kos, localKos, localDeaths, maxComboTier} · `unlock_earned` ·
`challenge_completed` · `player_quit` {reason, phase} (menu returns, sim errors, page
close mid-round) · `client_error` {context} (rate-limited, contents go to the error log) ·
`session_end` {durationMs, matches}.

**Performance contract:** nothing per frame. `trackEvent()` = one null check + an array
push; serialization only at flush (batch of ≤20 / 30 s idle timer that exists only while
the queue is non-empty / tab-hide / pagehide via `sendBeacon`). Bounded queue.

**Privacy / control:** flat gameplay primitives only, random `cartRaveClientId` for
session correlation, no PII. Kill switches: `?analytics=off` or
`localStorage cartRaveAnalytics = "off"`.

**Backend abstraction:** transport is a sink — `initAnalytics({ sink: { name, send(payload) } })`.
Swapping to Supabase/PlayFab/Steam/file later touches zero gameplay code.

**Reading it:**

- **API:** `GET /api/analytics` with header `Authorization: Bearer <ERROR_LOG_TOKEN>` →
  aggregates (matches by arena/mode, avg duration, avg KOs, result split, quits by
  phase/reason, error contexts, session counts). `?view=list` for raw rows, `DELETE` to
  clear (same Bearer header). Same secret as `/api/errors` / `/api/captures`. **Never
  put the token in the query string** (SEC-TOKEN-1 — leaks into logs/referrers).
- **CLI:** `npm run analytics:pull` (alias `npm run analytics`) — prints the summary and
  writes `.diag-captures/analytics-summary.json` (`{ pulledAt, url, summary }`). Needs
  `ERROR_LOG_TOKEN` in env or `.env.local` / `.dev.vars` (same as `captures:pull`); sends
  Bearer. Exit codes match captures: **0** ok · **2** missing token · **1** HTTP/other failure.
  Empty DO: summary object is valid; `window` may be undefined — CLI null-guards it.
- **Command Center:** after a pull, `npm run dashboard` shows the **Analytics** panel
  (Reference section, next to Capture bundles) from the cache file — no token in HTML.
- **Before public / external playtest:** clear the DO so evidence is strangers-only —
  `curl -X DELETE -H "Authorization: Bearer $ERROR_LOG_TOKEN" https://cart-rave.wyabro.workers.dev/api/analytics`.
  Then play, then `npm run analytics:pull` + dashboard.

**Deploy note:** first deploy after this lands applies DO migration `v3`
(`AnalyticsLog`) — automatic with `npm run ship`, no action needed.

## 3. Command Center (`npm run dashboard`)

`tools/dashboard.mjs` + `tools/lib/projectHealth.mjs` generate
**`.diag-captures/dashboard.html`** (+ `health.json`, the same model as JSON for agents)
from artifacts the project already produces — **nothing on it is hand-maintained**:

- **Attention-first layout (v2):** mission banner (STATUS § Current focus) → the ONE
  next action (red battery gate beats STATUS next-action #1 beats the active queue card)
  → do-not / parked firewall → queue → playtest → pulse (bugs radar · build health ·
  recent commits) → reference, collapsed. Captures are deliberately **not** a todo
  source — they're evidence for the active card. Playtest progress is read from the
  console's localStorage **in the browser at view time** (same browser as console.html),
  never collected at generate time — no second copy of playtest truth.
- **Gates** — latest `battery-*.json` with **per-check detail** (rigs now write
  `--tallyOut` tallies; the battery embeds them as `results[].checks`) + pass-ratio history.
- **Captures awaiting triage** — bundle cards with screenshot thumbnails (same dir, so
  relative `<img>` just works).
- **Open issues / active queue / next actions / do-not list** — parsed live from
  `docs/STATUS.md` (the do-nots come from its `### Do not` section, which also feeds the
  committed `docs/BRIEFING.md` via `npm run briefing`);
  **backlog shape** from `docs/planning/BACKLOG.md`. The markdown
  stays canonical — the dashboard is a *view*, deliberately not a second issue database.
  Live-doc canary tests (`tests/projectHealth.test.js`) pin the real docs against the
  parsers, so a heading rename breaks `npm run qa` instead of silently emptying a section.
- **Perf snapshot** — latest `shots/perf-profile-*.json`, worst GPU cells first.

Parsers are pure + unit-tested (`tests/projectHealth.test.js`) so a STATUS format drift
breaks a test instead of silently emptying a section. Collectors degrade independently —
missing files/git never kill the page. Regenerate anytime; it's read-only.

---

## Reuse in a future game

Genuinely portable, in dependency order: `src/utils/diagnostics.js` (zero game imports) →
`src/utils/buildInfo.js` + the vite define → `src/analytics/analytics.js` (core; write a
new wiring file per game) → `party/errorLog.ts` + `party/analyticsLog.ts` + their Worker
routes → `tools/lib/harness.mjs` + `battery.mjs` → `tools/lib/projectHealth.mjs` +
`dashboard.mjs` (point the parsers at the new project's STATUS/BACKLOG or delete those
two collectors). The game-specific 20% is confined to `gameplayDiagnostics.js`,
`gameplayAnalytics.js`, and the rig scenarios.
