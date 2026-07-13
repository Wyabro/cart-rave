# Playtest templates — bug report · balance note · fun factor

Copy the block, fill it, drop it in the session's notes file (suggested:
`docs/playtest/sessions/YYYY-MM-DD-<session>.md`, gitignored or committed — your call).
Voice-note during play, transcribe after.

---

## Bug report

```
### BUG: <one line — symptom, not cause>
Severity: S0 wedge/crash | S1 breaks a round or score | S2 glitch, playable | S3 polish
Build: <commit / prod deploy> · Mode: solo|quickplay|friends · Arena: <name>
Machine: <browser + GPU + tier> · Host or client? · Phase: menu|countdown|running|SD|podium
Repro: <steps, or "seen once">          Rate: always | sometimes (x/y) | once
Expected:
Actual:
Evidence: <screenshot/clip/console paste>
Notes: <console errors? does it recover?>
```

Rules of thumb: symptom in the title, never your guessed cause. "Seen once" is still worth
filing — rare bugs cluster. If it wedged the game, screenshot the console BEFORE refreshing.

---

## Balance / tuning note

```
### TUNE: <system — e.g. boost cooldown, rubberband, Flash Sale force>
Felt: <what happened, concretely — "bot caught me from half an arena away">
Wanted: <what it should have felt like>
Suspect knob: <CONFIG path if known — else leave blank, don't guess>
Confidence: strong (felt it 3+ times) | weak (once, maybe me)
Session context: <arena, round #, was I winning/losing>
```

Balance data needs repetition — record final scores of EVERY solo round in the session
footer (the spread over 10 rounds is the real rubberband/difficulty picture, not any
single round). Known deliberately-kept knobs (D-GP4-1): nitro duty-cycle, `maxImpulse`
vs boost, air control — reopen only with 3+ felt instances.

---

## Fun-factor sheet — fill at session END, while warm

```
Session: <date / which session> · Minutes played: · Rounds:
1. Did you want one more round when you stopped?            yes / no / meh
2. Best moment of the session (one sentence):
3. Worst moment / biggest frustration:
4. When did you last smile or laugh? (round/moment)
5. Deaths: mostly earned or mostly cheap?                   earned / mixed / cheap
6. Any stretch where you were bored? When?
7. Did winning feel deserved? Did losing make you want revenge or want to quit?
8. One thing you'd show a friend first:
9. One thing you'd be embarrassed for a friend to see:
10. Gut score, would-play-again: 1–5
```

For external testers (Session 6), add:
```
11. What do you think the goal of the game is? (their words — grade FTUE by this)
12. What did Boost do? What did hop do? (did they even find them?)
13. Would you send this link to anyone? Who?
```

---

## Session footer (every session)

```
Build/commit: · Date: · Duration: · Arenas played:
Solo round scores: <e.g. 7-5-4-2, 6-6-3-1 → SD, ...>
Bugs filed: S0 __ S1 __ S2 __ S3 __ · Tune notes: __
Queue items validated this session: <which STATUS playtest-queue items can be marked done>
Next session should start with: <the one thing to check first>
```
