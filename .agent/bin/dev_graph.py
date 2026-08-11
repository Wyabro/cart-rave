"""Fail-closed, host-mediated planning graph for Cart Clash development cards."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

BIN_DIR = Path(__file__).resolve().parent
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))

from loop_safety import LoopSafetyError, RunArtifacts


ROOT = Path(__file__).resolve().parents[2]
GRAPH_RELATIVE_PATH = Path(".agent/graphs/dev-graph.json")
RUNTIME_RELATIVE_PATH = Path(".agent/runtime/dev-graph")
LOCK_NAME = "active.lock"
MAX_ARTIFACT_BYTES = 200_000
CARD_ID_RE = re.compile(r"^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$")
RUN_ID_RE = re.compile(r"^[0-9a-f]{32}$")
TERMINAL_KINDS = {"terminal"}


class GraphError(RuntimeError):
    """Raised when an invalid graph action must stop without mutation."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise GraphError(f"missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise GraphError(f"invalid JSON in {path}: {exc.msg}") from exc
    if not isinstance(value, dict):
        raise GraphError(f"JSON object required: {path}")
    return value


def _graph_path(root: Path) -> Path:
    return root / GRAPH_RELATIVE_PATH


def _runtime_root(root: Path) -> Path:
    return root / RUNTIME_RELATIVE_PATH


def _validate_card_id(card_id: str) -> str:
    if not CARD_ID_RE.fullmatch(card_id):
        raise GraphError("card ID must use uppercase words separated by hyphens")
    return card_id


def _validate_run_id(run_id: str) -> str:
    if not RUN_ID_RE.fullmatch(run_id):
        raise GraphError("invalid graph run ID")
    return run_id


def _validate_graph(graph: dict[str, Any]) -> None:
    if graph.get("schema_version") != 1:
        raise GraphError("unsupported graph schema version")
    if not isinstance(graph.get("name"), str) or not graph["name"]:
        raise GraphError("graph name is required")
    nodes = graph.get("nodes")
    if not isinstance(nodes, dict) or not nodes:
        raise GraphError("graph nodes are required")

    terminal_count = 0
    for name, node in nodes.items():
        if not isinstance(name, str) or not name:
            raise GraphError("graph node names must be non-empty strings")
        if not isinstance(node, dict) or set(node) - {"kind", "events"}:
            raise GraphError(f"node {name} has unsupported fields")
        kind = node.get("kind")
        events = node.get("events")
        if kind not in {"deterministic", "host", "human", "terminal"}:
            raise GraphError(f"node {name} has an invalid kind")
        if not isinstance(events, dict) or any(
            not isinstance(event, str) or not isinstance(target, str)
            for event, target in events.items()
        ):
            raise GraphError(f"node {name} must map event names to node names")
        if kind in TERMINAL_KINDS:
            terminal_count += 1
            if events:
                raise GraphError(f"terminal node {name} cannot have events")
        elif not events:
            raise GraphError(f"non-terminal node {name} must have events")
        for target in events.values():
            if target not in nodes:
                raise GraphError(f"node {name} points to unknown node {target}")
    if terminal_count == 0:
        raise GraphError("graph must have at least one terminal node")
    if "preflight" not in nodes:
        raise GraphError("graph must define a preflight node")


def _load_graph(root: Path) -> dict[str, Any]:
    graph = _load_json(_graph_path(root))
    _validate_graph(graph)
    return graph


def _git_output(root: Path, *arguments: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(root), *arguments],
        capture_output=True,
        check=False,
        encoding="utf-8",
        errors="replace",
        text=True,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        raise GraphError(f"git preflight failed: {detail or 'unknown error'}")
    return completed.stdout


def _clean_base_head(root: Path) -> str:
    base_head = _git_output(root, "rev-parse", "HEAD").strip()
    if not re.fullmatch(r"[0-9a-f]{40}", base_head):
        raise GraphError("git preflight did not return a full HEAD ID")
    dirty = _git_output(root, "status", "--porcelain=v1", "--untracked-files=all")
    if dirty.strip():
        raise GraphError("graph runs require a clean worktree")
    return base_head


def _lock_path(root: Path) -> Path:
    return _runtime_root(root) / LOCK_NAME


def _run_dir(root: Path, run_id: str) -> Path:
    return _artifacts(root, run_id).run_dir


