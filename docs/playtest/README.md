# Cart Clash — Playtest Plan (V2 validation)

**What is this?** The master plan for the first serious manual playtesting phase — what to
test, in what order, and how to turn play hours into actionable findings. **Why does it
exist?** Implementation is ahead of validation (STATUS: PLAY-1 + NET-1). Every system below
is unit-covered and code-reviewed but most have never been judged by a human at the
controls. **Who runs it?** Wyatt first, then external testers.

**The kit** (all in this folder):

| Doc | Use it when |
|-----|-------------|
| **[console.html](./console.html)** | **Primary — open in a browser.** Repo-owned playtest console: one active task, Match A/B host-role isolation first, export markdown for the agent. Replaces the old Claude artifact (retired). |
| This file | Planning a session; deciding what to test next |
| [solo-checklist.md](./solo-checklist.md) | Any solo session (Sessions 0–4) |
| [multiplayer-smoke.md](./multiplayer-smoke.md) | The NET-1 session (Session 5) — wraps the existing [living-store](../planning/living-store-test-plan.md) + [host-migration](../planning/host-migration-test-plan.md) plans |
| [polish-checklist.md](./polish-checklist.md) | A dedicated screen-by-screen presentation sweep |
| [regression-checklist.md](./regression-checklist.md) | Before every deploy (`npm run ship`) from now on |
| [templates.md](./templates.md) | During ANY session — bug report, balance note, fun-factor sheet |

### Playtest console (current)

Open **[console.html](./console.html)** locally (double-click or “Open with Live Server” — no build step). State lives in browser `localStorage`.

**Process that failed before (do not repeat):** dump 10+ needs-work items → one mega fix batch → ship → mixed host roles → performance feels random.

**Process now:**

1. Run the console cards **in order**. Match **A** (strong machine hosts) then Match **B** (weak machine hosts) before any look/audio cards.
2. **F8 on both machines** — each upload hits prod `/api/captures` automatically (still downloads a local JSON too). Optional label: `?diag=1&captureLabel=run7-A-intel`.
3. On the repo machine: `npm run captures:pull` → files land in `.diag-captures/playtest/` (needs `ERROR_LOG_TOKEN` in `.env.local` once). Paste the console export into chat; tell the agent to pull (or pull yourself first).
4. Agent triages **one** next action. No 10-item dumps.
5. Only after A/B are decoded: P1 one-at-a-time checks.

---

## What automation already covers (don't spend human minutes here)

Run the rigs green before any session — a red rig is cheaper to fix than a wasted sitting:
`npm run gameharness` (solo round flow incl. PA callouts + PLAY-AGAIN rematch + the
KO→unlock funnel incl. reload persistence) and `npm run netharness`
(spawnlock; `--scenario mpIntegration` for join/drive/score-sync/winner/PA/rematch;
`--scenario hostMigration` for clean host departure). Human time goes where the rigs are
blind: **feel, readability, audio, fairness, silent-drop migration, host backgrounding, and
anything that needs taste.** Guide: [../guides/diagnostics.md](../guides/diagnostics.md).
The live checklist is **[console.html](./console.html)** (repo-owned; export back into
chat). This folder also holds the longer reference plans the console was seeded from.
The old Claude.ai “Playtest Console” artifact is **retired** — do not use it.

## Ground rules (read once)

- **One pilot, one scribe.** Solo sessions: pause to write (Esc keeps the sim running —
  note that). Better: talk observations into a voice recorder / phone and transcribe after.
  Stopping to type mid-round destroys flow-state observations, and flow is the product.
- **Log everything, fix nothing mid-session.** A session that ends in DevTools found one
  bug. A session that ends with 15 notes found 15. Triage after.
- **Evidence over vibes** (house rule): every bug note gets arena + mode + quality tier +
  browser; anything visual gets a screenshot or a 10s clip (Win+Alt+R).
- **Keep every window visible** *during normal testing* — a hidden tab freezes its rAF loop
  and fakes bugs. The exception is the dedicated backgrounding pass ([solo-checklist](./solo-checklist.md)
  §F): there you background *on purpose* at reveal moments to hunt the invisible-content trap
  (`npm run tabhidden` automates the menu + countdown cases). Use `127.0.0.1`, never
  `localhost`, when the wrangler control plane is involved.
- **Test the production build** for anything perf- or feel-related (`npm run build` +
  `npm run preview`, or the deployed Worker). Vite dev has known artifacts (level-swap
  cost, dev unlocks) that will pollute findings.
- **Dev-only fast-forward tools.** The Tweakpane **Playtest Tools** panel (press `H`,
  `npm run dev` only — it is *absent* from the prod build) can force Sudden Death, fire a
  directive, grant +5/+15 KOs, and flip dev-unlocks in one click. Workflow: use a quick
  **dev-build pre-pass** to *reach* a state fast, then **reproduce and judge the finding on
  the production build** the session requires. `?devUnlocks=off`, `?blackmon=1`,
  `?forcegpu=`, `?rtmode=` are URL/localStorage levers and work in prod too — only the
  Tweakpane buttons are dev-gated.
