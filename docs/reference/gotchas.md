# Gotchas — overflow

Hard-won facts that no longer earn a slot in [STATUS.md](../STATUS.md) `## Gotchas`, which
carries only the ones a current session is likely to hit. Nothing here is stale — it is
**deep-domain or narrow**, so it is looked up rather than read.

Grep this file by symbol when a subsystem surprises you. STATUS keeps the hot set; when a
gotcha here starts biting again, move it back rather than duplicating it.

## Rendering

- **VHS is level-gated** via `uVhsAmount` (Storerooms only); `?ablate=vhs` zeros the uniform
  without killing the arcade CRT.

## Netcode

- **Joining quickplay mid-round runs a cold world bootstrap that blocks the main thread.** The
  resume-guard (`dt>0.25s → accumulator=0`) can starve input sampling → cart frozen at spawn
  until it clears. This is NET-2 class — the harness documents it
  ([netcode-harness.md](../guides/netcode-harness.md)).
- **Netcode 2-client rig:** the two clients MUST be separate `chromium.launch()` processes; add
  per-page focus + `?perfPump`. Prefer a persistent `npm run dev:local` via `--url`.

## Physics / platform

- **Rapier WASM:** standard build is the default; SIMD is opt-in only (borrow error).

## Naming

- **`localStorage` keys remain `cartRave*`** until the brand migration ([brand.md](../brand.md)).

## Claude Code harness

These were expensive to learn and are still true — but with the operating system frozen during
game cards (AGENTS.md § HOW WORK IS EXECUTED), they are reference, not daily reading.

- **Concurrent agent sessions may `git add -A`** — commit surgically when working alongside one.
  The `guard-git-add.mjs` hook now blocks the whole-tree forms; this is the reason it exists.
- **Stop-hook `stop_hook_active` is inverted from the obvious reading:** `true` means "already
  continuing because of a prior block" → **return success / do not re-block**; `false` is the
  normal first Stop where the guard should run. Verified against the shipped `claude` binary,
  not the docs — `WebFetch` summarized a truncated docs page and confidently reported the
  opposite polarity *and* a wrong block cap (real cap is 8,
  `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`). Inverting it disables the guard on every normal turn
  while still looking wired up. Grep the binary before trusting a doc summary on hook payload
  semantics.
- **`.claude/settings.json` is strict JSON, not JSONC** — a `//` comment there can fail parsing
  and silently drop *every* hook in the file. Caveats belong in the hook headers and
  AGENTS.md § Enforcement.
- **Claude Code permission rules are globs, never regex** — `|` alternation inside `Bash(...)`
  matches nothing. A space before `*` enforces a word boundary (`Bash(ls *)` ≠ `lsof`), rules
  match each `&&`/`;`/`|` subcommand independently, and a broad deny beats a narrower allow.
