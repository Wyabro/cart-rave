# Cart Rave — Roadmap (Updated July 1, 2026)

**Current Philosophy:**  
Focus on building and polishing a strong **solo experience** first. Multiplayer and netcode work is intentionally deprioritized until the core game is more complete and stable.

---

## Phase 1 – Core Stability & Polish (Current Focus)

### High Priority

| Task | Status | Notes |
|------|--------|-------|
| Collision fixes (Cart Rave level) | ✅ Done | Replaced 72-segment trimesh with 16 zero-overlap convex hulls using precise `tan(halfAngle)` trapezoidal math. Eliminated bounce and tunneling. |
| Collision fixes (Backrooms level) | ✅ Done | Replaced 5,776-poly trimesh with 9 primitive cuboid slices. Massive performance win on mobile. |
| Stuck cart respawn | ✅ Done | Fixed via position-based tracking (June 30). |
| Mobile performance (Backrooms level) | ✅ Done | Drastically improved by switching from trimesh to primitive colliders. |
| Defer Rapier WASM Loading | ✅ Done | Deferred (June 30). |

### Medium Priority

| Task | Status | Notes |
|------|--------|-------|
| UI / HUD Polish Pass | Partial | Countdown/Sudden Death moved to 20vh to fix scoreboard overlap. More work remains. |
| Audio state bugs | ✅ Done | Removed `_isMuted` early-return guards in `playGameMusic`/`playMenuMusic`. Music now initializes correctly when muted. |
| Quality / Post FX toggle on Main Menu | Todo | Currently only in Esc menu. |
| Gamepad / Steam Deck support | Todo | Clean handheld support |
| Loading Screen Improvements | Todo | Better progress bar + silly messages |
| Sunglasses & Customization Polish | Todo | Fix model doubling, improve mirror colors, cart facing player |
| Customization code audit | Todo | Double-check all customization logic |
| Color selection gating improvements | Todo | Prevent bad states mid-round |

---

## Phase 2 – Solo Gameplay Polish

### Remaining Work

| Task | Status | Notes |
|------|--------|-------|
| Spilling cart contents on knockover | Todo | Fun VFX when carts tip over |
| Rounds / results polish | Todo | Better player experience |
| Tie-handling correctness | Todo | Important for fairness |

---

## Phase 3 – Content & Major Polish

### Top Priority

| Task | Status | Notes |
|------|--------|-------|
| Evaluate WebGPU Compute Shaders | Todo | Start with targeted use (e.g. shatter VFX, particles). Avoid full custom physics engine rewrite. Re-evaluate after mobile performance is solid. |
| Level 3: Zanzibar Platform | Todo | Major new level |
| Menu overhaul + new name/domain | Todo | Rename + new domain |
| Performance optimization pass | Todo | Especially level swapping + menu |
| V2 Shipping Checklist + Final QA | Todo | Create when closer to release |
| Subtle in-game monetization / ads | Todo | — |

---

## Phase 4 – Multiplayer & Infrastructure (Deferred)

**Multiplayer work is intentionally moved late.**

### Top Priority in Phase 4

| Task | Status | Notes |
|------|--------|-------|
| Evaluate + implement Partywork | Todo | Higher-level state sync framework on top of PartyKit |

| Task | Status | Notes |
|------|--------|-------|
| Full netcode audit + major fixes | Todo | Current host/client desync issues |
| Proper state synchronization & interpolation | Todo | Make remote carts feel responsive |
| Revisit server-authoritative options | Todo | Evaluate deeper authoritative logic |
| Spectator mode / chaos features | Todo | Stretch content |
| Persistent leaderboard (Supabase) | Todo | Online progression |

**Known Deployment Blocker (Resolved)**
- Successfully migrated to raw `partyserver` on Cloudflare free tier. V2 is now live.

---

## Future Modernization (Deferred)

| Task | Effort | Notes |
|------|--------|-------|
| Evaluate moving to **React + React Three Fiber (R3F)** + `drei` | High | Big architectural change. Reassess much later |
| Consider `shadcn/ui` (if going React) | Medium | High-quality UI components |

---

## Dropped Items

- Crazy Carts mode (solo 8 NPCs)
- General pre-submission checklist

---

## Completed Work

### July 1, 2026 – Physics Overhaul + Polish Session

**Physics Engine Overhaul**
- Record level: Full replacement of trimesh ring with 16 mathematically perfect convex hull colliders (zero overlap, zero gaps).
- Backrooms level: Full replacement of heavy trimesh with 9 clean cuboid primitives.
- Wheel clipping fixed globally by restoring `visualOffset` to 0.82 and tuning `visualRecordY` to -0.42.

**UI & Audio Fixes**
- Fixed HUD overlap by moving `.hud-status` to `20vh`.
- Fixed music mute state persistence by removing early `_isMuted` return guards.

**Codebase Hygiene**
- Removed 27 unused exports via Knip across 8 files.
- Clean zero-warning Vite build + successful Cloudflare deploy.

### June 30, 2026

**Infrastructure & Deployment**
- Migrated from PartyKit to raw partyserver on Cloudflare free tier
- V2 deployed live at https://cart-rave.wyabro.workers.dev

**Match Pacing & Sudden Death**
- Standard round length set to 2.5 minutes
- Sudden Death implemented (first to score wins on tie)
- Multi-way tie support + spectator mode

**Death & Respawn Polish**
- Cinematic death camera with momentum carry + pan to explosion
- Respawn delay tuned to 1000ms

**Audio Tightening Pass**
- Dynamic wheel audio (volume + pitch based on speed)
- Charge-up SFX now scales with hold time
- Countdown SFX wired correctly
- Menu music autoplay race condition fixed

**Mobile Performance & Low Quality Mode**
- Auto low-quality mode with visual + post-FX scaling
- WASM crash fix (avoided destroying Rapier world mid-match)
- Dynamic physics substeps based on quality mode

**Phase 2 Completed Work**
- Match Pacing & Sudden Death
- Death & Respawn Polish
- Audio Tightening Pass
- Mobile Performance (Cart Rave level)
- Stabilize lobby / ready-up flows
- Non-host lifecycle edge cases
- Client prediction improvements
- Caster/fork system visual polish (partial)
- Lag mitigation tuning

**NPC AI Behavior Overhaul**
- Aggression increased to 80% hunting cycles
- Predictive ramming (velocity lead targeting)
- Improved nitro logic + suicide prevention
- Spawn lock during countdown + Backrooms pathing fixes

**Physics & Collision Fixes**
- CCD properly enabled on RigidBodyDesc (fixed tunneling)
- Spawn booth friction lowered (no more snagging)
- Deeper void on Classic Record (-30 threshold)
- Stuck cart respawn fixed (position-based tracking instead of speed)

**Other Polish**
- Charge Boost early release + increased burst power
- FFmpeg loudness normalization across all SFX
- Various entity and state cleanup fixes

### June 29, 2026

**Engine & Performance**
- WebGL memory leaks patched
- GC micro-stutter eliminated (Rapier scratch cache)
- Arcade feel improvements

**V2 Architecture**
- GLB cart heavily compressed (Draco + WebP)
- Themed carts fully removed
- New Sunglasses + Mirror Finish customization system

**Gameplay Features**
- Auto-Charge Boost
- Cinematic Countdown Camera
- Cart Shatter + Explosion Death VFX

**Bug Fixes**
- NPC respawn suicide loop fixed

---

**Last Updated:** July 1, 2026  
**Next Focus:** Finish remaining Medium Priority items in Phase 1 (Customization audit, Color gating, Post FX toggle placement). Then move into Phase 2 solo gameplay polish.