def _artifacts(root: Path, run_id: str) -> RunArtifacts:
    try:
        return RunArtifacts(root, RUNTIME_RELATIVE_PATH, _validate_run_id(run_id))
    except LoopSafetyError as exc:
        raise GraphError(str(exc)) from exc


def _state_path(root: Path, run_id: str) -> Path:
    return _artifacts(root, run_id).path("state.json")


def _read_lock(root: Path) -> dict[str, Any]:
    return _load_json(_lock_path(root))


def _acquire_lock(root: Path, run_id: str) -> None:
    path = _lock_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"run_id": run_id, "pid": os.getpid(), "created_at": _utc_now()}
    try:
        descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as exc:
        try:
            existing = _read_lock(root)
            existing_run = existing.get("run_id", "unknown")
        except GraphError:
            existing_run = "invalid-lock"
        raise GraphError(f"an active graph lock exists for {existing_run}") from exc
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
    except Exception:
        path.unlink(missing_ok=True)
        raise


def _release_lock(root: Path, run_id: str) -> None:
    path = _lock_path(root)
    if not path.exists():
        return
    lock = _read_lock(root)
    if lock.get("run_id") != run_id:
        raise GraphError("active graph lock belongs to a different run")
    path.unlink()


def _pid_is_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def recover_stale_lock(root: Path, run_id: str) -> None:
    run_id = _validate_run_id(run_id)
    lock = _read_lock(root)
    if lock.get("run_id") != run_id:
        raise GraphError("lock run ID does not match the requested recovery run")
    pid = lock.get("pid")
    if not isinstance(pid, int):
        raise GraphError("lock has no valid process ID; inspect it before removal")
    if _pid_is_alive(pid):
        raise GraphError("lock owner is still running")
    _lock_path(root).unlink()


def _read_state(root: Path, run_id: str) -> dict[str, Any]:
    state = _load_json(_state_path(root, run_id))
    if state.get("run_id") != run_id:
        raise GraphError("state run ID does not match its directory")
    return state


def _write_state(root: Path, run_id: str, state: dict[str, Any]) -> None:
    state["updated_at"] = _utc_now()
    _artifacts(root, run_id).write_json("state.json", state)


def _transition(
    root: Path,
    graph: dict[str, Any],
    state: dict[str, Any],
    event: str,
) -> dict[str, Any]:
    nodes = graph["nodes"]
    source = state["node"]
    target = nodes[source]["events"].get(event)
    if target is None:
        raise GraphError(f"event {event} is invalid while the graph is at {source}")
    state["node"] = target
    state["history"].append(
        {"at": _utc_now(), "event": event, "from": source, "to": target}
    )
    if nodes[target]["kind"] in TERMINAL_KINDS:
        state["status"] = target
    return state


def _artifact_bytes(value: str) -> bytes:
    encoded = value.encode("utf-8")
    if not encoded.strip():
        raise GraphError("artifact content is required")
    if len(encoded) > MAX_ARTIFACT_BYTES:
        raise GraphError(f"artifact exceeds the {MAX_ARTIFACT_BYTES}-byte limit")
    return encoded


def _artifact_sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def start(root: Path, card_id: str) -> dict[str, Any]:
    card_id = _validate_card_id(card_id)
    graph = _load_graph(root)
    base_head = _clean_base_head(root)
    run_id = uuid4().hex
    _acquire_lock(root, run_id)
    try:
        state = {
            "schema_version": 1,
            "graph_name": graph["name"],
            "run_id": run_id,
            "card_id": card_id,
            "base_head": base_head,
            "node": "preflight",
            "status": "running",
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
            "artifacts": {},
            "history": [],
        }
        _transition(root, graph, state, "preflight_pass")
        _write_state(root, run_id, state)
        return state
    except Exception:
        _release_lock(root, run_id)
        raise


def submit_plan(root: Path, run_id: str, content: str) -> dict[str, Any]:
    run_id = _validate_run_id(run_id)
    graph = _load_graph(root)
    state = _read_state(root, run_id)
    if state["node"] != "await_plan":
        raise GraphError("a plan is not expected at this graph node")
    artifact = _artifact_bytes(content)
    digest = _artifact_sha256(artifact)
    _artifacts(root, run_id).write_text("plan.md", artifact.decode("utf-8"))
    state["artifacts"]["plan"] = {"file": "plan.md", "sha256": digest}
    _transition(root, graph, state, "submit_plan")
    _write_state(root, run_id, state)
    return state


