# The Store PA — Recording Script

Read-from-at-the-mic sheet for recording the announcer voice pack. Companion to
[announcer.md](./announcer.md) (§ Voice asset pipeline). Variant counts match the
`voice.variants` declared in `src/announcer/announcerEvents.js` — record more takes for
an event later by bumping `variants` there.

## Character direction

The supermarket tannoy hijacked by the rave's MC. Two voices fighting in one throat:

- **Base**: flat, polite retail PA cadence ("attention shoppers…").
- **Break**: the MC keeps losing the professional mask on the hype words — FIRST SPILL,
  CARNAGE, SUDDEN DEATH get full arena-MC energy.
- Retail words played straight are funnier than retail words played wacky. "CLEAN-UP IN
  THE AISLE" lands best deadpan-urgent, like it's a real spill.
- **Pace**: punchy. Most lines must land in ~1.0–1.5 s (the engine reserves the audio
  channel per event — `durationMs` in the event table). Directives get up to ~3 s.

## Session practicals

- One session for the whole pack — consistent room tone, mic distance, energy.
- Quiet room, soft furnishings, mic (or phone) a fist-width from your mouth, slightly
  off-axis to dodge plosives on all the P-words (SPILL, PAYBACK, EXPRESS).
- Record 3–4 takes of every line back-to-back, pick the best later. Leave a beat of
  silence between takes so trimming is easy.
- Record raw (dry). Any PA flavor (bandpass "tannoy" EQ, slap echo) gets baked in
  afterwards with ffmpeg so it's uniform across the pack.
- Say the line id before each cluster of takes ("first spill, take one…") — future you
  will thank present you when slicing.

## Script

`{tokens}` from the subtitle lines are replaced with generic phrasings here — recorded
audio can't say player names. The on-screen callout still shows the name.

**File naming:** `public/sounds/announcer/en/<eventId>_<NN>.opus` (zero-padded, `01`-based).

### Tier 1 — biggest payoff, record these first (23 takes)

| File | Line | Direction |
|---|---|---|
| `first_spill_01` | "FIRST SPILL!" | Mask fully off. The night's first blood. |
| `first_spill_02` | "AND THERE'S THE FIRST SPILL!" | Sportscaster relish. |
| `first_spill_03` | "FIRST SPILL OF THE NIGHT!" | Ring-announcer stretch on "NIGHT". |
| `double_spill_01` | "DOUBLE SPILL!" | Fast, stacked. |
| `double_spill_02` | "TWO CARTS DOWN!" | Clipped, urgent. |
| `double_spill_03` | "BUY ONE, GET ONE!" | Retail deadpan — the joke sells itself. |
| `aisle_wipeout_01` | "AISLE WIPEOUT!" | Biggest kill-line in the game. Full send. |
| `aisle_wipeout_02` | "EVERYTHING MUST GO!" | Liquidation-sale mania. |
| `refund_01` | "REFUND!" | One word, vicious glee. |
| `refund_02` | "REVENGE SERVED COLD!" | Low, savoring it. |
| `refund_03` | "PAYBACK!" | Sharp bark. |
| `sudden_death_01` | "SUDDEN DEATH!" | The single most dramatic read in the pack. Space the words. |
| `victory_01` | "VICTORY!" | Triumphant, held. |
| `defeat_01` | "DEFEAT." | Flat, PA-polite. The politeness is the insult. |
| `last_call_01` | "LAST CALL!" | Urgent tannoy. |
| `last_call_02` | "TEN SECONDS! REGISTERS CLOSING!" | Rushed, breathless. |
| `carnage_01` | "CARNAGE!" | Guttural. |
| `carnage_02` | "TOTAL CARNAGE!" | Even bigger. |
| `savage_01` | "SAVAGE!" | Impressed disbelief. |
| `savage_02` | "OUT OF CONTROL!" | Half warning, half hype. |
| `rampage_01` | "RAMPAGE!" | Rising energy — tier 1 of 3, leave headroom for savage/carnage. |
| `rampage_02` | "SOMEBODY'S HEATING UP!" | Sly, noticing. |
| `comeback_01` | "WHAT A COMEBACK!" | Genuine awe. |

*(plus)* `comeback_02` — "CLEARANCE-RACK COMEBACK!" — big grin, proud of the pun.

### Tier 2 — scoreboard & time beats (12 takes)

| File | Line | Direction |
|---|---|---|
| `new_leader_01` | "NEW LEADER!" | Announcement bell energy. |
| `new_leader_02` | "TOP OF THE RECEIPT!" | Deadpan retail. |
| `leader_down_01` | "THE LEADER IS DOWN!" | Mock alarm. |
| `leader_down_02` | "TOP OF THE RECEIPT — TOPPLED!" | Relish the alliteration. |
| `one_minute_01` | "ONE MINUTE ON THE CLOCK!" | Neutral PA, slight lean-in. |
| `one_minute_02` | "SIXTY SECONDS OF SHOPPING LEFT!" | Cheery menace. |
| `thirty_seconds_01` | "THIRTY SECONDS!" | Tighter than one_minute. |
| `thirty_seconds_02` | "HALF A MINUTE — MAKE IT COUNT!" | Coach urgency. |
| `critical_ko_01` | "CRITICAL HIT!" | Impact bark. |
| `critical_ko_02` | "STEAMROLLED AT SPEED!" | Winded, like you felt it. |
| `close_call_01` | "CLOSE ONE!" | Quick exhale of relief. Quietest lines in the pack. |
| `close_call_02` | "THAT WAS CLOSE!" | Same, conspiratorial. |