- **Known non-issues — do not file** (verified in [project-state.md §5](../planning/project-state.md)):
  sunglasses-tab 1.35× camera zoom (deliberate, animation backlogged); no ambient
  near-edge glow (product cut — only directional *hit* vignette exists); dev-mode level
  swap hitch; Esc overlay not pausing the sim (by design).

### Levers you'll need

| Lever | What it does |
|-------|--------------|
| `?devUnlocks=off` (or `localStorage cartRaveDevUnlocks="off"`) | Real progression locks in dev — **required** for FTUE testing |
| Incognito window / clear `cartRave*` localStorage keys | Fresh-player profile |
| `?preset=low\|medium\|high` | Force a quality tier |
| `?forcegpu=sw\|igpu\|discrete` (DEV) | Fake GPU class for tier-assignment testing |
| `?bloompipe=hdr` | Legacy HDR bloom split (display-referred is the shipped default; VFX-1 closed 07-17) |
| `?blackmon=1` | Live black-frame monitor |
| chrome://settings/system → hardware acceleration OFF | The real potato repro (expect COMPATIBILITY MODE notice) |
| `node tools/perf-profile.mjs` | Headless perf probe |

---

## Testing order — seven sessions (0–6)

The order minimizes wasted hours: each session can invalidate the ones after it, so run
them in dependency order. A crash found in Session 0 voids a Session 2 balance note; a
taste-tuning change from Session 1 voids Session 2 feel notes; solo bugs are 10× cheaper
to find solo than with three browsers open, and external testers' first impressions are
**one-shot** — never spend them on bugs you could have found yourself.

### Session 0 — Stability baseline (~30 min)
Can the game be played at all, everywhere it claims to run?
Production build. Boot → solo round → clean exit on: Chrome, Edge, phone. One full round
on **each arena**. Chrome-no-acceleration compatibility path (the potato-hardening fix has
never had its real repro). DevTools console open the whole time — **zero errors is the bar**.
*Failure here stops everything; nothing else is worth testing on a build that crashes.*

### Session 1 — Drain the validation debt (~60–90 min)
The existing Wyatt queue from [STATUS.md](../STATUS.md): stabilization pass feel (wheel
roll, podium +20%, menu pacing), Pass 4 (bot stalls, edge-camper follow, podium contest,
ram-SFX range), Pass 5 (spill juice, debris, Defeat screen, victory audio), and the
**transition pacing pass** (winner-cam length
+ any-input skip, countdown hierarchy, returning-player boot hold, disconnect toasts —
[solo-checklist.md](./solo-checklist.md) §B new section).
*This goes before deep solo testing because its outcome is taste-tuning: any knob turned
here invalidates feel observations made after it. It also unblocks pushing/promoting work.*
Use [solo-checklist.md](./solo-checklist.md) §Queue.

### Session 2 — First-time player experience + full solo depth (~90 min)
Fresh profile + `?devUnlocks=off` + production build. Play like a stranger: no muscle
memory, read every screen, follow only what the game tells you. Then grind the real
progression funnel: 10 KOs on Cart Rave → unlock Storerooms → 15 KOs there → Sundial.
Challenges, unlock toasts, customize flow, personal bests.
*Nobody — human or agent — has ever played the game with real locks on. This is the
single most untested player-facing surface in the project.*

### Session 3 — Edge cases and abuse (~60 min)
Everything a real player does that a checklist doesn't: alt-tab mid-round (incl. as
host), refresh mid-round, resize/zoom the window, spam every input during countdown/
podium/SD, quit-to-menu from every phase, replay immediately, phone rotate mid-round,
touch-control edge reach. Force Sudden Death deliberately (tie the score) — SD now has a **45s stalemate cap**
(run-6: `suddenDeathMaxMs`); still observe feel and confirm the cap ends the round.

### Session 4 — Long-session soak (~45+ min continuous)
One sitting, many rematches, no refresh. Watch for: degradation (heap sawtooth ~2–3 MB/s
during play is documented — does a 45-min session survive?), auto-quality stepping down
over time, audio desync/accumulation, challenge progress persisting across matches,
DevTools memory + FPS at minute 0 vs 40.
*Automated tests run for seconds; players run for hours. Leak-shaped bugs only live here.*

### Session 5 — Multiplayer live smoke (NET-1, the V2 gate) (~90 min, 2 people or 2 machines + phone)
The full [multiplayer-smoke.md](./multiplayer-smoke.md): join/ready/round/SD/podium/
rematch, quickplay arena rotation at the rematch seam (shipped, **never live-tested**),
Living Store two-client checklist, host-migration checklist (clean close + silent drop),
disconnect/rejoin. *Last among internal sessions because it costs the most setup and
depends on solo being clean — every solo bug reproduces in MP with worse observability.*

