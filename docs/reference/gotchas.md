# Gotchas — overflow

Hard-won facts that no longer earn a slot in [STATUS.md](../STATUS.md) `## Gotchas`, which
carries only the ones a current session is likely to hit. Nothing here is stale — it is
**deep-domain or narrow**, so it is looked up rather than read.

Grep this file by symbol when a subsystem surprises you. STATUS keeps the hot set; when a
gotcha here starts biting again, move it back rather than duplicating it.

## Rendering

- **VHS is level-gated** via `uVhsAmount` (Storerooms only); `?ablate=vhs` zeros the uniform
  without killing the arcade CRT.
- **EffectComposer order, DEFAULT (`?bloompipe=display`):** RenderPass → OutputPass → Bloom →
  Arcade(VHS) → FXAA. `?bloompipe=hdr` swaps to Bloom → OutputPass; OutputPass is never last in
  either. `renderer.toneMapping` is a **no-op into composer RTs without OutputPass** — except on
  the lowest tier, which bypasses the composer entirely (`composerBypass`) and tone-maps natively.
- **Half-res bloom RTs:** strength compensated via `bloomHalfResStrengthMul`.
- **`material.envMapIntensity` is a no-op against `scene.environment`** in this three version —
  only `scene.environmentIntensity` or a material-owned `envMap` scales IBL.

## Netcode

- **Joining quickplay mid-round runs a cold world bootstrap that blocks the main thread.** The
  resume-guard (`dt>0.25s → accumulator=0`) can starve input sampling → cart frozen at spawn
  until it clears. This is NET-2 class — the harness documents it
  ([netcode-harness.md](../guides/netcode-harness.md)).
- **Netcode 2-client rig:** the two clients MUST be separate `chromium.launch()` processes; add
  per-page focus + `?perfPump`. Prefer a persistent `npm run dev:local` via `--url`.

## Physics / platform

