# Arena Music

In-game music is **per-arena** (since 2026-07-16). It used to be one global playlist of
all four songs shuffled together, arena-agnostic; now each arena has its own track list
and switching arenas (play entry or Quickplay rotation) swaps the playlist.

## Assignments

| Arena | Tracks |
|-------|--------|
| Cart Rave (`classicRecord`) | `music.opus`, `song2.opus` |
| The Storerooms (`backrooms`) | `storerooms.opus` |
| Sundial Station (`zanzibar`) | `song3.opus`, `song4.opus` |
| anything else (`testArena`, fallback) | `music.opus` |

Files live in `public/sounds/`. Assignments are authored in
[`src/levels/arenaCatalog.js`](../../src/levels/arenaCatalog.js);
[`src/music/levelMusic.js`](../../src/music/levelMusic.js) keeps the stable resolver API.
Contracts ensure every quickplay arena has at least one track and every referenced file exists.

## Multiple songs per level

Supported today. A level with >1 track **shuffles** its list (in `main.js startLevelMusic`,
RNG kept out of the testable resolver) and **advances** through it — each track's `onend`
cycles to the next (`audioManager.js advanceGameTrack`), wrapping at the end. A level with
1 track loops that same track through the identical advance path (`(0+1) % 1 === 0`). Only
the first track of a level preloads; the rest load on demand at their turn.

**To add a song to an arena:** drop the opus in `public/sounds/`, add its filename to that
arena's `music` array in `arenaCatalog.js`, and add it to the loudness set below.

## Loudness — keep the set in sync

All tracks are matched to **≈ −13.5 LUFS** integrated so arena swaps don't jump in level.
The four originals sit at −13.2…−13.9 LUFS (already matched); `storerooms.opus` was
authored ~3 dB quieter (−16.5) and was brought up with **two-pass EBU R128 loudnorm**
(measured → near-linear gain + true-peak limiting at −1 dBTP), NOT the ambience-style flat
RMS gain — its −2 dB peak left no headroom for a flat +3 dB without clipping. Two-pass with
measured values is stable on a full track (the loudnorm start-ramp gotcha in
[announcer.md](./announcer.md) is a short-quiet-clip problem, not a 5-min master one).

Check any new/changed track against the set:

```
ffmpeg -i public/sounds/<track>.opus -af ebur128=framelog=quiet -f null - 2>&1 | grep " I:"
# want ≈ -13.5 LUFS. If off, two-pass loudnorm to match:
ffmpeg -i <src> -af loudnorm=I=-13.5:TP=-1.0:LRA=11:print_format=json -f null -   # pass 1 (read measured_*)
ffmpeg -i <src> -af loudnorm=I=-13.5:TP=-1.0:LRA=11:measured_I=…:measured_TP=…:measured_LRA=…:measured_thresh=…:offset=…:linear=true \
  -c:a libopus -b:a 96k public/sounds/<track>.opus                                 # pass 2
```

Existing tracks are ~96–105 kbps opus; encode new ones at `-b:a 96k` to match.

## Playback wiring

- **`src/levels/arenaCatalog.js`** — authored per-arena track lists.
- **`src/music/levelMusic.js`** — stable `LEVEL_MUSIC` + `resolveLevelMusic(levelId)` API
  (never empty).
- **`main.js startLevelMusic(levelId)`** — shuffle the arena's list → `setGamePlaylist`
  (URL-only, `preload:false`, no fetch) → `playGameMusic`. Called at `commitMenuHiddenForGame`
  (every game-entry path: solo/testdrive/quickplay/refresh) and in the Quickplay
  arena-rotation `finally` (with `stopGameMusic` first so the new list starts at its track 0).
- Menu music is a two-song playlist (`menu.opus`, `menu2.opus`) via
  `loadMenuPlaylist`. Each menu start from a stopped state picks a random first
  track; `onend` plays the other and wraps. Only track 0 preloads; the next
  track warms after the current one starts. Music still auto-pauses on tab-hide
  and ducks under big moments (`duckMusic`); test drive gets no game music.