def submit_review(root: Path, run_id: str, content: str) -> dict[str, Any]:
    run_id = _validate_run_id(run_id)
    graph = _load_graph(root)
    state = _read_state(root, run_id)
    if state["node"] != "await_review":
        raise GraphError("a review is not expected at this graph node")
    artifact = _artifact_bytes(content)
    try:
        review = json.loads(artifact.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise GraphError(f"review artifact is not valid JSON: {exc.msg}") from exc
    if not isinstance(review, dict):
        raise GraphError("review artifact must be a JSON object")
    expected_keys = {
        "schema_version",
        "card_id",
        "graph_run_id",
        "plan_sha256",
        "verdict",
        "findings",
    }
    if set(review) != expected_keys:
        raise GraphError("review artifact has missing or unsupported fields")
    if review["schema_version"] != 1:
        raise GraphError("unsupported review artifact schema version")
    if review["card_id"] != state["card_id"] or review["graph_run_id"] != run_id:
        raise GraphError("review artifact does not belong to this graph run")
    plan = state["artifacts"].get("plan")
    if not isinstance(plan, dict) or review["plan_sha256"] != plan.get("sha256"):
        raise GraphError("review artifact does not bind to the accepted plan")
    if review["verdict"] not in {"APPROVE", "REJECT", "ESCALATE"}:
        raise GraphError("review verdict must be APPROVE, REJECT, or ESCALATE")
    findings = review["findings"]
    if not isinstance(findings, list) or any(not isinstance(item, str) for item in findings):
        raise GraphError("review findings must be a list of strings")
    if review["verdict"] != "APPROVE" and not findings:
        raise GraphError("rejected or escalated reviews must include findings")

    _artifacts(root, run_id).write_json("review.json", review)
    state["artifacts"]["review"] = {
        "file": "review.json",
        "sha256": _artifact_sha256(
            json.dumps(review, indent=2, sort_keys=True).encode("utf-8") + b"\n"
        ),
    }
    event = f"review_{review['verdict'].lower()}"
    _transition(root, graph, state, event)
    _write_state(root, run_id, state)
    if state["status"] != "running":
        _release_lock(root, run_id)
    return state


def acknowledge(root: Path, run_id: str, acknowledgement: str) -> dict[str, Any]:
    run_id = _validate_run_id(run_id)
    graph = _load_graph(root)
    state = _read_state(root, run_id)
    if state["node"] != "await_ack":
        raise GraphError("human acknowledgement is not expected at this graph node")
    expected = f"ack {state['card_id']}"
    if acknowledgement.strip().casefold() != expected.casefold():
        raise GraphError(f"acknowledgement must be exactly: {expected}")
    _transition(root, graph, state, "human_ack")
    _write_state(root, run_id, state)
    _release_lock(root, run_id)
    return state


def _print_state(state: dict[str, Any]) -> None:
    print(json.dumps(state, indent=2, sort_keys=True))


def _stdin() -> str:
    return sys.stdin.read()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help=argparse.SUPPRESS)
    subparsers = parser.add_subparsers(dest="command", required=True)

    start_parser = subparsers.add_parser("start")
    start_parser.add_argument("--card-id", required=True)

    plan_parser = subparsers.add_parser("submit-plan")
    plan_parser.add_argument("--run-id", required=True)

    review_parser = subparsers.add_parser("submit-review")
    review_parser.add_argument("--run-id", required=True)

    ack_parser = subparsers.add_parser("ack")
    ack_parser.add_argument("--run-id", required=True)
    ack_parser.add_argument("--text", required=True)

    status_parser = subparsers.add_parser("status")
    status_parser.add_argument("--run-id", required=True)

    recover_parser = subparsers.add_parser("recover-stale-lock")
    recover_parser.add_argument("--run-id", required=True)

    args = parser.parse_args(argv)
    root = args.root.resolve()
    try:
        if args.command == "start":
            _print_state(start(root, args.card_id))
        elif args.command == "submit-plan":
            _print_state(submit_plan(root, args.run_id, _stdin()))
        elif args.command == "submit-review":
            _print_state(submit_review(root, args.run_id, _stdin()))
        elif args.command == "ack":
            _print_state(acknowledge(root, args.run_id, args.text))
        elif args.command == "status":
            _print_state(_read_state(root, _validate_run_id(args.run_id)))
        elif args.command == "recover-stale-lock":
            recover_stale_lock(root, args.run_id)
        return 0
    except GraphError as exc:
        print(f"dev-graph: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
