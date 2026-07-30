# STATUS session log — 2026-07-30 (full day)

> Archived from [STATUS.md](../STATUS.md) at end of day (status-size budget). STATUS keeps a
> one-paragraph summary of the day; the per-card detail lives here and in each card's plan doc.
> **History, not current truth** — `git log` and the code are authoritative.
>
> Cards closed this day: QA-STATUS-1 · HYGIENE-1 · CARGO-VIS-1 · CARGO-RACE-1 · CARGO-HUD-1a ·
> WARM-IGPU-1 · CARGO-HUD-1. Left open: SKYBOX-1 (Wyatt eyes), WARM-SOLO-1 (telemetry-gated).
> The CARGO-VIS-1 blow-by-blow has its own file:
> [status-log-2026-07-30-cargo-vis-1.md](./status-log-2026-07-30-cargo-vis-1.md).

## SKYBOX-1 — Classic scene extras render for the first time (undeployed, Wyatt eyes owed)

`main.js` `sceneExtras` started as a truthy stub with an empty `sceneRoots`, so
`ensureRaveAttractShell`'s `!sceneExtras || sceneExtras.disposed` gate was permanently false
and `initSceneExtras` never ran — 991 lines of skybox / starfield / planets / UFOs / world
spotlights had never rendered once. Fix: stub → `null`; deleted the local `disposeSceneExtras`
that shadowed the real import across the whole 4.8k-line closure; **plus a second-order gate
bug the external review missed** — `initSceneExtras(enabled:false)` returns the same shape with
an empty `sceneRoots`, so a first call on a non-Classic level would latch that empty object
forever and Classic would still get nothing. The guard now treats only a *populated* rig as
built.

Verified: `scene.getObjectByName("classicSkyRoot")` exists and is visible with Far/Mid/Near
groups on Classic, and is **not built at all** on Backrooms (the `enabled:false` cost-skip
still works).

