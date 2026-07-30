# Archive index

History moved out of the live docs so they stay scannable. **Nothing here is current truth** —
the code and `git log` are authoritative. Read these only when you need the *why* behind a past
decision and the live docs no longer carry it.

**Search before you read.** These files are large. Grep the archive for the symbol, date, or
commit you care about rather than opening a file whole:

```powershell
Select-String -Path docs/archive/**/*.md -Pattern "announcer|host migration"
```

## Session logs — by date range

Rolled out of [STATUS.md](../STATUS.md) when the live log gets long. To find a session,
match the date first, then grep inside.

| Date range | File |
|---|---|
| 2026-07-23 → present | **live** in [STATUS.md](../STATUS.md) (short current-session summary only) |
| 2026-07-30 · CARGO-VIS-1 arc (topic, not date — STATUS keeps the closure summary) | [status-log-2026-07-30-cargo-vis-1.md](./status-log-2026-07-30-cargo-vis-1.md) |
| 2026-07-22 | [status-log-2026-07-22.md](./status-log-2026-07-22.md) |
| 2026-07-21 | [status-log-2026-07-21.md](./status-log-2026-07-21.md) |
| 2026-07-20 → 07-21 | [status-log-2026-07-20-to-21.md](./status-log-2026-07-20-to-21.md) |
| 2026-07-19 → 07-20 | [status-log-2026-07-19-to-20.md](./status-log-2026-07-19-to-20.md) |
| 2026-07-16 → 07-18 | [status-log-2026-07-16-to-18.md](./status-log-2026-07-16-to-18.md) |
| 2026-07-14 → 07-15 | [status-log-2026-07-14-to-15.md](./status-log-2026-07-14-to-15.md) |

## Decisions

| Scope | File |
|---|---|
| July 2026 full-text decision entries | [decision-log-2026-07.md](./decision-log-2026-07.md) |

The one-line **Decision index** in [STATUS.md](../STATUS.md) stays live and points here for
full text.

## Audits, handovers, session notes

- [`audits/`](./audits/) — production-readiness, production-value, boot/asset, scoring, visual
- [`handovers/`](./handovers/) — numbered session handovers (8–14)
- [`session-notes/`](./session-notes/) — per-topic working notes; see its
  [README](./session-notes/README.md)

## When you archive more

1. Cut the oldest dated block out of STATUS.md, not the newest.
2. Give the archive file a `status-log-<start>-to-<end>.md` name and a header saying what
   moved, when, and what stayed live.
3. Add a row to the session-log table above, and update the pointer block at the bottom of
   STATUS.md. An archive nobody can find is a deleted archive.
