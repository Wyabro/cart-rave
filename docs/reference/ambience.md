# Arena Ambience

Per-arena looping ambient beds + a reactive Cart Rave crowd + a Sudden Death tension
layer. Shipped 2026-07-16 (Pass 5's deferred "quiet ambient bed", plus the crowd-reacts
ask). Data-driven like the announcer pack: **replace an opus file to re-skin an arena's
atmosphere — no code changes.**

## Layers

| Key | Arena | What it is | Base mix |
|-----|-------|-----------|----------|
| `classic_crowd_bed` | Cart Rave | crowd murmur + room tone | 0.22 |
| `classic_crowd_hype` | Cart Rave | cheers/claps/whistles — level rides the excitement meter, idles at 0 | 0.5 |
| `backrooms_bed` | The Storerooms | fluorescent ballast hum + HVAC rumble + flicker sizzle | 0.45 |
| `zanzibar_bed` | Sundial Station | ocean wash + wind + sparse gulls | 0.24 |
| `sd_tension` | any | beatless dark drone, fades in under Sudden Death | 0.4 |

Files: `public/sounds/ambience/<key>.opus`. `testArena` is silent by design; every
quickplay arena must have a bed (contract-tested against `shared/arenaPool.js`).

## Architecture

- **`src/audioManager.js`** — ambience channel: `registerAmbience` / `playAmbience` /
  `setAmbienceLevel` / `stopAmbience` / `stopAllAmbience`. Own registry (NOT
  `sfxRegistry`): beds hold live per-instance fade levels that `applySfxVolumes`'s
  howl-global writes would stomp. WebAudio-buffered (`html5:false`) so loops are
  gapless. Rides the SFX volume slider; per-key multipliers appear in the dev SFX
  tune pane (`getSfxKeys` includes ambience keys). `preload:false` — beds fetch at
  play entry, never during boot/menu.
- **`src/levels/arenaCatalog.js`** — authored per-arena ambience keys.
- **`src/ambience/arenaAmbience.js`** — stable ambience API, base mix levels, lifecycle,
  excitement meter (exponential decay, half-life 3.5 s), and SD tension latch.
- **main.js wiring** — start in `commitMenuHiddenForGame` (test drive included),
  stop in `initMenu`, stop/restart around `rotateLoadedArenaInPlace` (quickplay
  rotation), excitement bumps in `onArenaKoFlash` (kills 0.4 + 0.12/combo tier,
  plain falls 0.16, first blood ×1.35) and the podium victory beat (1.0), SD
  tension edge-latched in `onFrame` (runs on every client — host and remotes both
  learn SD via `roundState`) with a 0.9 crowd spike on entry.

## Regenerating the loops

```
node scripts/ambience/generate.mjs            # all five
node scripts/ambience/generate.mjs --only zanzibar_bed
node scripts/ambience/generate.mjs --keep-wav # keep WAVs for DAW work
```

Pure-Node seeded synthesis → WAV → ffmpeg opus. Deliberate choices (learned from the
announcer recut gotchas — see [announcer.md](./announcer.md)):

- **No loudnorm.** Dynamic loudnorm ramps gain over the first ~0.5 s, which on a loop
  is a level step at the seam. Beds are RMS-normalized in JS to −18 dBFS instead;
  the in-game mix lives in the `BASE_VOLUMES` map + tune-pane multipliers.
- **Seam = 2 s equal-power tail→head crossfade**, with slow LFOs at integer
  cycles-per-loop where cheap.
- Seeded PRNG per bed — regeneration is reproducible.

To art-direct a bed in the DAW: `--keep-wav`, process the WAV (keep the loop length
EXACT), re-encode `ffmpeg -i <key>.wav -c:a libopus -b:a 64k <key>.opus`, drop it in.

## Using a premade clip instead (e.g. a real crowd recording)

```
node scripts/ambience/loopify.mjs <input> <key> [--fade seconds]
node scripts/ambience/loopify.mjs crowd.wav classic_crowd_bed
node scripts/ambience/loopify.mjs cheering.mp3 classic_crowd_hype --fade 3
```

Takes anything ffmpeg reads, makes it loop seamlessly (tail→head crossfade eats the
last `--fade` seconds), RMS-matches it to the generated beds (−18 dB), and writes
`public/sounds/ambience/<key>.opus` directly. Use clips ≥ ~10 s. For Cart Rave,
replace both layers: `classic_crowd_bed` (idle murmur) and `classic_crowd_hype`
(full cheering — the excitement meter fades this one in over the bed, so pick a
clip that reads as "the same crowd, going nuts").

## Ear-pass history

- **07-16 v2** — Storerooms read as silent under music (v1 bed was almost all
  sub-400 Hz = fully masked): energy moved up-spectrum (240–480 Hz harmonics,
  ×3 sizzle, flicker events every ~4.5 s and bigger), base 0.3→0.45. Sundial
  wash too loud: surf gain 1.5→0.9 + lower constant floor inside the loop,
  base 0.32→0.24 — wind/gulls (the liked part) now carry more of the bed.
