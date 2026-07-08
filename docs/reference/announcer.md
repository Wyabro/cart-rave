# Announcer System — "The Store PA"

Cart Clash's announcer is the supermarket tannoy hijacked by the rave's MC. It celebrates
big moments with retail-flavored barks ("FIRST SPILL!", "CLEAN-UP ON AISLE 3!", "REFUND!")
instead of arena-shooter clichés. The system is fully data-driven and ships today with
procedural stings + visual callouts; professionally recorded voice lines drop in later
with **zero code changes** (see [Voice asset pipeline](#voice-asset-pipeline)).

## Architecture

```
gameplay code                          src/announcer/                    presentation
─────────────                          ──────────────                    ────────────
gameFlow.js  (host falls)   ─┐
netcode.js   (client falls) ─┼─► announcerDirector.js ─► announcerManager.js ─► announcerDisplay.js (callout + aria-live)
hud.js  (countdown/go/SD/10s)─┘        (derives events)     (arbitration:         └► voice asset (Howler) OR
main.js (victory/defeat,               │                     priorities, queue,       announcerStings.js (procedural)
         big-hit hook)                 └► gameStore sub      cooldowns, merges)
                                          (leader/comeback)
announcerEvents.js  — data-only event table (priorities, cooldowns, callout config, voice manifest)
announcerLines.js   — localized subtitle lines, token substitution, no-repeat variant picking
```

- **`announcerManager.js`** — the arbitration engine and single entry point
  (`announce(eventId, data)`). Everything about *whether/when* an announcement plays
  lives here. Nothing else decides.
- **`announcerDirector.js`** — a pure observer that derives events (first blood,
  revenge, leader changes, multi-KOs, close calls) from game state. It never mutates
  gameplay; it only calls `announce()`.
- **`announcerEvents.js`** — the data table. Adding a new event = adding one entry here
  plus its subtitle lines. No engine changes.
- **`announcerLines.js`** — locale → event → line variants, with `{attacker}` /
  `{victim}` / `{leader}` / `{aisle}` tokens and back-to-back-repeat prevention.
- **`announcerStings.js`** — procedural WebAudio stings (same idiom as `sfxSynth.js`)
  used until voice recordings exist, and as permanent fallback for missing assets.
- **`src/ui/announcerDisplay.js`** — visual callout banner (kicker + main line) and a
  visually-hidden `aria-live` region for screen readers.

The director runs identically on **every client**: the host derives falls in
`gameFlow.js`; non-hosts replay the same data from the `falls[]` snapshot tail in
`netcode.js`. Scores sync through the existing host round messages, so leader/comeback
detection needs no new netcode.

## Event catalog

| Event id | Fires when | Priority | Class | Cooldown / caps | Callout |
|---|---|---|---|---|---|
| `countdown_3/2/1` | Countdown digits | 90 | sequence | — | none (HUD status owns it) |
| `go` | Round starts | 90 | sequence | — | none (HUD GO! flash) |
| `first_spill` | First attributed KO of the round | 70 | high | once/round | FIRST BLOOD |
| `double_spill` | 2 falls within 1.4 s | 62 | high | 6 s | TWO DOWN |
| `aisle_wipeout` | 3+ falls within 1.4 s | 68 | high | 10 s | EVERYBODY DOWN |
| `rampage` | Attacker reaches combo tier 1 | 50 | medium | 8 s | KILL STREAK |
| `savage` | Combo tier 2 | 55 | medium | 8 s | KILL STREAK |
| `carnage` | Combo tier 3 | 60 | high | 8 s | KILL STREAK |
| `refund` | KO of the player who last KO'd you | 45 | medium | 10 s | REVENGE |
| `new_leader` | Sole score lead changes hands (suppressed in final 10 s) | 35 | low | 12 s | SCOREBOARD |
| `comeback` | New leader was ≥3 points behind earlier | 48 | medium | once/round | SCOREBOARD |
| `cleanup_aisle` | Self/environmental KO | 20 | low | 18 s, 40% chance, ≤2/round | SELF CHECKOUT |
| `close_call` | Local player survives a huge hit | 10 | ambient | 25 s, ≤2/round | SURVIVED |
| `last_call` | 10 seconds remaining | 40 | low | once/round | 10 SECONDS |
| `sudden_death` | Sudden Death begins | 95 | critical | once/round | none (HUD status owns it) |
| `victory` / `defeat` | Podium, local perspective | 100 | critical | once/match | none (results overlay owns it) |

Deliberate cuts: **Match Point** (scoring is timer-based, no target score — `last_call`
owns the finale), **Challenge Complete** (the existing toast + sparkle covers it; the
announcer only talks about the match), **Last Cart Standing** (folded into the results
overlay title + victory announcement rather than double-announcing at podium).

## Arbitration rules

1. **Single channel** — at most one announcement at a time, with a **1.2 s minimum gap**
   between announcements.
2. **`sequence`** (countdown/GO) plays immediately, bypasses the gap, is never queued,
   and its beeps are *not* gated by the announcer toggle — the countdown is core game
   feedback, not commentary.
3. **`critical`** (sudden death, victory/defeat) interrupts the current announcement and
   flushes the queue.
4. Otherwise an incoming event interrupts only if its priority beats the active one by
   **≥ 20** *and* the active event is marked interruptible; else it queues.
5. **Queue**: max 2 items, priority-ordered, per-event TTL (stale hype is discarded, not
   played late), duplicate event ids replaced with fresher data, lowest-priority evicted
   when full.
6. **`ambient`** (close_call) plays only into silence; it is never queued.
7. Per-event gates: cooldown, once-per-round, max-per-round, and chance (%), all reset at
   round start.
8. **Kill-burst merge**: kill-derived events landing within 450 ms are merged — only the
   highest-priority one is voiced (an `aisle_wipeout` swallows the `double_spill` and
   `rampage` from the same pile-up). Swallowed events still consume their cooldowns.
9. **`comeback` swallows `new_leader`** fired for the same lead change.

## Settings & accessibility

- Pause (Esc) overlay → announcer toggles: **ANNOUNCER** (all announcer audio) and
  **CALLOUTS** (visual banner). Persisted via `settingsStore`
  (`cartRaveAnnouncerVoice` / `cartRaveAnnouncerCallouts`).
- Callouts are rendered with `textContent` (player names are untrusted), respect
  `prefers-reduced-motion`, and mirror every announcement into a visually-hidden
  `aria-live="polite"` region — screen-reader users hear callouts even with visuals off.
- Announcer audio routes through the existing SFX volume category and mute state.

## Voice asset pipeline

Voice recordings are **data-driven** — dropping in assets requires no engine changes.

### Directory & naming

```
public/sounds/announcer/<locale>/<eventId>_<NN>.ogg      (+ .mp3 sibling for Safari)
public/sounds/announcer/en/first_spill_01.ogg
public/sounds/announcer/en/first_spill_02.ogg
public/sounds/announcer/en/cleanup_aisle_03.mp3
```

- `<eventId>` matches the `voice.key` in `announcerEvents.js` (same as the event id).
- `<NN>` is a zero-padded variant number `01..voice.variants` (variant counts per event
  are declared in the table; bump `variants` when recording more takes).
- Always provide both `.ogg` and `.mp3` (Safari cannot decode Ogg Vorbis) and loudness-
  normalize them like the existing SFX (see `loudnorm` convention in `audioManager.js`).

### Wiring recorded assets in

At boot (next to the other `AudioManager.registerSfx` calls in `main.js`):

```js
// 1. Register each recorded file with Howler:
AudioManager.registerSfx("announcer_first_spill_01",
  soundUrlWithFallback("announcer/en/first_spill_01.ogg"), { pool: 1 });
// 2. Tell the manager which takes exist:
registerAnnouncerVoicePack({ locale: "en", availableKeys: ["first_spill_01", /* … */] });
```

The manager then picks a random registered variant per announcement. **Fallback chain**
per event: registered voice variant → declared sting (`sfxKey` or procedural) → silence
(callout/subtitle still shows). Partial voice packs are fine — unrecorded events keep
their stings.

### Localization

- Subtitles: add a locale block to `LINES` in `announcerLines.js` (falls back to `en`
  per event).
- Voice: record under `public/sounds/announcer/<locale>/` and register the pack with
  that locale. `getLocale` in the manager deps selects at runtime.

## Adding a new announcer event

1. Add an entry to `ANNOUNCER_EVENTS` (priority, class, cooldowns, callout, voice
   manifest, sting).
2. Add subtitle variants to `announcerLines.js`.
3. (If procedural fallback wanted) add a recipe to `announcerStings.js`.
4. Call `announce("your_event", { ...tokens })` from the director or gameplay hook.

That's the whole surface — arbitration, settings, accessibility, and voice fallback are
inherited automatically.