### Session 6 — External testers
Only after 0–5 are green and taste-tuning has landed. Give them **nothing** but the URL —
their confusion is the FTUE data. Watch over shoulder or screen-share; do not coach.
Have them fill the fun-factor sheet ([templates.md](./templates.md)) after, not during.
Recruit at least one genuinely weak laptop and one phone-only player.

---

## Category guide — what to evaluate, what failure looks like, what to record

Priority tiers: 🔴 = can sink V2 · 🟡 = must be right before wide release · 🟢 = polish.

### 🔴 First-time player experience
- **Evaluate:** Can a stranger get from URL to "I understand this game" inside one round, with zero explanation?
- **Failure:** Doesn't know the goal, the controls, or why they died; bounces at the menu; never finds Boost/hop.
- **Record:** Time-to-first-input, time-to-first-KO (scored *and* suffered), every moment of visible hesitation, first utterance after round 1.

### 🔴 Controls & combat feel
- **Evaluate:** Tank steering readability, boost-ram commitment/reward, hop utility (raycast grounded check is new), hit feedback weight, wheel-roll direction by eye (stabilization fix).
- **Failure:** Inputs feel eaten (hop on slopes was exactly this), collisions feel weightless or random, deaths feel unfair rather than earned.
- **Record:** Every "that should have hit / shouldn't have killed me" moment with arena + position; balance notes on boost/hop cooldown feel.

### 🔴 Stability & performance
- **Evaluate:** Zero crashes, zero console errors, no stutter on KO/spill (the shader-recompile class of bug), tier auto-assignment sanity on each machine, auto-quality step-down behavior.
- **Failure:** Any wedge (stuck screen, dead countdown, unresponsive menu), frame-gap hitches at events, tab OOM on weak hardware.
- **Record:** Machine + GPU + assigned tier; FPS ranges per arena; exact phase for any wedge (screenshot the console).

### 🔴 Multiplayer (Session 5)
- Covered item-by-item in [multiplayer-smoke.md](./multiplayer-smoke.md). The bar: a full session with a friend where **nothing reminds you it's networked**.

### 🟡 Onboarding & menu flow
- **Evaluate:** Menu → mode pick → customize → arena pick → round, and back, without dead ends; attract mode sells the game; menu pacing (~700 ms swaps) feels snappy not sluggish.
- **Failure:** Any state you can't leave, any button that needs a second press, unlock hints that don't explain what to do (hints are terse — "10 KOs on Cart Rave" — is that enough?).
- **Record:** Every misclick and every "what does this do?"; menu-to-round seconds.

### 🟡 Readability, camera & visual clarity
- **Evaluate:** Can you track your cart in a 4-cart furball? Are edges/voids obvious *before* you fall in? Does each arena read at Low tier and on a phone? Effects readability: does spill/debris/bloom juice ever hide gameplay?
- **Failure:** Losing your own cart, falling off an edge you couldn't see, VFX obscuring an incoming rammer, HUD elements colliding (esp. phone portrait).
- **Record:** Arena + camera position for every readability complaint; screenshots of any HUD collision; per-arena "worst spot" notes.

### 🟡 Scoring & Living Store
- **Evaluate:** Score events understood at the moment they happen (crit/leader/combo/directive bonuses stack — can a player tell *why* they got 3 points?); cargo bay readable as a scoreboard at speed; each directive (Flash Sale / Double Bag / Express Lane / Spill Bonus / Rush Hour) noticed, understood, and felt.
- **Failure:** Score changes feel arbitrary; directives fire and the player can't say what changed; spill-comeback buff invisible.
- **Record:** After each round, ask (or ask yourself): "why did the winner win?" — a wrong answer is a readability bug. Note any directive that landed as noise.

### 🟡 Announcer pacing
- **Evaluate:** The PA celebrates the right moments without spamming; priorities feel right (directive focus windows suppressing lesser barks); dead air in quiet rounds acceptable?
- **Failure:** Two callouts fighting, a big moment (first blood, SD) going unannounced, `cleanup_aisle`-class barks feeling naggy, callouts covering gameplay.
- **Record:** Any overlap/step-on, any missed beat, any bark you got tired of — with round timestamp. Event table: [announcer.md](../reference/announcer.md).

