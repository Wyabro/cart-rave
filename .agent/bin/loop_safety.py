"""Fail-closed primitives for the self-improving loop control plane."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any
from uuid import uuid4


MAX_READ_ONLY_COMMAND_SECONDS = 60
RUN_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")
READ_ONLY_COMMANDS: dict[str, tuple[str, ...]] = {
    "git_diff": ("git", "diff", "--"),
    "git_log": ("git", "log", "--oneline", "-12"),
    "git_status": ("git", "status", "--short", "--untracked-files=all"),
    "npm_qa": ("npm", "run", "qa"),
}


class LoopSafetyError(RuntimeError):
    """Raised when a loop capability must fail closed."""


def atomic_write_text(path: Path, value: str) -> None:
    """Write one text artifact by replace, never in place."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    temporary.write_text(value, encoding="utf-8")
    temporary.replace(path)


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    atomic_write_text(path, json.dumps(payload, indent=2, sort_keys=True) + "\n")


class RunArtifacts:
    """Own a fixed set of atomically-written artifacts for one run."""

    def __init__(self, root: Path, namespace: Path, run_id: str) -> None:
        if not RUN_ID_RE.fullmatch(run_id):
            raise LoopSafetyError("invalid run ID")
        if namespace.is_absolute() or not namespace.parts or any(
            part in {"", ".", ".."} for part in namespace.parts
        ):
            raise LoopSafetyError("artifact namespace must be a relative path")
        self.root = root.resolve()
        self.run_id = run_id
        self.run_dir = self._inside_root(self.root / namespace / run_id)

    def _inside_root(self, path: Path) -> Path:
        resolved = path.resolve(strict=False)
        try:
            resolved.relative_to(self.root)
        except ValueError as exc:
            raise LoopSafetyError("artifact path escapes the worktree") from exc
        return resolved

    def path(self, name: str) -> Path:
        candidate = Path(name)
        if candidate.is_absolute() or len(candidate.parts) != 1 or candidate.name != name:
            raise LoopSafetyError("artifact name must be one file name")
        return self._inside_root(self.run_dir / candidate)

    def write_text(self, name: str, value: str) -> Path:
        path = self.path(name)
        atomic_write_text(path, value)
        return path

    def write_json(self, name: str, payload: dict[str, Any]) -> Path:
        path = self.path(name)
        atomic_write_json(path, payload)
        return path


def run_readonly(
    root: Path,
    operation: str,
    *,
    timeout_seconds: int = MAX_READ_ONLY_COMMAND_SECONDS,
) -> str:
    """Run one host-defined read-only command without a shell."""
    if operation not in READ_ONLY_COMMANDS:
        raise LoopSafetyError(f"unsupported read-only operation: {operation}")
    timeout = max(1, min(int(timeout_seconds), MAX_READ_ONLY_COMMAND_SECONDS))
    try:
        completed = subprocess.run(
            list(READ_ONLY_COMMANDS[operation]),
            cwd=root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise LoopSafetyError("read-only operation timed out") from exc
    output = (completed.stdout or "") + ("\n" + completed.stderr if completed.stderr else "")
    return f"exit_code={completed.returncode}\n{output.strip()}"
