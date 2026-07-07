# Cart Clash — Production-Readiness Audit

**Date:** July 7, 2026
**Branch:** `cart-clash`
**Scope:** Full codebase (`src/`, `party/`, `shared/`, `index.html`, `public/`, build + deploy config, docs)
**Baseline at audit time:** 32/32 tests passing · 2 TypeScript errors · knip: 10 unused exports · `dist/` = 59 MB

The 50 improvements below are ranked by combined player impact, technical-debt reduction, maintainability, performance, and polish. Items marked **[IMPLEMENTED]** were completed as part of this audit session (top 10, restricted to changes that are safe, do not alter gameplay feel, and do not touch netcode/multiplayer).

---

## Tier 1 — Highest impact (1–10, implemented)

1. **[IMPLEMENTED] Safari/iOS players get no audio at all.** Every sound is loaded as `.ogg` only (`audioManager.js`, `main.js`), and Safari (macOS + iOS) cannot decode Ogg Vorbis. Unreferenced `.mp3` versions of all five music tracks already sat in `public/sounds/`. Fix: Howler `src` arrays `[ogg, mp3]` for music and SFX (Howler picks the first codec the browser supports), plus ffmpeg-generated `.mp3` fallbacks for the 10 referenced SFX files.

2. **[IMPLEMENTED] ~6 MB of dead audio shipped in every deploy.** `public/sounds/` contained `.wav` masters (Death.wav alone is 3.8 MB) and an unreferenced `Wheel.ogg` / `Wheel.wav` / `Wheel_loop.ogg` trio — none referenced by any code path. Removed from the repo and `dist/`.

3. **[IMPLEMENTED] TypeScript baseline was broken (2 errors).** `cart-rave-menu.js` called `.blur()` on `document.activeElement` typed as `Element`. README claims "fully typechecked with 0 errors" — now true again.

4. **[IMPLEMENTED] Broken PWA manifest.** `site.webmanifest` had empty `name`/`short_name` and white `theme_color`/`background_color` — add-to-homescreen produced a nameless white-flash app for a black neon game. Also added `<meta name="theme-color">` for browser UI tinting.

5. **[IMPLEMENTED] Invite links unfurl blank.** The core social loop is sharing `?room=` URLs, yet `index.html` had no Open Graph / Twitter Card tags — pasted links render with no title, description, or image in Discord/iMessage/Slack. Added og:/twitter: meta using the 512px icon.

6. **[IMPLEMENTED] Production runtime errors are invisible.** The `window.addEventListener("error"/"unhandledrejection")` handlers in `index.html` return immediately once `__cartRaveBootstrapped` is true, and `sendErrorLog` is called from exactly one place (`gameLoop.js`). Any error outside the render loop — menu, netcode callbacks, UI handlers, async chains — vanished. Fix: runtime handlers in `errorReporter.js` with per-message dedupe and a session cap so a hot loop can't beacon-flood the Worker.

7. **[IMPLEMENTED] localStorage handling scattered and duplicated.** 14 distinct `cartRave*` keys accessed as string literals across 8+ files, each with its own `try/catch`; `"cartRaveLevel"` was independently defined in three modules. Fix: `src/utils/storage.js` with a `STORAGE_KEYS` registry and safe get/set/JSON helpers; migrated non-netcode call sites.

8. **[IMPLEMENTED] Dead exports (knip: 10).** Unused public API in `audioManager.js` (3 volume setters superseded by `audioStore`), `gameState.js` (3 wrappers), `entities.js`, `input.js`, `scene.js`. Removed or unexported to keep the module surface honest.

9. **[IMPLEMENTED] Touch-device detection duplicated.** `settingsStore.detectDefaultLowQuality()` re-implements `utils.isTouchDevice()` because of an import cycle (`utils` → `settingsStore`). Extracted `src/utils/device.js` used by both — one definition of "touch device."

10. **[IMPLEMENTED] Stale deploy artifacts + doc drift.** `vercel.json` and `dev-server.py` (pre-Workers hosting), `partykit.json` / `partykit.preview.json` / `partykit.v2.json` (pre-partyserver migration), git-tracked `.tmp-gltf-imgs/`, and duplicate favicon/icon files at repo root (Vite serves `public/`). Removed; added an `npm run check` script (typecheck + test + knip) so the baseline is one command.

---

## Tier 2 — High value, needs its own session (11–25)

