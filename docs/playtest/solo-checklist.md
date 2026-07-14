# Solo playtest checklist

Print-or-split-screen companion for Sessions 0–4 ([README.md](./README.md)). Tick boxes,
scribble margins, transfer to [templates.md](./templates.md) after. Console open, window
visible, production build unless stated.

## A. Boot & baseline (Session 0)

- [ ] Cold load → menu, no console errors; splash/loading acceptable on first visit (cold cache)
- [ ] Assigned quality tier is sane for this machine (check settings; note GPU + tier)
- [ ] Solo → full 150 s round → podium → play again → quit to menu → back into solo. No wedge at any seam
- [ ] Returning-player boot (relaunch the tab after one prior visit): splash hold noticeably shorter than first-ever load, crash animation still reads as a beat (not truncated mid-hit)
- [ ] One full round on **each** arena: Cart Rave, The Storerooms, Sundial Station
- [ ] No black frames / flicker on any arena (glance `?blackmon=1` if suspicious)
- [ ] Chrome with hardware acceleration OFF: COMPATIBILITY MODE notice appears, game stays playable at Low
- [ ] Phone: loads, joystick + Boost/Hop reachable, one full round

## B. The validation queue (Session 1)

Stabilization:
- [ ] Wheel roll direction correct by eye at all speeds, both steer directions
- [ ] Sundial podium (+20%) — feels contestable; AI actually fights for it
- [ ] Menu pacing (~700 ms) — snappy, not laggy; arena picker swaps masked (no freeze)
- [ ] Grocery pile look; menu backdrop gradient

Pass 4 (gameplay/AI):
- [ ] No bot stalls/latches — all 3 arenas, watch full rounds
- [ ] Bots follow/punish an edge-camper (park yourself on the rim and wait)
- [ ] Sundial rim navigation — bots don't lemming off
- [ ] Ram SFX dynamic range — soft taps quiet, big hits loud

Pass 5 (VFX/audio):
- [ ] Grocery-spill burst + clatter lands; debris has personality without hiding play
- [ ] Defeat screen distinct from Victory; first-blood escalation; victory audio
- [ ] Comeback callout fires and reads

Bloom A/B (all three arenas, judge against "dark + punchy neon, don't brighten"):
- [ ] Default vs `?rtmode=bloomfix` — pick per arena; note any threshold/strength tuning
- [ ] Decision recorded: promote bloomfix to default? (kills VFX-1)

Transition pacing pass (2026-07-13, new this session):
- [ ] Countdown: GET READY kicker + big hero digit read clearly at a glance, doesn't feel cramped at any window size; GO!/SUDDEN DEATH/MATCH POINT unaffected
- [ ] Winner camera: ~2.4 s orbit feels intentional, not clipped; victory/defeat VO + confetti still land
- [ ] Winner camera skip: press any key / click / tap during the winner cam — results appear immediately; try it within the first ~0.5 s too (should NOT skip — that's the anti-mash grace window, confirm it doesn't feel unresponsive)
- [ ] Gamepad: a button press during the winner cam also skips it
- [ ] Play Again → next round: no dead air beyond the 3 s countdown
- [ ] Quit to menu mid-session (not first launch): menu appears instantly, no ~1 s entrance replay; first-ever menu-of-session still gets the full cascade
- [ ] Force a failed join (bad `?room=` or airplane-mode the request): toast explains why you're back at the menu, doesn't just fail silently

## C. First-time experience (Session 2 — fresh profile, `?devUnlocks=off`)

- [ ] Stopwatch: seconds from URL → first input → first KO scored → first KO suffered
- [ ] Controls discoverable without being told (find Boost and hop unprompted?)
- [ ] Goal understood after round 1 ("why did the winner win?" — answer must be right)
- [ ] Locked arenas: presentation clear, hint parses, not demotivating
- [ ] Grind the funnel: 15 KOs on Cart Rave → Storerooms toast + menu unlock; note minutes taken and whether it felt like progress or grind
- [ ] Each unlock toast: legible mid-match, correct item, 5 s hold survives announcer traffic
- [ ] Challenges panel: today's daily + weekly understood; progress ticks live; persists across matches and reload
- [ ] Customize: color / pattern / sunglasses each apply, save, survive reload; partial save doesn't clobber
- [ ] Personal bests update when beaten, not otherwise

