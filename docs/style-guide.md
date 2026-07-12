# Cart Clash — Writing & Terminology Style Guide

**Status:** Canonical for all wording — UI copy, announcer lines, challenge text, docs, comments.
**Naming freeze (infra IDs, product-vs-tribute):** [brand.md](./brand.md) — that file wins on what may not be renamed.
**Last updated:** 2026-07-12.

Read this before writing any player-facing string or doc section. If two words could mean
the same thing, this file picks one.

---

## 1. Brand voice

Cart Clash is **Saturday-morning-cartoon retail chaos**: a supermarket that decided it was
an esports arena. Every line should sound like it was written by an over-caffeinated store
PA announcer who loves their job.

- **Playful confidence.** Declare, don't hedge. "LET'S ROLL", not "Continue?"
- **Retail humor.** Puns come from the store world: aisles, receipts, clearance, checkout,
  bulk, registers. ("SELF CHECKOUT" for a self-fall, "CLEAN-UP ON AISLE 3", "TOP OF THE RECEIPT".)
- **Clear first, funny second.** Instructions state exactly what changed ("RAMS HIT 50%
  HARDER"); the flavor lives in the name ("FLASH SALE").
- **Short.** If a line can lose a word, lose it.
- Avoid: corporate language, apology tones, lorem/placeholder text, grimdark phrasing,
  humor that punches at the player.

## 2. Preferred terminology

Player words are what the UI, HUD, announcer, and challenges say. Code words are
identifiers/wire/docs-internal and are **not** bugs when they differ — but never leak them
into player copy.

| Concept | Player word | Code / dev word | Why |
|---|---|---|---|
| The game | **Cart Clash** | `cart-rave` legacy IDs per [brand.md](./brand.md) | Rebrand is done; only frozen infra lags |
| First arena | **CART RAVE** | `classicRecord` / "Classic" | Sanctioned jam tribute — first arena only |
| Play space | **Arena** | `level` (`levelManager`, level ids, `data-level`) | "Arena brawler" is the brand; `level` is too entrenched in code to rename |
| One 150s bout | **Round** | `round*` (`roundPhase`, `ROUND_DURATION_MS`) | One word everywhere; a session is just "the game" |
| "Match" | Only in the fixed idiom **MATCH POINT** | `matchHistory` (legacy) | Sports idiom, instantly readable; never say "match" for a round otherwise |
| Speed burst | **Boost** | `nitro` (wire field `input.nitro`, config keys) | Boost is on every button/meter; wire+config names are frozen-in-practice |
| Vertical dodge | **Hop** | `hop` | Never "jump" — hop is the brand word and the code word |
| Scoring takedown | **KO** (plural **KOs**) | `ko*` preferred; `kill*` is legacy internal | Player copy never says "kill"; "knockout" only as flavor prose, never as a verb |
| Combo tiers | **RAMPAGE** (t1) · **SAVAGE** (t2) · **CARNAGE** (t3) | `comboTier` 1/2/3 | Tier numbers are internal; players see names (`config.js` combos table) |
| Sanctioned esports idioms | **FIRST BLOOD**, **MATCH POINT**, **SUDDEN DEATH** | — | Universally-read tension idioms; deliberate exceptions, don't multiply them |
| Goal system | **Challenge** (Daily / Weekly) | `challengeStore` | Never "objective", "quest", or "mission" |
| Permanent goal | **Unlock** | `unlockConfig`, `unlockStore` | "Reward" is the payout, "unlock" is the thing earned |
| Pre-round gathering | **Lobby** | `lobby` round phase; `room` = network room | "Room" is transport vocabulary; players join a lobby via an **invite link** |
| Public matchmaking | **Quickplay** (one word) | `quickplay` room id | Never "Quick Play" |
| Solo mode | **Solo** | `solo` (offline, private room + 3 NPCs) | Never "practice" or "single player" |
| Multiplayer w/ link | **Friends** | `friends` mode | Screen title "INVITE FRIENDS" |
| Ready flow | **READY UP!** → **READY!** | `isReady`, `ready_toggle` | Verb is "ready up" |
| Physics owner | **Host** | host / host-authoritative | Never "party leader" or "server" in player copy |
| Bots | NPC names on screen; "NPC carts" in challenge copy | `NPC` | "Bot" is OK in casual copy (e.g. "Bot Buster") but NPC is the default |
| Falling with no attacker | **SELF CHECKOUT** (callout) / self-fall | `suicide`/`selfDeath` legacy internals | Retail humor does the work |
| The scoreboard-on-cart system | **Living Store** — cargo bay, **PA directives** | `directives/` | Directive names are retail events: FLASH SALE, DOUBLE BAG, EXPRESS LANE, SPILL BONUS, RUSH HOUR |
| Announcer persona | **The Store PA** | `src/announcer/` | One voice: store PA, not sports caster |
| Points | **pt / pts** in compact UI; "points" in sentences | `score` | "1 pt", "2 pts", "0 pts" |

**Arena display names** (menu cards, splash, loaders — must match `hud.js` `ARENA_SPLASH_NAMES`):
**CART RAVE** (`classicRecord`) · **THE STOREROOMS** (`backrooms`) · **SUNDIAL STATION** (`zanzibar`).
In docs, prose-case them (Cart Rave, The Storerooms, Sundial Station); say `zanzibar` only when
referring to the level id. "Zanzibar" as a display name is retired.

## 3. Capitalization

- **ALL CAPS**: buttons, HUD banners/callout kickers, menu section headers (`◇ CONTROLS`),
  arena cards, announcer subtitles. The sticker language is loud on purpose.
- **Title Case**: challenge titles ("Void Sender"), unlock labels ("The Storerooms").
- **Sentence case**: descriptions, hints, tooltips, body copy ("Cause 15 opponent spills").
- Product name in prose: **Cart Clash** (never CartClash, Cartclash, or cart clash).

## 4. UI wording conventions

- Buttons are verbs or destinations, 1–3 words: PLAY AGAIN, MAIN MENU, READY UP!, COPY,
  DONE, ← BACK, LET'S ROLL, ENTER GAME.
- Confirm/dismiss pair on overlays: primary all-caps verb + `← BACK`.
- One idea per line. Split with `·` or `—`, not commas ("A / LT — TAP TO FIRE · HOLD TO CHARGE").
- Tooltips/aria-labels are sentence case and describe the thing, not the joke.
- Numbers stay numerals ("3 KOs", not "three KOs").

## 5. Announcer (The Store PA) writing rules

- Subtitles are ALL CAPS, one sentence, exclamation-forward, ≤ ~8 words.
- Tokens: `{attacker}` `{victim}` `{leader}` `{aisle}` `{title}` `{name}` — every variant
  must read correctly with tokens filled; variants with unfilled tokens are skipped.
- Give each event 2–3 variants; at least one retail pun per pool where it fits.
- Directive *description* lines state the mechanical change flatly ("POINTS DOUBLED");
  the kicker carries the flavor ("DOUBLE BAG"). Don't swap those jobs.
- Callout kickers are 1–3 word category labels: COMBO, LEADER DOWN, SELF CHECKOUT.

## 6. Challenge & unlock writing rules

- Description = imperative verb + number + object: "Cause 15 opponent spills",
  "KO 20 NPC carts", "Reach SAVAGE 5 times".
- "KO" is the verb for takedowns; "knock … into the void" is fine as flavor.
- Unlock hints are terse noun phrases: "10 KOs", "3 Sudden Death wins",
  "15 KOs on Cart Rave".
- Combo goals use tier names, never tier numbers — and the name must match the tier the
  event actually fires on (`combo_t2` → SAVAGE, `combo_t3` → CARNAGE).

## 7. Developer documentation conventions

- Docs use player terms when describing player-visible things, code terms (backticked)
  when describing internals: "the Boost meter (`nitro` in the input packet)".
- "kill feed" / "kill credit" are accepted internal jargon (AGENTS.md invariants use them);
  don't rename existing internals, don't introduce new `kill*` names — prefer `ko*`.
- Historical docs (`docs/archive/`) are frozen; old names inside them are intentional.
- Console log tags stay `[CartRave]` until the brand cutover (matches the frozen
  `window.CartRave` bridge; single sweep later — see [brand.md](./brand.md)).

## 8. Decisions log (why each contested word won)

- **Arena over level/map** — every meta description says "arena brawler"; `level` survives
  in code because renaming `levelManager`/ids risks regressions for zero player value.
- **Round over match/game** — rounds are the only scored unit (150s, Sudden Death on tie);
  "MATCH POINT" kept as an untranslatable-good sports idiom.
- **Boost over nitro** — every visible control (touch button, meter, menu, controls card)
  already said Boost; nitro survives only as frozen wire/config vocabulary.
- **KO over kill/elimination/knockout(v.)** — KO is short, caps-friendly, and already the
  scoring vocabulary (Edge KO / Hazard KO); "kill" reads off-brand for the cartoon tone.
- **Lobby over room/party** — "party" collides with the PartyServer library and the
  `?room=` transport param; players think in lobbies and invite links.
- **Quickplay one word** — matches the button, the room id, and every doc.