11. **Rate-limit and cap `/api/log-error` server-side** (`party/index.ts` fetch handler). It accepts unlimited unauthenticated POSTs of any size and logs them verbatim — abuse vector and log-noise risk. (Server change; excluded from this session's no-networking constraint.)

12. **Uncompressed GLB fallback tiers cost 14 MB of `dist/`.** `cartrave4.glb` (5.5 MB) and `cart-rave-base.glb` (8.5 MB) are runtime fallbacks behind the 688 KB Draco primary. Once Draco loading is proven stable in prod telemetry (see #6), drop the uncompressed tiers or move them behind a lazy secondary deploy.

13. **Split `cartRaveGltf.js` (2,999 lines).** Model loading, caster rigging, layout detection, and tuning live in one file. Natural seams: loader/fallback chain, caster rig, per-layout role maps.

14. **Continue `main.js` extraction (2,821 lines).** Personal stats + match history (`getPersonalStats`, `recordPodiumStats`, `matchHistory`) belong in a `statsStore`; name-label creation/positioning belongs in a `ui/nameLabels.js`; countdown/round timers in `roundTimers.js`.

15. **Add ESLint (flat config) + CI.** There are `eslint-disable` comments but no ESLint config, and no `.github/workflows` — typecheck/test/knip run only when someone remembers. A 10-line GitHub Actions workflow running `npm run check` would hold the baseline.

16. **Align `three` (0.164, mid-2024) with `@types/three` (0.185).** The types describe a renderer 20 minor versions ahead of the runtime — typecheck can pass on APIs that don't exist at runtime. Either upgrade three (test bloom/reflector/CSS2D carefully) or pin types to 0.164.

17. **Empty catch blocks (42).** Most are deliberate localStorage/audio guards, but several swallow real failures (e.g. `syncRoundPhase`'s `Simulation.setRoundPhase` catch). Annotate each with why it's safe to ignore, or forward to `sendErrorLog`.

18. **Test coverage for pure game logic.** Only `gameState`, `netcode` binary codec, and P2P signaling have tests. Highest-value additions: scoring/combo tiers, challenge rotation (`challengeStore`), customization resolvers (`customization.js`), `resolveLevelId`.

19. **Self-host fonts.** Seven Google Fonts families load from `fonts.googleapis.com` at render time — FOUT on slow links, total failure offline. Audit which are actually used (likely 4), subset, and serve from `public/fonts/`.

20. **Lazy-load the game music playlist.** Four ~2.4 MB tracks are constructed with `preload: true` at boot (`main.js`), competing with Rapier WASM and the cart GLB for bandwidth during the boot-critical window. Load the playlist when a mode is chosen.

21. **Finish the rename.** Product says "Cart Clash" (title, meta), repo/package/worker say "cart-rave", localStorage keys say `cartRave*`, prod host is `cart-rave.wyabro.workers.dev`. A migration map for storage keys + a worker route alias would let the rename land without losing player stats.

22. **Asset cache headers on the Worker.** The old `vercel.json` set immutable caching for `/sounds/*`; the Wrangler assets deploy has no equivalent. Hashed bundle files are fine, but 15 MB of models/sounds re-validate per session. Add `assets.headers` rules (or a `_headers` file) for `/models/*`, `/sounds/*`, `/draco/*`.

23. **Mute or duck audio when the tab is hidden.** `visibilitychange` only resets loop timing; music keeps playing in background tabs — the #1 "close that tab" annoyance for browser games.

24. **Colorblind support.** Slot identity is color-only in HUD score boxes and name labels. Cart patterns already exist — surface them in HUD chips, or add a colorblind palette toggle in settings.

25. **CONFIG flat-alias spread is a footgun.** `CONFIG = { physics, ...physics }` exposes every physics value at two paths (`CONFIG.cart` and `CONFIG.physics.cart` are the same object, but future re-assignment of one path silently desyncs the other). Pick one canonical path and deprecate the alias.

---

## Tier 3 — Meaningful improvements (26–40)

26. **Boot splash ignores `prefers-reduced-motion`.** The inline splash animation (cart charge/impact loop) always runs; every other animation system in the codebase respects the media query. Add the guard to the inline CSS.

27. **Audit per-frame allocations in visuals hot paths.** 167 `new THREE.*` across `frameVisuals.js`, `camera.js`, `cart.js`, `effects.js`, `contactShadows.js`. Most are init-time, but a profile pass (Chrome allocation sampling during a 4-cart brawl) should confirm zero per-frame vector/color churn.

28. **HUD DOM write diffing.** 93 style/text mutations in `hud.js`; timer and score writes should skip when unchanged (results overlay already has a change-key pattern to copy).

29. **`window.__cartRave*` globals as cross-module API.** `__cartRaveBootstrapped`, `__cartRaveShedBootSplash`, `__cartRaveShowBootError`, `window.CartRave`, `window.cartRaveLevel` — formalize into one typed boot-bridge module; `globals.d.ts` only papers over it.

30. **Type the session bridge.** `sessionBridgeCtx` is `{ current: object | null }` with `@type {any}` casts at use sites — the highest-traffic untyped seam in the game. A `@typedef` for the bridge shape would catch wiring mistakes at typecheck time.

31. **`scripts/party-deploy.mjs` + `party-deploy-guard.mjs`** are referenced by no package.json script or doc — delete or document.

32. **Challenge rotation drifts.** Daily/weekly reset is `now - lastReset >= 24h/7d`, so reset time creeps later every cycle. Anchor to UTC midnight / ISO week for predictable rotation.

33. **Countdown SFX files are heavy.** Four countdown voice clips at ~80 KB each vs ~5–40 KB for every other SFX — likely encoded at music bitrate. Re-encode at speech quality (~24 KB total savings ×4).

34. **`eruda` dev console loads from CDN on any LAN hostname.** Any visitor on a 192.168.* host gets a remote script injected. Vendor the script or gate behind an explicit `?eruda` flag.

35. **Gamepad UX gaps.** `gamepadNav.js` handles menus, but there's no rumble on impacts (Gamepad haptics API) and no on-screen glyph hints when gamepad is the active input mode (`input.js` already tracks mode).

36. **Loading screen progress is mostly cosmetic.** Real progress events exist (GLTF loader onProgress, Rapier init, level build) but the bar animates on a timer. Wiring real progress makes slow mobile loads feel intentional.

37. **`index.html` is 958 lines.** The boot splash markup + inline CSS + boot scripts could move to a generated partial or documented include; editing boot logic inside HTML strings evades typecheck and knip.

38. **`postFxDebug.js` / `raveGltfCartTweakpane.js` gating.** Both are DEV-gated dynamic imports (good), but `tweakpane` remains in `dependencies` — move to `devDependencies` and verify it never lands in the prod graph.

39. **Results overlay change-detection key is hand-rolled across 11 fields** (`lastResultsOverlayKey` in `main.js`) — replace with a single serialized key or store subscription to eliminate a class of "forgot to add the field" staleness bugs.

40. **Document (or remove) `dev:party:preview` script** — it's identical to `dev:party` (`npx wrangler dev`), suggesting a lost preview-config intent (`partykit.preview.json` was the artifact).

---

## Tier 4 — Polish and hygiene (41–50)

41. **Consolidate `isTouchDevice` call sites on the new `device.js`** — `touchControls.js` and `rotatePrompt.js` should share the same predicate rather than local media queries (verify after #9).

42. **`console.*` noise in prod.** `cartRaveGltf.js` alone has 24 statements; most are fallback warnings worth keeping, but wrap verbose info logs behind `import.meta.env.DEV`.

43. **Canvas accessibility.** `#game` has no `aria-label`/`role="application"`; HUD has 2 aria attributes total. Screen-reader users can't tell what the page is.

44. **Add `og:image` dimensions + a real share card.** (After #5's baseline tags) — a 1200×630 branded share image would materially improve invite click-through vs the 512px icon.

45. **`matchHistory` cap logic** (`while length > 10 shift`) runs on every podium — fine, but move the cap next to the push and document why 10.

46. **`AUDIO_VOLUME_MAX` indirection.** HUD receives `getAudioVolumeMax`/`getAudioVolumeDefault` as injected getters for constants — import the constants directly; two fewer callbacks in the giant `HUD.init` options bag.

47. **`shuffledClientNpcNames(4)`'s `initialNpcNames` is computed at module scope in `main.js` but** only consumed far later — move next to its consumer or into `npcNames.js`.

48. **Spawn-height comment drift.** `CONFIG.cart.spawnHeight` says "overridden below from booth geometry" — it is, 300 lines later via mutation; compute it in one place.

49. **`.gitignore` lists `.vscode/` but a tracked-adjacent `.vscode/settings.json` exists on disk** — decide whether editor settings are shared (commit) or personal (leave ignored), and remove the ambiguity.

50. **Add a `CHANGELOG.md`** — release notes currently live as commit messages and scattered doc updates; V2 launch (rename + domain) needs a player-facing change log.

---

## What was explicitly out of scope for the implementation pass

- Anything in `src/netcode.js`, `src/netcode/`, `shared/protocol.js`, or `party/index.ts` message handling (networking constraint) — including #11.
- Physics/driving/scoring tuning of any kind (gameplay constraint).
- The three.js upgrade (#16) and GLB fallback removal (#12) — need prod telemetry first.
