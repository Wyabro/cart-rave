# Production Passes — Index (July 2026)

**What is this?** One-page index of the numbered production passes that took Cart Clash from
post-jam to Version-2 candidate: what each pass covered, where it landed, and what it left
behind. **Who should read it?** Anyone trying to understand "what happened in July" without
reading the archives. **Related:** shipped detail in
[completed-work.md](./completed-work.md); long rationale in the
[decision log](../archive/decision-log-2026-07.md); open remainders in
[BACKLOG.md](./BACKLOG.md).

Every pass followed the same shape: read-only audits → merged plan → surgical waves →
`npm run qa` + build gates → Wyatt playtest for taste calls.

| Pass | Theme | Landed as | Status | Left behind (tracked in BACKLOG) |
|------|-------|-----------|--------|----------------------------------|
| **Stability 1** (07-10) | Root-cause bug fixes: SD fall-loop, music playlist, HUD leaks, customization, cart scale, lobby ready | `77d5a52` (+ docs `a25c38c`) | ✅ Shipped | Visible-pane manual checks fold into NET-1 smoke |
| **2 — Performance** (07-10) | 3-tier quality system (low/medium/high), Classic reflector/crowd costs, mobile budgets, CPU allocs | `b79f277` (+ `fe923ab`) | ✅ Shipped | Manual device checks; plan archived: [production-pass-2-performance.md](../archive/session-notes/production-pass-2-performance.md) |
| **3 — UI/Presentation** (07-10) | Sticker language on every non-HUD screen, attract-mode arena menu, exit animations | `7d37263`, `bdd33cc`, `ce737dd` | ✅ Shipped | Phone/results checks; plan archived: [production-pass-3-ui.md](../archive/session-notes/production-pass-3-ui.md) |
| **3.2 — UX flow** (07-11) | Pause redesign, results rebalance, Friends overlay, discoverability, typography residuals | `d5c7f45`..`1b07515` (waves A–F) | ✅ Shipped | — |
| **3.3 — Density** (07-11) | Viewport-fit, touch mode, HUD dvh | `5ed1b69` | ✅ Shipped | — |
| **4 — Gameplay/Combat/AI** (07-11) | Bot stall/latch fixes, proximity aggression, Sundial rim nav + podium contest, intensity ram SFX, hop gates | `73631e0` (D-GP4-1) | ✅ Shipped | **Needs Wyatt playtest**; deferred knobs listed in D-GP4-1 |
| **5 — VFX/Audio/Production value** (07-11) | Grocery-spill juice, debris personality, cargo emissive, neon envMap, comeback callout, Defeat screen, first-blood escalation, victory audio | `043e793`, `7146d71`, `eb924af` | ✅ Shipped | **Needs Wyatt playtest**. Deferrals since resolved: recorded VO ✅, ambient bed ✅ (see audio row below); still deferred: clutch slow-mo, SD music low-pass |
| **Audio content** (07-16) | Store PA recorded voice pack (61 takes, all events); per-arena ambient beds + reactive Cart Rave crowd + SD tension; per-arena music (multi-song-per-level) with new `storerooms.opus`, loudness-matched set | announcer `4a5dca6`..`ae7fcd9`; ambience `8553375`..`5eb3c23`; music `66b8b44` | ✅ Shipped | Wyatt ear pass (levels vs music, SD drone, countdown pacing); refs [announcer.md](../reference/announcer.md), [ambience.md](../reference/ambience.md), [music.md](../reference/music.md) |
| **Stabilization** (07-11) | Travel-based wheel roll, boost-bar leak, Zanzibar podium +20%, menu pacing, grocery separation, dead-code purge (knip zero-ignore) | `b9e8fb8`..`3754949` (D-STAB-1/2) | ✅ Shipped | **Needs Wyatt playtest** (on origin; was mislabeled Unpushed) |

**Cross-cutting July 11 work outside the numbered passes:**

- **VFX-1 flicker investigation → fix** — root cause proven on hardware (D-VFX-2: half-res
  float bloom mips); per-arena bloom pipeline shipped (`98317c1`). Remaining: look check +
  promote to default.
- **Netcode test punch list** — `party/roundValidation.ts`, `party/hostSelection.ts`,
  `applyHostMigration`, P2P size gate all extracted + unit-tested (`1dbb48a`, `6ee9c0b`).
  Remaining: live 2-client plans.
- **Physics WASM** — Rapier SIMD tried (`9d8a69e`), reverted to opt-in after a game-breaking
  borrow error (`8174180`).
- **Visual QA toolchain** — `shoot`/`compare`/`blackframes`, `?blackmon=`, `?rtmode=`,
  STATUS discipline ([guides/visual-qa.md](../guides/visual-qa.md)).

Earlier foundational passes (July 7–9: production-readiness audit, production-value top-10,
announcer, visual polish, HUD redesign, Sundial flagship, Living Store) are chronicled in
[completed-work.md](./completed-work.md) with their audit reports under
[archive/audits/](../archive/audits/).