## D. Edge cases & abuse (Session 3)

- [ ] Alt-tab 10 s mid-round → return: sim state sane, no audio pileup, no time skip weirdness
- [ ] Refresh mid-round → recover to menu cleanly (no phantom room state)
- [ ] Esc overlay in every phase: countdown, running, SD, podium — enter + exit clean
- [ ] Quit to menu from every phase; immediately re-enter solo
- [ ] Spam inputs during countdown (drive/boost/hop before GO — anything leak?)
- [ ] Mash Play Again on podium (double-entry? double challenge credit? — `last_standing` had this)
- [ ] Mash every input during the winner-cam window (post-round): does it double-skip, re-trigger VO/confetti, or otherwise glitch the podium-to-results transition?
- [ ] Window resize + browser zoom mid-round: HUD reflows, camera framing survives, DPR cap respected
- [ ] **Force Sudden Death** (engineer a tie): entry clean, all carts visible (recent fix), SD resolves on next KO, note how a long SD feels (no timeout exists — is that OK?)
- [ ] Fall into every void/hole type on each arena — respawn, score, camera all correct
- [ ] Shatter + respawn repeatedly: cart size/scale stays canonical
- [ ] Boost-charge loop SFX: dies at round end / fall / SD entry (recent fix — try to leak it)
- [ ] Phone: rotate portrait↔landscape mid-round; background the app 10 s; incoming-call-sized interruption
- [ ] M mute toggle in every phase; audio state correct after unmute

## E. Soak (Session 4 — one sitting, no refresh, 45+ min)

- [ ] Note FPS + DevTools memory at minutes 0 / 15 / 30 / 45
- [ ] 10+ consecutive rematches: seams stay clean, no growing hitch at round start
- [ ] Auto-quality: note any step-down events and whether they were justified
- [ ] Audio still balanced/clean at minute 40 (no accumulation, desync, or dropouts)
- [ ] Challenge/unlock progress accumulated across the whole sitting matches expectations
- [ ] End-of-soak: does one MORE round still sound appealing? (fun-factor sheet)

## F. Tab-backgrounding & invisible-content (required when a change touched reveals/animations)

The [visual-qa](../guides/visual-qa.md) UI checklist rule #1: content must stay visible
even if its entrance animation never fires. `npm run tabhidden` automates the **menu
entrance** and **round-start countdown** cases headless — run it first. These manual checks
cover what it can't: real Chrome/mobile throttling, the reveals it doesn't reach, and
mid-transition timing. The trick is to background **during the reveal/transition itself**,
not once everything has settled.

- [ ] Menu entrance: hard-refresh the menu and Alt-tab away **during** the ~700 ms entrance cascade; return after ~3 s. Title, tagline, PLAY/mode buttons, arena cards all present and interactive — nothing stuck invisible
- [ ] Round-start countdown: Alt-tab away the instant a solo round's GET READY / 3-2-1 appears; return after the round would have started. HUD is showing a **running** round (timer ticking, score boxes visible) — not frozen on a countdown digit or a blank HUD
- [ ] Podium / results reveal: Alt-tab away as the round ends and the podium/results overlay is animating in; return. Every result row, button, and stat is visible and clickable (results + pause overlays use the same opacity:0→1 reveal as the menu — same trap)
- [ ] Pause (Esc) overlay: open Esc, Alt-tab during its enter animation, return — panel fully visible; also background **while paused**, return, unpause cleanly
- [ ] Real backgrounding, not just Alt-tab: switch to another app / minimize (harder throttling than a covered tab), and once with the machine idle long enough to sleep the tab (~5 min); return at each reveal above
- [ ] Phone/tablet: app-switch (or lock screen) during the menu entrance, the countdown, and the podium reveal; return — no blank/stranded UI, no stuck transition (mobile Safari/Chrome throttle harder than desktop)
- [ ] Multiplayer host tab backgrounded (known blind spot): background the HOST during a round-start / podium reveal on a 2-client session; both clients recover, no stranded HUD on the host when it returns
