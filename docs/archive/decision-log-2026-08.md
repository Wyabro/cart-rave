# Decision log — 2026-07-31 → 2026-08-02

Full-text decision entries, moved out of [STATUS.md](../STATUS.md)'s one-line **Decision index**
on 2026-08-03 by STATUS-TRIM-1. **Nothing here is current truth** — the code and `git log` are
authoritative; read these for the *why* behind a past call.

**Why this file exists:** STATUS's index said "full text in
[decision-log-2026-07.md](./decision-log-2026-07.md)", but that log ends at **07-23**. These
seven entries had never been archived anywhere — STATUS was their only copy, so compressing the
index would have destroyed them. Continues from the July log; entries newest first.

---

- **D-SUNDIAL-OQ8** (08-02): **Stylise — keep the 9.93° sun key and the 1.87° sun disc.** The key
  is what sculpts the deck; dropping it to meet the disc keeps only **18.9%** of that sculpting
  while the hemi, already **2.32:1** over the key, goes to **12.26:1**. Whole-deck frame mean is
  the **wrong instrument** here (hemi-dominated, post-exposure — it stays flat while shaping dies).
  If ever revisited, measure sun-facing vs anti-sun-facing **vertical** surfaces.
- **D-SUNDIAL-OQ6** (08-02): **Low is a shipping look.** Sundial water is authored to survive
  Low. Audit item 36 moves up out of Wave 6, and every lever ships its Low path in the same
  commit.
- **D-SUNDIAL-OQ5** (08-02, `93c3deb`): Sundial gets its **own** bloom threshold **0.68** via the
  existing `resolveDisplayBloomConfig` plumbing — frame bloom 55.6% → 18.7%, parity with Classic
  (15.8%), sun disc keeps its glow. Threshold is the **only** knob moved; Classic untouched.
- **D-ROUND-WEDGE-1-A** (08-01): Host-hide MAX cushion = server `pausedWallMs`. MAX reject only
  when `now - runningAnchor - pausedWallMs > ROUND_DURATION_MS + 15_000` (non-SD). MIN stays
  wall-only. Phase B client breaker is separate.
- **D-BOOT-PERF-1** (07-31): Idle warm is not sticky-first-wins — a mid-flight picker bumps gen;
  a stale flight must not latch done; newer serializes after prior.
- **D-HOST-CAP-1** (07-31): Weak-host toast = local host + join-time `score < 50` only (strict
  `<`; neutral 50 silent); once per hostship. Min-spec = accepted fact.
- **D-ANLX-BULK-1** (07-31): Short scripted match ends are non-product. Product metrics require
  `duration_ms >= MIN_MATCH_DURATION_MS` (3000) and non-null; shared constant lives in
  `shared/analyticsConstants.js`.
