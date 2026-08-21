# HOW TO PLAY art — drop-in slots

The five HOW TO PLAY slides each have an art slot wired to a **token**. Drop a file in
this folder and that slot turns on at the next build — no HTML edit, no CSS edit, no
follow-up card. Drop nothing and the deck reads exactly like the playtested text-only
deck: single column of text + chips, no empty frame.

## The contract

| Token | Slide | Format |
|-------|-------|--------|
| `drive` | AISLE 1 — DRIVE | 16:10, cropped, HUD out of frame |
| `boost` | AISLE 2 — BOOST | 16:10, cropped, HUD out of frame |
| `ram` | AISLE 3 — RAM THEM OUT | 16:10, cropped, HUD out of frame |
| `hud` | AISLE 4 — READ THE HUD | 16:9, uncropped, HUD is the subject |
| `cargo` | AISLE 6 — THE LIVING STORE | 16:10, cropped, HUD out of frame |

- `<token>.webp` (animated) turns that slot on. It is mounted only when its slide is
  visible, so playback does not begin behind the closed HOW TO PLAY overlay.
- `<token>.still.webp` (optional) is shown instead when the visitor has
  `prefers-reduced-motion: reduce`, or when the visible animated image fails to load
  or advance. Absent is fine — the animated file remains the only available image;
  a frozen decoder still leaves its readable frame in place.
- No file → the slot renders nothing. There is no broken-image state and no 404, ever:
  the rig only sets `data-art` when a file resolved behind the token, and CSS hides
  every slot without it.
- A motion load error swaps to the paired still. If neither file loads, the slot
  collapses back to the text-only deck instead of showing a broken-image glyph.
- Budget: keep each file under ~400 KB. These are committed binaries on every clone and
  every cold visit.

## How it works

- The rig in `src/ui/cart-rave-menu.js` discovers files with `import.meta.glob` at
  **build time** — that is what makes detection real rather than a hand-maintained list,
  and it is why this folder lives under `src/assets/` instead of `public/`. Only the
  five tokens above are ever bundled; any other file dropped here is ignored.
- `hydrateHowToArt()` runs once at menu init and sets `data-art="1"` for resolved
  slots, which stabilizes layout without mounting hidden images.
- `startHowToArtForSlide()` mounts only the visible slide. A bounded 16x10 canvas
  sample checks five frames over about 700 ms; the first changed frame keeps motion
  by swapping in a never-sampled copy (Chromium stops looping a WebP after
  `drawImage`), while no change selects the still. Paging or closing cancels the
  check.

## AISLE 4's callouts — the one step that is not a drop-in

The five `.cr-howto-callout` labels over the HUD frame are positioned by `--x`/`--y`
percentages that were guessed against a blank placeholder. They stay hidden until a human
adds `data-callouts="aimed"` to the hud slot in `index.html` and re-aims the coordinates
against the real frame. Do that once `hud.webp` exists; the chip row on the slide names
the same pieces in the meantime.

Do not shoot these stills with `npm run shoot` — see SHOOT-SOFTGL-1 in
`docs/planning/BACKLOG.md`; Wyatt captures them by hand.
