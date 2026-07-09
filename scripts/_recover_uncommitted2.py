"""Recover uncommitted files from Grok tool_call_update diffs (completed edits)."""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

REPO = Path(r"C:\Users\wyatt\cart-rave")
OUT = REPO / "scripts" / "_recovered_uncommitted"
SESSIONS = [
    Path(
        r"C:\Users\wyatt\.grok\sessions\C%3A%5CWINDOWS%5Csystem32\019f4538-9c24-7463-adc4-7bc5aee2fa42"
    ),
    Path(
        r"C:\Users\wyatt\.grok\sessions\C%3A%5CWINDOWS%5Csystem32\019f4589-48e5-73c3-86d2-5e675e88e129"
    ),
]
TARGETS = {
    "scene.js",
    "config.js",
    "main.js",
    "backroomsSupermarket.js",
    "frameVisuals.js",
    "cameraFraming.js",
    "pauseOverlay.js",
    "cart-rave-menu.css",
    "index.html",
    "handover-postfx-black-frames.md",
}


def to_repo_path(p: str) -> Path | None:
    if not p:
        return None
    p = p.replace("/", "\\")
    low = p.lower()
    marker = "cart-rave\\"
    if marker in low:
        rel = p[low.find(marker) + len(marker) :]
        return REPO / rel
    return None


def is_target(path: Path) -> bool:
    return path.name in TARGETS or "handover-postfx" in path.name


def collect():
    edits = []  # (ts, path, old, new, tid)
    writes = []  # (ts, path, content)
    seen = set()

    for sid in SESSIONS:
        with (sid / "updates.jsonl").open(encoding="utf-8", errors="replace") as f:
            for line in f:
                try:
                    j = json.loads(line)
                except Exception:
                    continue
                u = (j.get("params") or {}).get("update") or {}
                ts = j.get("timestamp", 0)
                su = u.get("sessionUpdate")

                if su == "tool_call" and (u.get("title") or "").lower() == "write":
                    raw = u.get("rawInput") or {}
                    path = to_repo_path(raw.get("file_path") or raw.get("path") or "")
                    content = raw.get("content")
                    if path and is_target(path) and content is not None:
                        writes.append((ts, path, content))
                    continue

                if su != "tool_call_update" or u.get("kind") != "edit":
                    continue

                tid = u.get("toolCallId")
                for c in u.get("content") or []:
                    if c.get("type") != "diff":
                        continue
                    path = to_repo_path(c.get("path") or "")
                    if not path or not is_target(path):
                        continue
                    old = c.get("oldText")
                    new = c.get("newText")
                    if old is None or new is None:
                        continue
                    key = (tid, str(path), hash(old), hash(new))
                    if key in seen:
                        continue
                    seen.add(key)
                    edits.append((ts, path, old, new, tid))

    edits.sort(key=lambda x: x[0])
    writes.sort(key=lambda x: x[0])
    return edits, writes


def apply(edits, writes):
    files: dict[str, str] = {}
    stats = defaultdict(lambda: {"ok": 0, "fail": 0, "writes": 0})
    fails = []

    def load(path: Path) -> str:
        k = str(path)
        if k not in files:
            files[k] = path.read_text(encoding="utf-8") if path.exists() else ""
        return files[k]

    for _ts, path, content in writes:
        files[str(path)] = content
        stats[str(path)]["writes"] += 1
        stats[str(path)]["ok"] += 1

    for _ts, path, old, new, tid in edits:
        k = str(path)
        cur = load(path)
        if old not in cur:
            old_n = old.replace("\r\n", "\n")
            cur_n = cur.replace("\r\n", "\n")
            if old_n in cur_n:
                files[k] = cur_n
                old = old_n
                new = new.replace("\r\n", "\n")
            else:
                stats[k]["fail"] += 1
                fails.append((path.name, tid, len(old), old[:80].replace("\n", "\\n")))
                continue
        files[k] = files[k].replace(old, new, 1)
        stats[k]["ok"] += 1

    return files, stats, fails


def main():
    edits, writes = collect()
    print(f"diff edits={len(edits)} writes={len(writes)}")
    files, stats, fails = apply(edits, writes)

    OUT.mkdir(parents=True, exist_ok=True)
    for k, content in sorted(files.items()):
        path = Path(k)
        rel = path.relative_to(REPO)
        out = OUT / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(content, encoding="utf-8")
        head_len = path.stat().st_size if path.exists() else 0
        st = stats[k]
        print(
            f"{rel}: ok={st['ok']} fail={st['fail']} writes={st['writes']} "
            f"bytes={len(content.encode('utf-8'))} head={head_len}"
        )

    if fails:
        print("\nFirst fails:")
        for f in fails[:20]:
            print(" ", f)


if __name__ == "__main__":
    main()