### 🟡 AI behavior & difficulty progression
- **Evaluate:** Bots read as opponents, not roombas: no stalls/latches (Pass 4 fix), Sundial rim navigation, podium contest visible, edge-camper punishment. Solo rubberband: does a losing player get a comeback chance without a winning player feeling cheated?
- **Failure:** A bot idling >5 s, driving circles, falling off unforced repeatedly, or visibly teleport-cheating; rounds that are never close OR always suspiciously close.
- **Record:** Arena + timestamp of any stall; final scores of every solo round (the spread is the rubberband data); "did the bots feel fair?" per session. AI difficulty selection is **proposal-only** ([ai-difficulty-proposal.md](../planning/ai-difficulty-proposal.md)) — evaluate the single current tuning, note where a difficulty knob is actually needed.

### 🟡 Challenges, unlocks & progression pacing
- **Evaluate:** With real locks: are the first-hour goals visible and motivating? Unlock toasts legible mid-match (5 s, above announcer)? Daily/weekly challenges tracked correctly across matches? Is 10 KOs → Storerooms the right first gate?
- **Failure:** Progress not counting (esp. `untouchable`, `last_standing`, `sd_win` — all had double-count fixes this week), a toast missed entirely, a hint that doesn't parse, rotation not refreshing (known: only checked at boot).
- **Record:** Each unlock: expected vs actual trigger; minutes-to-first-unlock; any challenge whose progress number surprised you.

### 🟡 Audio balance
- **Evaluate:** Music vs SFX vs PA mix; charge/boost loops stopping cleanly (recent fix); intensity-scaled ram SFX range; victory/defeat audio distinct; nothing clipping or piercing on phone speakers.
- **Failure:** A loop that survives a round boundary, PA inaudible under music, one SFX dominating, silence where a hit deserved a sound.
- **Record:** Relative-loudness complaints ("music drowns PA on Storerooms"), any loop leak with the phase it leaked across, mute/unmute (M) behavior.

### 🟢 Polish & fun
- Polish: run [polish-checklist.md](./polish-checklist.md) as its own sweep — every screen, every transition, every toast.
- Fun is the point of all of the above: fill the fun-factor sheet in [templates.md](./templates.md) at the END of every session, while the feeling is fresh. The single most valuable data point in this whole plan is *"did you want one more round?"*

---

## Blind-spot register — where the bugs are hiding

Ranked by (likelihood × impact × how blind automation is). These deserve deliberate time:

1. **Everything multiplayer-live** — zero real-session minutes ever. Highest-risk sub-items: quickplay arena rotation at the rematch seam (new, complex, masked swap + physics gate + spawn refresh), NET-MIG-2 fix live behavior, silent-drop reaping (20 s window), migration *feel*.
2. **Real progression funnel** — dev-unlocks-all means every session to date played with locks off. Unlock triggers, hints, toasts, level gates: all human-unvalidated.
3. **Sudden Death** — two fixes this week (invisible carts, spectator phantom falls), no timeout by design, NET-SD-1 open. Deliberately force ties; automated tests can't judge a 4-minute SD stalemate's feel.
4. **Long sessions** — heap sawtooth documented, challenge rotation checked only at boot, WAAPI/hidden-tab interactions. No test runs longer than seconds.
5. **Phone / touch** — nipplejs joystick feel, HUD chip vs thumb collision, portrait vs landscape, phone-speaker audio mix. The living-store phone pass has never run.
6. **Host tab backgrounding** — hidden host tab freezes the authoritative sim (documented). Real players *will* alt-tab. What do the other three players experience, and does it recover?
7. **Recently re-authored art paths** — one-piece visor on every body scale × pattern × mirror style; sealed basket master; NPC patterns riding the fragmented-UV risk (documented revert lever: `NPC_PATTERN_POOL` → `["classic"]`).
8. **Tier boundaries on real hardware** — `?forcegpu` fakes were verified; a real SwiftShader Chrome, a real 2 GB-RAM laptop, and a real retina-discrete machine have not been.
9. **Announcer arbitration under load** — priorities/cooldowns were reasoned about, not heard. A chaotic 4-cart round with directives is the stress case.
10. **Rare flows** — last-cart-standing flourish (documented as likely unreachable in timed rounds — confirm or kill), podium-reject retry loop, spectator experience during SD.
11. **Winner-cam any-input skip** (new 2026-07-13) — never played by a human; the 450 ms anti-mash grace, gamepad rising-edge poll, and interaction with round-end input mash (players often hold boost/steer through the KO) are all reasoned-about, not observed. Also confirm in MP that a local skip on one client doesn't read as "wrong"/desynced to the others (it's local-only by design — camera/results have never been broadcast).

---

## After every session

1. Transfer voice notes / scribbles into bug reports + balance notes ([templates.md](./templates.md)).
2. Triage: S0 wedge/crash → fix before next session; S1 breaks-a-round → fix this week; S2/S3 → BACKLOG with priority.
3. Fill the fun-factor sheet while warm.
4. Update [STATUS.md](../STATUS.md) — which queue items are now validated, what tuning was requested.
5. Fixes ride the normal gates (`npm run qa`), then the [regression-checklist.md](./regression-checklist.md) before any deploy.
