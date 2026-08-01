# Polish checklist — screen-by-screen presentation sweep

One dedicated pass (or fold into Session 2). The bar: every screen looks intentional,
every transition is masked, every string follows [style-guide.md](../style-guide.md)
(Arena/Round/Boost/KO — file wording drift as S3). Desktop + phone portrait + phone
landscape for each row. Screenshot anything that fails.

## Menu & attract

- [ ] Attract mode: all 4 camera shots frame the arena (no clipping through ceilings/floors), hard cuts clean, sells motion
- [ ] Arena picker: swap crossfade masked (no hitch, no pop-in visible to the player)
- [ ] Sticker language consistent across all menu panels; nothing misaligned at 1280w, 1920w, phone
- [ ] Hover/press states on every button; no dead-looking interactive elements
- [ ] Locked content: lock treatment + hint legible, consistent across arenas/patterns/sunglasses
- [ ] Menu music starts when expected; menu SFX (clicks) present and not annoying on the 30th click

## Transitions & load

- [ ] Menu → game: loading overlay covers ALL work (no frozen frame, countdown never eaten — recent fix)
- [ ] Round → podium → lobby → round: every seam masked, no single-frame flashes of wrong state
- [ ] Quit to menu from any phase: no flash of stale game world behind the menu

## In-round HUD

- [ ] Score chips, timer, cargo bays, boost meter: aligned, legible at Low tier, nothing overlapping at any aspect ratio
- [ ] Kill feed: entries readable at game speed, correct names/colors, no overflow at high KO rates
- [ ] Combo kicker / callout banner / unlock toast / directive chip: stack politely when simultaneous (force it: earn an unlock during a directive)
- [ ] Directional hit vignette reads; edge-of-screen elements survive notched phones
- [ ] Countdown, GO, SD, MATCH POINT, 10-second beats: each lands with intended weight
- [ ] Countdown hierarchy: hero digit clearly reads as the focal element over the GET READY kicker, at Low tier and on phone

## Results & podium

- [ ] Victory vs Defeat clearly distinct (Pass 5); winner presentation correct
- [ ] Winner camera (~2.4 s) + any-input skip: feels intentional at full length, and skipping early doesn't feel like it cut off the celebration
- [ ] Scores, stats, challenge progress rows accurate and aligned
- [ ] Play Again / menu buttons obvious; no layout shift as async data fills in

## Game world & FX

- [ ] Each arena at each tier (low/medium/high — `?preset=`): no missing props that leave visual holes, LOD pop acceptable
- [ ] Cart cosmetics: every pattern × body color × sunglasses combo spot-check (esp. new visor + NPC patterns on fragmented UVs)
- [ ] Spill/debris/shatter FX: personality without covering the action; no FX lingering past its moment
- [ ] Bloom: neon punchy, blacks black, no blown-out whites (blacks-stay-black is Rule 3 in [art-direction.md](../reference/art-direction.md); brightness itself is a per-arena budget)
- [ ] No z-fighting, no shadow acne in the standard camera, no visible seams on arena floors

## Audio polish

- [ ] Every player action has a sound; every sound has a visible cause
- [ ] Round-boundary silence is intentional, not dropped audio
- [ ] Phone speaker check: nothing piercing, PA still intelligible
