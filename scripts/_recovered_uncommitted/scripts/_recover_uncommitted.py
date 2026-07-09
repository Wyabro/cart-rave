"""Recover uncommitted cart-rave files by replaying Grok session edit logs onto HEAD."""
from __future__ import annotations

import json
import shutil
from collections import defaultdict
from pathlib import Path

REPO = Path(r"C:\Users\wyatt\cart-rave")
OUT_DIR = REPO / "scripts" / "_recovered_uncommitted"
SESSIONS = [
    Path(r"C:\Users\wyatt\.grok\sessions\C%3A%5CWINDOWS%5Csystem32\019f4538-9c24-7463-adc4-7bc5aee2fa42"),
    Path(r"C:\Users\wyatt\.grok\sessions\C%3A%5CWINDOWS%5Csystem32\019f4589-48e5-73c3-86d2-5e675e88e129"),
]

TARGET_SUFFIXES = (
    "src\\scene.js",
    "src\\config.js",
    "src\\main.js",
    "src\\levels\\backroomsSupermarket.js",
    "src\\frameVisuals.js",
    "src\\ui\\cameraFraming.js",
    "src\\ui\\pauseOverlay.js",
    "src\\cart-rave-menu.css",
    "index.html",
    "docs\\planning\\handover-postfx-black-frames.md",
)


def norm_path(p: str) -> str | None:
    if not p:
        return None
    p = p.replace("/", "\\")
    low = p.lower()
    for suf in TARGET_SUFFIXES:
        if low.endswith(suf.lower()):
            return str(REPO / suf)
    if "cart-rave" in low:
        # absolute under repo
        idx = low.find("cart-rave\\")
        if idx >= 0:
            rel = p[idx + len("cart-rave\\") :]
            return str(REPO / rel)
    return None


def collect_edits():
    edits = []
    tool_kinds = defaultdict(int)
    for sid in SESSIONS:
        up = sid / "updates.jsonl"
        if not up.exists():
            continue
        with up.open("r", encoding="utf-8", errors="replace") as f:
            for line in f:
                try:
                    j = json.loads(line)
                except Exception:
                    continue
                u = (j.get("params") or {}).get("update") or {}
                ts = j.get("timestamp", 0)
                su = u.get("sessionUpdate")
                if su != "tool_call":
                    continue
                title = (u.get("title") or u.get("toolName") or "").strip()
                raw = u.get("rawInput") or {}
                tool_kinds[title] += 1
                path = norm_path(
                    raw.get("file_path")
                    or raw.get("path")
                    or raw.get("target_file")
                    or ""
                )
                tlow = title.lower()
                if tlow in ("search_replace", "strreplace") or "search_replace" in tlow:
                    if path and ("old_string" in raw or "oldString" in raw):
                        edits.append((ts, "search_replace", path, raw, sid.name))
                elif tlow in ("write",) or tlow.endswith("write"):
                    if path and ("content" in raw or "contents" in raw):
                        edits.append((ts, "write", path, raw, sid.name))
    edits.sort(key=lambda x: x[0])
    return edits, tool_kinds


def apply_edits(edits):
    files: dict[str, str] = {}
    stats = defaultdict(lambda: {"ok": 0, "fail": 0, "writes": 0})

    def load(path: str) -> str:
        if path not in files:
            p = Path(path)
            if p.exists():
                files[path] = p.read_text(encoding="utf-8")
            else:
                files[path] = ""
        return files[path]

    for ts, kind, path, raw, _sid in edits:
        if kind == "write":
            content = raw.get("content")
            if content is None:
                content = raw.get("contents")
            if content is None:
                stats[path]["fail"] += 1
                continue
            files[path] = content
            stats[path]["writes"] += 1
            stats[path]["ok"] += 1
            continue

        old = raw.get("old_string")
        if old is None:
            old = raw.get("oldString")
        new = raw.get("new_string")
        if new is None:
            new = raw.get("newString")
        if old is None or new is None:
            stats[path]["fail"] += 1
            continue
        replace_all = bool(raw.get("replace_all") or raw.get("replaceAll"))
        cur = load(path)
        if replace_all:
            if old not in cur:
                stats[path]["fail"] += 1
                continue
            files[path] = cur.replace(old, new)
            stats[path]["ok"] += 1
        else:
            if old not in cur:
                stats[path]["fail"] += 1
                continue
            # single replace like the tool
            files[path] = cur.replace(old, new, 1)
            stats[path]["ok"] += 1

    return files, stats


def main():
    edits, tool_kinds = collect_edits()
    print("tool kinds (top):")
    for k, v in sorted(tool_kinds.items(), key=lambda x: -x[1])[:30]:
        print(f"  {v:4d}  {k}")
    print(f"\nedits collected: {len(edits)}")
    by_path = defaultdict(int)
    for e in edits:
        by_path[e[2]] += 1
    print("edits per path:")
    for p, c in sorted(by_path.items(), key=lambda x: -x[1]):
        print(f"  {c:4d}  {p}")

    files, stats = apply_edits(edits)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("\napply stats / write recovered:")
    for path, content in sorted(files.items()):
        st = stats[path]
        rel = Path(path).relative_to(REPO)
        out = OUT_DIR / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(content, encoding="utf-8")
        head = REPO / rel
        head_len = head.stat().st_size if head.exists() else 0
        print(
            f"  {rel}: ok={st['ok']} fail={st['fail']} writes={st['writes']} "
            f"recovered_bytes={len(content.encode('utf-8'))} head_bytes={head_len}"
        )

    # Also dump raw write contents inventory
    print("\nDone. Recovered files under", OUT_DIR)


if __name__ == "__main__":
    main()