- **Rapier WASM:** standard build is the default; SIMD is opt-in only (borrow error).
- **A friction or restitution value on a collider is NOT what the cart feels.** Rapier combines
  the two colliders' coefficients first, and `ColliderDesc` defaults **both**
  `frictionCombineRule` **and** `restitutionCombineRule` to `Average` — read it at
  `node_modules/@dimforge/rapier3d/geometry/collider.js:861-862`, do not infer it. The cart
  carries `friction: 1.1` / `restitution: 0.3` ([config.js](../../src/config.js) `CONFIG.cart`),
  so a wall written `0.02` behaved like **0.56** and one written `0.3` like **0.7**. Verticals a
  cart scrapes along take `FrictionCombineRule.Min`; **floors deliberately keep `Average`**,
  because their values were tuned *against* the cart's 1.1 — three test files carry canaries to
  stop a "make it consistent" sweep sanding the driving feel off. Full run and the five cards
  that closed it: [completed-work.md](../planning/completed-work.md).
  - **Do not "correct" Classic's restitution numbers.** Several comments claim Rapier defaults
    restitution to `Max`; that is wrong (see above), so the pit lip and staves deflect at
    0.40/0.45 rather than the documented 0.50/0.60. The card passed playtest **at the real
    values**, so the feel is signed off and only the prose is wrong — filed as
    `RAPIER-DEFAULT-MAX-1`.
  - **The two axes are independent and easy to confuse.** Sundial's deck needs
    `RestitutionCombineRule.Min` to hold a *lower* value (0.05 under the cart's 0.3); Classic's
    walls take no restitution rule because they want the bounce.
- **`world.castRay*` exclusion filters want the Collider/RigidBody OBJECT, never `.handle`.**
  Rapier unwraps the handle internally
  (`filterExcludeCollider ? filterExcludeCollider.handle : null`). Passing a handle silently
  disables the exclusion — no throw, no warning, the ray just starts hitting the thing you meant
  to skip. Live call sites: [camera.js:179](../../src/camera.js:179),
  [cartOrchestration.js:903](../../src/orchestration/cartOrchestration.js:903).
- **There is NO seed for gameplay RNG.** Two runs of the "same" scenario diverge. Never report a
  physics or AI difference from a single pair of runs, and never build a regression check that
  assumes reproducible gameplay.

## Audio

Loudness targets and the loudnorm start-ramp trap are documented where they belong —
[music.md](./music.md) (≈ −13.5 LUFS integrated, two-pass EBU R128) and
[ambience.md](./ambience.md) (**no loudnorm on loops**). Not repeated here.

- **Howler's `_playLock` can revive a track you already stopped.** A deferred `play()` whose
  `onplay` lands *after* `stopMenuMusic()` ran will resurrect the menu bed under the game. The
  fix in place is a terminal guard inside `onplay` itself, not a longer deferral — see
  [audioManager.js:339](../../src/audioManager.js:339). A previous attempt to fix this by
  deferring caused the bleed it was meant to prevent.
- **Synth stings and file-backed audio sit on different volume buses.** The listener volume is a
  mute gate only; applying a slider to both paths double-applies it (an SFX slider was once
  applied twice to synth stings). Check which bus a sound is on before scaling it.

## Dev loop & measuring

- **Dev-only probes lie in production.** `__cartRavePerf.scene`, `import("/src/…")` and friends
  do not exist in a built bundle, so a probe that "returns nothing" on prod is telling you about
  the probe, not the game. Verify prod changes **visually**, or through something that ships.
- **Judge performance on a production build, never `npm run dev`.** Dev-server timings include
  transform and module-graph cost that no player pays.
- **A deploy is not instantly live everywhere** — edge propagation is roughly 30 s per PoP.
  Hard-refresh, and give it a beat before concluding a fix did not land.
- **Warm-cache byte cuts are near-worthless.** BUNDLE-1 moved −22.6 % off the initial set and
  warm `menu-ready` improved 3 % against a 15 % gate. Measure parse-vs-construction before
  spending a card on bytes (D-BUNDLE-1-CLOSE).
- **`localhost` and `127.0.0.1` are not interchangeable here** — they differ for storage origin
  and for the netcode rig. Match whatever the harness or the deployed URL uses.
- **A hidden or non-compositing tab freezes `rAF`** (and with it the boot sequence, so a round
  will not start). Dev tooling passes `?perfPump`. This bites automated browser checks hardest:
  layout reads can come back frozen and stale rather than absent, which looks like a CSS bug.
- **Stale `workerd` processes survive a killed dev server** and hold the port; kill them before
  blaming a config change. Worktrees and the Vite cache have the same shape of trap — a stale
  cache serves the previous branch's modules.

## Known blockers

- **Stay on TypeScript 6.0.3.** TS 7's native flags surface ~849 JSDoc `object` errors across
  the codebase; upgrading is a project, not a bump.
- **The PATTERNS customize tab is blocked on `cartrave4` geometry**, whose body UVs are
  fragmented. The plan is a second UV channel authored in Blender first — not a shader workaround.

## Naming

- **`localStorage` keys remain `cartRave*`** until the brand migration ([brand.md](../brand.md)).

## Evidence / deployed assets

- **Minification breaks naive greps of deployed assets** — `0.505` becomes `.505`, hex seeds
  become decimal. Check the local `dist/` chunk with the same pattern before concluding anything
  about prod.
- **Battery reports without provenance are visible history only** — never green readiness
  evidence. Prefer complete exact-HEAD runs (`npm run release:check`).

## Claude Code harness

These were expensive to learn and are still true — but with the operating system frozen during
game cards (AGENTS.md § HOW WORK IS EXECUTED), they are reference, not daily reading.

- **Concurrent agent sessions may `git add -A`** — commit surgically when working alongside one.
  The `guard-git-add.mjs` hook now blocks the whole-tree forms; this is the reason it exists.
- **Stop-hook `stop_hook_active` is inverted from the obvious reading:** `true` means "already
  continuing because of a prior block" → **return success / do not re-block**; `false` is the
  normal first Stop where the guard should run. Verified against the shipped `claude` binary,
  not the docs — `WebFetch` summarized a truncated docs page and confidently reported the
  opposite polarity *and* a wrong block cap (real cap is 8,
  `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`). Inverting it disables the guard on every normal turn
  while still looking wired up. Grep the binary before trusting a doc summary on hook payload
  semantics.
- **`.claude/settings.json` is strict JSON, not JSONC** — a `//` comment there can fail parsing
  and silently drop *every* hook in the file. Caveats belong in the hook headers and
  [guides/hook-enforcement.md](../guides/hook-enforcement.md).
- **Claude Code permission rules are globs, never regex** — `|` alternation inside `Bash(...)`
  matches nothing. A space before `*` enforces a word boundary (`Bash(ls *)` ≠ `lsof`), rules
  match each `&&`/`;`/`|` subcommand independently, and a broad deny beats a narrower allow.