### Tier 3 — Living Store directives (10 takes, ~2–3 s each)

Two takes per line, same words — one straight, one bigger; both get shipped as
variants. Format: flavor name (the hype), then the rule (crystal clear — this is the
one place clarity beats character; the mechanic must be understood in one hearing).

| File | Line |
|---|---|
| `directive_flash_sale_01/_02` | "FLASH SALE! RAMS HIT FIFTY PERCENT HARDER!" |
| `directive_double_bag_01/_02` | "DOUBLE BAG! ALL POINTS DOUBLED!" |
| `directive_express_lane_01/_02` | "EXPRESS LANE! BOOSTS CHARGE TWICE AS FAST!" |
| `directive_spill_bonus_01/_02` | "SPILL BONUS! SPILL THEIR GROCERIES FOR A BONUS POINT!" |
| `directive_rush_hour_01/_02` | "RUSH HOUR! EVERYBODY DRIVES FASTER!" |

### Tier 4 — flavor & ambient (11 takes)

| File | Line | Direction |
|---|---|---|
| `cleanup_aisle_01` | "CLEAN-UP IN THE AISLE!" | Pure deadpan PA. The realest retail read. |
| `cleanup_aisle_02` | "SOMEBODY ATE THE FLOOR!" | Barely-suppressed laugh. |
| `cleanup_aisle_03` | "THAT ONE'S ON THE HOUSE!" | Dry. |
| `cart_overflow_01` | "THAT CART IS OVERFLOWING!" | Alarmed stock-clerk. |
| `cart_overflow_02` | "SOMEBODY'S SHOPPING IN BULK!" | Impressed. |
| `spill_rush_01` | "CLEAN CART, FAST CART!" | Quick, encouraging — this plays to the player who just lost everything. |
| `spill_rush_02` | "NOTHING LEFT TO LOSE!" | Rally cry, but small. |
| `challenge_complete_01` | "DAILY SPECIAL — CLAIMED!" | Register ding energy. |
| `challenge_complete_02` | "CHALLENGE COMPLETE!" | Clean, game-y. |
| `new_host_01` | "NEW HOST HAS THE WHEEL!" | Steady, reassuring — plays during a migration hiccup. |
| `go_01` | "GO!" | Explosive. *(Optional — see note.)* |

### Optional — countdown (3 takes)

`countdown_3_01` / `countdown_2_01` / `countdown_1_01` — "THREE." "TWO." "ONE."

**Note:** the countdown beeps are core game feedback and currently owned by the
`countdown_*.opus` stings; a registered voice take **replaces** the beep for that digit.
Only record these if you want a voiced countdown — skipping them (and `go`) is a valid
final answer. Everything else falls back gracefully too: any line you don't record
keeps its procedural sting.

**Totals: 56 takes core + 4 optional countdown/go.**

## After the session — processing pipeline (proven on Tier 1, 2026-07-16)

Tooling lives in `scripts/announcer/`. The workflow that shipped Tier 1:

1. **Record one long WAV** for the whole tier — say the slate ("first spill, take
   one…") before each cluster, leave ~1 s of silence between takes.
2. **Slice** it into per-take chunks on silence gaps (also emits `review.html` and
   `index.json`, the timestamp map that later steps depend on):
   ```
   node scripts/announcer/slice.mjs "<session.wav>" "<workDir>/chunks"
   ```
3. **Review**: `node scripts/announcer/serve.mjs "<workDir>/chunks" 4390`, open
   `http://127.0.0.1:4390/`, assign each keeper chunk to a line id, star it, export
   the picks JSON. Only starred rows matter — slates/rejects can stay unassigned.
4. **Print the PA effect in the DAW** (this beat ffmpeg-side flavoring by a mile):
   load the ORIGINAL session WAV, apply the saved Store-PA chain, export **without
   changing the timeline** (no head trim, same length — reverb tail past the last
   word is fine).
5. **Recut** the wet master at the original chunk timestamps:
   ```
   node scripts/announcer/recut.mjs "<wet-session.wav>" picks.json "<workDir>/chunks" <repoRoot>
   ```
   Outputs trimmed, loudness-normalized (-16 LUFS) opus straight into
   `public/sounds/announcer/en/`. It measures a static pre-gain per clip before any
   threshold work — do NOT reorder that: dynamic loudnorm on a quiet master ducks
   the first ~0.5 s (sounds like clipped onsets), and threshold trims near speech
   level eat soft consonants. There is deliberately no start trim.
   (`finalize.mjs` is the ffmpeg-flavor variant of the same step — superseded by the
   DAW chain for shipped assets, kept for quick previews.)
6. **Wire in at boot** (`main.js`, next to the other `registerSfx` calls): add the new
   keys to `announcerVoiceKeysEn` — the loop + `registerAnnouncerVoicePack` handle the
   rest. If a take count changed, bump `voice.variants` in `announcerEvents.js`.
7. **Verify**: `npm run qa`, then a solo round — voice replaces sting for recorded
   events, stings remain for unrecorded ones, ANNOUNCER pause toggle still gates it.

Partial packs are fine — Tier 1 shipped alone and everything else kept its stings.

**Status: Tier 1 RECORDED + SHIPPED (25 takes, en).** `aisle_wipeout` gained a third
variant (two keepers were too good to cut). Tiers 2–4 + optional countdown remain.
