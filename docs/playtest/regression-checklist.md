# Regression checklist — before every `npm run ship`

~15 minutes. Gates first, then the smallest set of manual checks that has historically
caught real breakage. Run on the **production build** (`npm run build` + preview, or the
deploy itself — remote is authoritative, verify against the fetched asset per AGENTS.md).

## 0. Automated (must be green before touching a browser)

- [ ] `npm run qa` — report actual numbers (tests/files), typecheck + knip clean
- [ ] `npm run build` — succeeds, no new warnings beyond the known 500 kB hint
- [ ] `npm run qa:visual` — if the change touched postFX/rendering (black-frame battery)

## 1. Boot & menu (2 min)

- [ ] Cold load → menu, console clean
- [ ] Arena picker: swap all three arenas, masked, no hitch
- [ ] Customize: change color, save, reload — persists

## 2. One real solo round (5 min) — on the arena nearest the change, else Cart Rave

- [ ] Countdown → GO clean; drive/boost/hop all respond
- [ ] Score a KO: feed + score + announcer + spill FX all fire; no stutter at the KO moment (shader-recompile regression watch)
- [ ] Fall off: respawn clean, camera correct
- [ ] Round ends at timer → podium → Play Again → round 2 starts clean → quit to menu

## 3. Cross-cutting spot checks (3 min)

- [ ] FPS in the expected band for this machine/tier (note it)
- [ ] Audio: music + SFX + PA all present; M toggles; no loop leaks at the round seam
- [ ] HUD intact at a non-default window size (resize once mid-round)
- [ ] Phone OR narrow-viewport emulation: HUD + touch controls sane (full phone pass only if the change touched UI/input)

## 4. If the change touched netcode / party / P2P

- [ ] Two-browser quick smoke: join via `?room=`, both ready, 60 s of ramming, scores agree, rematch once ([multiplayer-smoke.md](./multiplayer-smoke.md) §A abbreviated)

## 5. Post-deploy (always)

- [ ] Fetch the deployed asset and `Select-String` for the new code (per AGENTS.md — local grep has false-positived before)
- [ ] Load production URL, one solo round, console clean
- [ ] Update [STATUS.md](../STATUS.md)

**Rule:** any box unticked = not shipped. If a box keeps being skipped "because it never
fails," it has earned deletion — edit this file deliberately instead of skipping silently.
