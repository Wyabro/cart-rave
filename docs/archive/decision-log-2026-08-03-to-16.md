# Decision log — 2026-08-03 → 2026-08-16

One-line **Decision index** rows moved out of [STATUS.md](../STATUS.md) on 2026-08-16
(STATUS trim, token budget). **Nothing here is current truth** — the code and `git log`
are authoritative; read these for the *why* behind a past call.

Earlier full-text (07-31 → 08-02): [decision-log-2026-08.md](./decision-log-2026-08.md).
July log: [decision-log-2026-07.md](./decision-log-2026-07.md). Writeups for closed cards:
[completed-work.md](../planning/completed-work.md).

Live STATUS index keeps only in-flight decisions.

---

- **D-GAMEPAD-FREEZE-1** (08-16, `9935f10d`): `blur` + tab-hide now reset all held input incl. the previously-frozen gamepad axis/boost; held boost is suppressed until release on return. **GAMEPAD-FREEZE-PT-1** Wyatt PASS 08-16.
- **D-ZOMBIE-HOST-PICK-1** (08-16): host-away / host-repair pick from `#platformLiveConnIds()`, not `#connections.keys()` — platform-dead peers cannot become host. **ZOMBIE-HOST-PICK-PT-1** Wyatt PASS 08-16.
- **D-THOST-CEILING-1** (08-16): `tHost` gate is `|tHost − now| ≤ 60s` (replaces DEEPSEC-1's `1e12` abs cap). **THOST-CEILING-PT-1** Wyatt PASS 08-16.
- **D-SD-SCORE-STALE-1** (08-16): `addScore` now commits before the SD-win callback so podium `host_round` carries the final point. Announcer leader lines skip SD. **SD-SCORE-STALE-PT-1** Wyatt PASS 08-16.
- **D-MENU-CMD-SKEW-1** (08-15): Menu entrance wrote `translateY`/`scale` on `.cr-cmd` and wiped `skewX(-8deg)`; leftover label `skewX(8deg)` leaned SOLO–SETTINGS left. Entrance now `fadeIn` only. **MENU-CMD-SKEW-PT-1** Wyatt PASS 08-16.
- **D-CONN-TOASTS-1** (08-15): Friends join/leave toasts from `MSG.slots` human-connId diff + reap broadcast. **CONN-TOASTS-1** Wyatt PASS 08-15.
- **D-AGENT-OS-2** (08-15): Slim `AGENTS.md` (plan B). Keep invariants + ack/lever/freeze/fast-lane. Define done/ship/playtest once. Routing, `loop:`, and post-ship poll become pointers (manual § routing, `self-improving-loop.mdc`, `deploy-urls.md`). Not a 40–60 line cut.
- **D-EFFECTS-SPLIT-1** (08-15): `src/effects.js` split into domain modules behind a composition root. No behavior change; no playtest owed.
- **D-LOCAL-PORT-8899** (08-14, `8cf335f`): Local worker port **8787 → 8899** — Windows HNS dynamic port exclusion **8751–8850** made 8787 unbindable (EACCES; workerd aborts with `std::terminate`, killing `npm run dev:local` / the battery). Single source: `LOCAL_WORKER_PORT` in `src/config.js`; wired through netcode dial, `dev:party*`, harness, launch.json, docs. Also **HARNESS-FREEZE-1 re-ack** (`2e30d8e`): freeze lever swapped to CDP `Debugger.pause` — the lifecycle freeze never silenced a live-RTC host (bfcache eligibility), pause is a genuine JS halt (validated 08-14). Battery **8/8 green**; dashboard green.
- **D-SEO-1** (08-14): SEO pass — `rel=canonical` + og/twitter meta point at the apex cartclash.lol (www / workers.dev twins and the Glitch copy consolidate there, never index on their own); share card is a 1200×630 opaque composite of the title splat on brand bg (replaces the 512px icon; `summary_large_image` + `og:image:alt`); VideoGame JSON-LD (factual only); robots.txt + single-URL sitemap. Head-only + 2 new public files; zero gameplay/DOM change.
- **D-STORE-PILE-2** (08-14): Head-on pile contact never entered STORE-PILE-1's 0.9 m origin pad (nose-on origin ~4.45 m vs pad end 4.3 m). Pad is now cart `hz + 0.3` press; apply strips this-frame inward drive only, walk-out 17 m/s², Δv cap 4 m/s. Probe: 0 wedged / longest 0.2 s. **STORE-PILE-PT-1** Wyatt PASS 08-14.
- **D-STORE-PILE-1** (08-14, `0fd9c64`): Storerooms furniture-pile wedge — avoidance blends a tangential go-around term (the old radial-only repulsion provably produced zero lateral steer at every approach angle), plus a new wall keep-out bounce (`computeWallKeepOutBounce`) that shoves carts back off the pile, ramping with impact speed and freeing motionless carts. Sundial's drivable podium untouched (`wall` flag). 22 regression tests. Playtest owed: **STORE-PILE-PT-1**.
- **D-ORGANIZE-1** (08-14): Codebase organization pass — safe same-system moves (`gameSession.js` → `orchestration/`, `visuals.js` → `effects/`), consolidated 7 cart files into `src/carts/`, and organized ~160 root test files in `tests/` into domain subdirectories. Effects split deferred to **EFFECTS-SPLIT-1**.
- **D-AGENT-OS-1** (08-05): Slim always-on `AGENTS.md` (~1.6k tok; depth → `docs/reference/agent-manual.md`). **Grok + Codex equal** heavy-lift defaults; Cursor IDE/backup; Claude demoted. Shared authority = AGENTS + git hooks + `verify:head` (not Claude PreToolUse). David Ondrej skills cherry-picked user-level (Grok+Codex).
- **D-BUNDLE-1-CLOSE** (08-05): BUNDLE-1 PARTIAL — bytes moved, warm menu-ready did not. **Warm cache ⇒ byte cuts are near-worthless; measure parse-vs-construction first.** Supersedes D-PERF-3.
