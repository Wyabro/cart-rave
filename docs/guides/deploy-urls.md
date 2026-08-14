# Cart Clash — Deploy map

Three lanes. Do not invent a second Cloudflare “prod.”

| Lane | Job | Command |
|------|-----|---------|
| **Local** | Daily test | `npm run dev:local` → `http://127.0.0.1:3000/` |
| **Cloudflare** | Public prod | **“ship it”** → `npm run ship` |
| **Glitch** | Festival copy of public | **“ship glitch”** → `npm run ship:glitch` (only after prod is good) |

## Cloudflare (one Worker)

Worker name stays **`cart-rave`**. One `npm run ship` updates **both** hosts:

| URL | Role |
|-----|------|
| **https://www.cartclash.lol/** | Share this with players (prefer `www` if apex DNS is bad) |
| **https://cartclash.lol/** | Same Worker (apex) |
| **https://cart-rave.wyabro.workers.dev/** | Same build — agent/bookmark twin, **not** a separate staging env |

Rooms / signaling use the **page host** when it is in `WORKER_PAGE_HOSTS` (`src/config.js`). Local uses `:8787`.

Post-ship (DEPLOY-STALE-HTML-1): **`npx wrangler deploy` exit 0 = published.** Verify is a
separate wait — do **not** redeploy because verify timed out. Run the poll below (or repeat it).
Poll `GET /` + every hashed asset the **live** HTML references until **0×404** **and** the live
entry script hash matches local `dist/index.html`, then confirm a symbol. The first ~45–60 s
after ship often 404s while PoP HTML is stale — that is normal, not a failed deploy.

## Glitch (separate)

Static festival CDN. Multiplayer still talks to **public** CF (`cartclash.lol`).

```powershell
npm run build
$env:GLITCH_DEPLOY_TOKEN = "gl_deploy_..."   # shell only — never commit
$env:GLITCH_ACTIVATE = "1"
npm run ship:glitch
```

Version defaults to `GLITCH_GAME_VERSION` in `src/analytics/glitchConfig.js`. Override with `GLITCH_VERSION` if needed.

## Chat → command

| Wyatt says | Agent runs |
|------------|------------|
| **ship it** | `npm run qa` then `npm run ship` (CF only) — **skip re-qa** if this session already reported QA green by number on the **same `git rev-parse HEAD`** and no source files changed since |
| **ship glitch** | `npm run ship:glitch` (Glitch only) |
| (daily test) | `npm run dev:local` — do **not** deploy to try a tweak |

**Ship-it fast path:** Wyatt said **ship it** + QA already green this session on current HEAD + tree still clean at that SHA → run **`npm run ship` only**, then the post-ship poll below. Re-run full `npm run qa` if HEAD moved, files changed, or QA was never reported this session.

## Verify

### Post-ship asset poll (copy-paste — agents)

Run **after** `npm run ship` succeeds. Requires local `dist/index.html` from that same build.
Default host: `https://www.cartclash.lol/` (same Worker as workers.dev).

**Do not redeploy on timeout.** Wait and re-run this block, or sleep 30 s and retry once.

```powershell
$ErrorActionPreference = "Stop"
$base = "https://www.cartclash.lol"
$localIndex = Join-Path (Get-Location) "dist/index.html"
if (-not (Test-Path $localIndex)) { throw "dist/index.html missing — run npm run build first" }
$localHtml = Get-Content $localIndex -Raw

function Get-AssetRefs([string]$html) {
  [regex]::Matches($html, '(?:src|href)="(\.?/?(?:assets|fonts|brand)/[^"]+)"') |
    ForEach-Object {
      $p = $_.Groups[1].Value
      if ($p.StartsWith("./")) { $p = $p.Substring(1) }
      if (-not $p.StartsWith("/")) { $p = "/" + $p }
      $p
    } | Sort-Object -Unique
}

function Get-EntryScript([string]$html) {
  $m = [regex]::Match($html, 'src="(\.?/?assets/index-[^"]+\.js)"')
  if (-not $m.Success) { return $null }
  $p = $m.Groups[1].Value
  if ($p.StartsWith("./")) { $p = $p.Substring(1) }
  if (-not $p.StartsWith("/")) { $p = "/" + $p }
  $p
}

$localRefs = Get-AssetRefs $localHtml
$localEntry = Get-EntryScript $localHtml
if (-not $localEntry) { throw "could not parse local entry script from dist/index.html" }

$deadline = (Get-Date).AddSeconds(90)
$attempt = 0
$verified = $false
while ((Get-Date) -lt $deadline) {
  $attempt++
  $liveHtml = (Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 25).Content
  $liveEntry = Get-EntryScript $liveHtml
  if ($liveEntry -ne $localEntry) {
    Write-Output ("attempt {0}: stale HTML (live {1} != local {2})" -f $attempt, $liveEntry, $localEntry)
    Start-Sleep -Seconds 3
    continue
  }
  $liveRefs = Get-AssetRefs $liveHtml
  $miss = @()
  foreach ($path in $liveRefs) {
    try {
      $r = Invoke-WebRequest -Uri ($base + $path) -Method Head -UseBasicParsing -TimeoutSec 20
      if ($r.StatusCode -ge 400) { $miss += "$path->$($r.StatusCode)" }
    } catch {
      $miss += "$path->ERR"
    }
  }
  if ($miss.Count -eq 0) {
    Write-Output ("VERIFY_OK attempt={0} entry={1} refs={2}" -f $attempt, $liveEntry, $liveRefs.Count)
    $verified = $true
    break
  }
  Write-Output ("attempt {0}: {1} missing (first: {2})" -f $attempt, $miss.Count, $miss[0])
  Start-Sleep -Seconds 3
}
if (-not $verified) { throw "verify timed out — do NOT redeploy; wait and re-run this poll" }

# Symbol check (replace SYMBOL with the string or minified token you shipped)
# $chunk = ($liveRefs | Where-Object { $_ -match 'gameBoot-' } | Select-Object -First 1)
# (Invoke-WebRequest -Uri ($base + $chunk) -UseBasicParsing).Content | Select-String -Pattern "SYMBOL"
```

**Common agent mistakes (avoid):**

- Regex that only matches `/assets/` — Vite emits `./assets/` (`base: "./"`).
- Polling only HTML script tags while ignoring `link rel="modulepreload"` and stylesheets.
- Treating verify timeout as deploy failure and running `npm run ship` again.
- Sharing the live URL before `VERIFY_OK`.

### Runtime tail

```bash
npx wrangler tail
```

Join a room and watch for unhandled server exceptions. Full gates: `npm run qa` (report by number).