Cost, exact and hardware-independent (draw calls / triangles do not depend on the adapter):
**146 → 200 draw calls (+54), 550,193 → 554,345 triangles (+0.75%), 10 → 15 spotlights — at
every tier including LOW**, because the visibility loop (`main.js` ~2121) is tier-independent
by design ("every tier keeps the crowd/stage/skybox silhouette so Low still reads as Cart
Clash"). That intent had never actually been paid for by a real player until now.

Scene probe for the art call: skybox shell `neonVoidSky` r=260 at origin, three starfield
Points clouds r=140/195/265, distant planets at (−70, 28, −55) r≈1.4–3.4 and (105, 62, −90)
r≈12–21, and **small bodies (r≈1.7 and r≈0.7) sitting at world origin — inside the KO pit**.

### The orb in the pit — a UFO, and a real bug

Those origin bodies were the two **UFOs**. `createUfos()` builds each as a 1.5r hemisphere in
flat grey `MeshBasicMaterial(0x888888)` + a 0.7r teal dome, group-scaled ×2, and positions them
**only inside `update(timeMs)`** (orbit radius 100 / 126, height 20 / 31). `sceneExtras.update`
is called from the game frame loop only — the **menu attract loop never ticks it** — so during
attract both saucers sat at the group default (0,0,0): dead centre of the arena, a ~3m grey
dome in the KO pit, motionless (probe: identical at t=0 and t=+6s, then correctly out at 98m
and 127m once a round started). Fixed by seating the orbit at construction (`update(0)`), which
holds regardless of which loop ticks. Verified in orbit at exactly 100m/126m during attract.

Invisible for months because the whole rig never rendered — switching it on is what surfaced it.

### Tier gate (Wyatt call)

New declarative `skyExtras` knob in `qualityTiers.js`: **false on LOW, true on MEDIUM/HIGH**.
LOW does not even *build* the rig, so it skips construction cost too, and measures back at the
exact 146-draw baseline. Both visibility sites in `ensureRaveAttractShell` follow the same
gate — the second one used to force `root.visible = true`, which would have silently re-shown
the rig on LOW at the next picker swap.

## CARGO-HUD-1 — Living Cargo readout on the nameplate (DEPLOYED)

Wyatt picked nameplate placement + the score-strip chip look from the 1a mocks. Four segments
on the bay's own quarter-split: `cargoFillLevelFor()` is the single phase source
`lifeCargoVisibleCount()` also derives from, so chip and basket step together by construction;
`cargoTierFor()` drives colour only. The chip is built INTO `nametagHtml()`, riding the
existing per-frame diff-gated `updateNameLabels` cache — one `innerHTML` write per transition,
no new plumbing. `em`-sized so it scales with the plate. **Display-only — `lifeCargoPoints` was
already on both wire paths, so zero netcode.**

Shipped 3-segment first (`f98f9df`); Wyatt caught that it collapsed life 1–7 into one reading
and jumped two bars on the first kill — corrected the same day. **Live: `38d0dfc`**, Version
`f8e8da1f`, entry `index-DUlVRrvj.js`, CSS `index-Dy_zk7wE.css`; prod boot renders 4 segments
with 2 lit at spawn, no page errors. qa 784/784. Spec, the correction, and both rig lessons:
[cargo-hud-1.md](../planning/cargo-hud-1.md).

## WARM-IGPU-1 — CLOSED (Wyatt prod playtest PASS on `a9dbc7d`, Version `127d5f63`)

Phases 0/0b shipped warm/watchdog instrumentation (`perf/warmupSettle`, `warm.compilePoll`,
`perf/qualityStepDown`, `gpuClass`/tier on the analytics beacon). Phase 1 Lever A made an
in-flight arena rotation withhold `clientPlayReady`, so the countdown can no longer arm into
that compile. Both iGPU laptops became unavailable mid-card → P0 closed on a SwiftShader
cold-cache proxy, verification on a machine-independent structural assertion +
`netharness mpIntegration` 18/18. **Scope limit:** rotation is quickplay-only, so cap-206's
**solo** stall is untouched → **WARM-SOLO-1**, telemetry-gated. Full record, proxy findings and
hypothesis status: [warm-igpu-1.md](../planning/warm-igpu-1.md).

## CARGO-VIS-1 — CLOSED (Wyatt prod playtest PASS on `b13bafb`, Version `70d6aa91`)

Full-bay fill + rim overflow across 3 sessions + a KO-drift hotfix; live values are
`CONFIG.cargo.fillPhases` 5/10/20/30, GRID 30, insets 0.68/0.60, bay-local `rimY` crest
(**D-CARGO-VIS-1** — the pile crests the rim; do not "fix" it back under). Two bugs fixed en
route: CARGO-RACE-1 (empty bays now self-heal) and KO-respawn bay drift.

## Deploy gotcha (seen on both ships this day)

HTML is `max-age=0, must-revalidate` and each edge PoP revalidates independently — for ~30s
after a deploy a root fetch may name the OLD entry, or alternate old/new. Each HTML+asset pair
is internally consistent (no broken mixes). **Poll the root several times over ~30s before
judging a deploy failed.**

## Rig lessons worth keeping

- **Assert cargo state at COUNTDOWN, not mid-round.** Five seconds into a live round the NPCs
  have already rammed each other and `stripLifeCargo` has fired, so a "stripped" plate is TRUE
  state, not a bug. Countdown is the only moment every cart sits at its spawn value.
- **The game exposes no mutable cart refs** — `__ccTest.state()` and `__cartClashCargo()` both
  return mapped copies. Visual rigs must drive state through `CONFIG` levers **before** carts
  spawn (e.g. `cargo.baselinePoints` set from the menu), not by poking cart objects.
- **`shoot.mjs` passes no GPU flags**, so its output can be covered by the software-mode modal.
  For look-critical shots launch Chromium with
  `--enable-gpu --ignore-gpu-blocklist --use-gl=angle`.
- **Enter play via the menu's `cartrave:menu` event, not `?room=solo`**, when the warm path
  matters — a direct room boot never takes the `warm:true` branch.
