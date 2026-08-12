"""Fail-closed, host-mediated planning graph for Cart Clash development cards."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
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
MAKER_ARTIFACT_NAMESPACE = Path(".agent/self-improving/runs")
LOCK_NAME = "active.lock"
MAX_ARTIFACT_BYTES = 200_000
MAKER_MAX_TURNS = 24
MAKER_REQUEST_TIMEOUT_SECONDS = 90
MAKER_RUN_TIMEOUT_SECONDS = 900
MAKER_PROCESS_TIMEOUT_SECONDS = MAKER_RUN_TIMEOUT_SECONDS + 5
REVIEWER_ID = "gpt-5.6-luna"
REVIEWER_REASONING_EFFORT = "high"
REVIEW_TIMEOUT_SECONDS = 900
CARD_ID_RE = re.compile(r"^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$")
RUN_ID_RE = re.compile(r"^[0-9a-f]{32}$")
TERMINAL_KINDS = {"terminal"}


class GraphError(RuntimeError):
    """Raised when an invalid graph action must stop without mutation."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now() -> str:
    return _now().isoformat(timespec="seconds")


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
    if graph.get("schema_version") != 2:
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


def _clean_preflight(root: Path) -> tuple[str, str]:
    base_head = _git_output(root, "rev-parse", "HEAD").strip()
    if not re.fullmatch(r"[0-9a-f]{40}", base_head):
        raise GraphError("git preflight did not return a full HEAD ID")
    dirty = _git_output(root, "status", "--porcelain=v1", "--untracked-files=all")
    if dirty.strip():
        raise GraphError("graph runs require a clean worktree")
    return base_head, dirty


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
    payload = {"schema_version": 2, "run_id": run_id, "created_at": _utc_now()}
    try:
        with path.open("x", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
    except FileExistsError as exc:
        try:
            existing = _read_lock(root)
            existing_run = existing.get("run_id", "unknown")
        except GraphError:
            existing_run = "invalid-lock"
        raise GraphError(f"an active graph lock exists for {existing_run}") from exc


def _assert_lock_owner(root: Path, run_id: str) -> None:
    lock = _read_lock(root)
    if set(lock) != {"schema_version", "run_id", "created_at"}:
        raise GraphError("active graph lock has an unsupported shape")
    if lock.get("schema_version") != 2 or lock.get("run_id") != run_id:
        raise GraphError("active graph lock belongs to a different run")
    if not isinstance(lock.get("created_at"), str) or not lock["created_at"]:
        raise GraphError("active graph lock has no creation timestamp")


def _release_lock(root: Path, run_id: str) -> None:
    path = _lock_path(root)
    if not path.exists():
        return
    _assert_lock_owner(root, run_id)
    path.unlink()


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


def _json_bytes(value: dict[str, Any]) -> bytes:
    return json.dumps(value, indent=2, sort_keys=True).encode("utf-8") + b"\n"


def _parse_utc_timestamp(value: object, field: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise GraphError(f"{field} must be a UTC timestamp")
    try:
        timestamp = datetime.fromisoformat(value)
    except ValueError as exc:
        raise GraphError(f"{field} must be a valid UTC timestamp") from exc
    if timestamp.tzinfo is None:
        raise GraphError(f"{field} must include a UTC offset")
    return timestamp.astimezone(timezone.utc)


def _assert_preflight_matches(root: Path, state: dict[str, Any]) -> None:
    base_head = _git_output(root, "rev-parse", "HEAD").strip()
    if base_head != state.get("base_head"):
        raise GraphError("base HEAD changed during the graph run")
    baseline = state.get("artifacts", {}).get("baseline")
    if not isinstance(baseline, dict) or baseline.get("file") != "baseline.json":
        raise GraphError("graph state has no valid baseline artifact")
    dirty = _git_output(root, "status", "--porcelain=v1", "--untracked-files=all")
    if _artifact_sha256(dirty.encode("utf-8")) != baseline.get("git_status_sha256"):
        raise GraphError("worktree baseline changed during the graph run")


def _review_request_id(graph_run_id: str) -> str:
    return f"luna-{_validate_run_id(graph_run_id)}"


def _write_review_request(root: Path, state: dict[str, Any]) -> tuple[dict[str, Any], str]:
    artifacts = _artifacts(root, state["run_id"])
    maker = state["artifacts"].get("maker")
    plan = state["artifacts"].get("plan")
    baseline = state["artifacts"].get("baseline")
    brief = state["artifacts"].get("brief")
    if not all(isinstance(value, dict) for value in (maker, plan, baseline, brief)):
        raise GraphError("graph state has no complete maker receipt inputs")
    maker_result_sha256 = maker.get("result_sha256")
    if not isinstance(maker_result_sha256, str):
        raise GraphError("maker receipt has no result digest")
    created_at = _now()
    request = {
        "schema_version": 1,
        "card_id": state["card_id"],
        "graph_run_id": state["run_id"],
        "base_head": state["base_head"],
        "baseline_sha256": baseline.get("sha256"),
        "brief_sha256": brief.get("sha256"),
        "maker_receipt_sha256": maker.get("sha256"),
        "maker_run_id": maker.get("run_id"),
        "maker_result_sha256": maker_result_sha256,
        "plan_sha256": plan.get("sha256"),
        "review_request_id": _review_request_id(state["run_id"]),
        "reviewer": {
            "id": REVIEWER_ID,
            "reasoning_effort": REVIEWER_REASONING_EFFORT,
            "read_only": True,
        },
        "created_at": created_at.isoformat(timespec="seconds"),
        "deadline_at": (created_at + timedelta(seconds=REVIEW_TIMEOUT_SECONDS)).isoformat(
            timespec="seconds"
        ),
        "timeout_seconds": REVIEW_TIMEOUT_SECONDS,
    }
    artifacts.write_json("review-request.json", request)
    return request, _artifact_sha256(artifacts.path("review-request.json").read_bytes())


def _read_review_request(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    metadata = state["artifacts"].get("review_request")
    if not isinstance(metadata, dict):
        raise GraphError("graph state has no review request")
    if metadata.get("file") != "review-request.json":
        raise GraphError("graph state has an invalid review request path")
    artifacts = _artifacts(root, state["run_id"])
    raw = artifacts.path("review-request.json").read_bytes()
    if _artifact_sha256(raw) != metadata.get("sha256"):
        raise GraphError("review request artifact does not match graph state")
    try:
        request = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise GraphError("review request is not valid UTF-8 JSON") from exc
    if not isinstance(request, dict):
        raise GraphError("review request must be a JSON object")
    expected_keys = {
        "schema_version",
        "card_id",
        "graph_run_id",
        "base_head",
        "baseline_sha256",
        "brief_sha256",
        "maker_receipt_sha256",
        "maker_run_id",
        "maker_result_sha256",
        "plan_sha256",
        "review_request_id",
        "reviewer",
        "created_at",
        "deadline_at",
        "timeout_seconds",
    }
    if set(request) != expected_keys or request["schema_version"] != 1:
        raise GraphError("review request has an unsupported schema")
    maker = state["artifacts"].get("maker")
    plan = state["artifacts"].get("plan")
    baseline = state["artifacts"].get("baseline")
    brief = state["artifacts"].get("brief")
    expected_values = {
        "card_id": state["card_id"],
        "graph_run_id": state["run_id"],
        "base_head": state["base_head"],
        "baseline_sha256": baseline.get("sha256") if isinstance(baseline, dict) else None,
        "brief_sha256": brief.get("sha256") if isinstance(brief, dict) else None,
        "maker_receipt_sha256": maker.get("sha256") if isinstance(maker, dict) else None,
        "maker_run_id": maker.get("run_id") if isinstance(maker, dict) else None,
        "maker_result_sha256": maker.get("result_sha256") if isinstance(maker, dict) else None,
        "plan_sha256": plan.get("sha256") if isinstance(plan, dict) else None,
        "review_request_id": _review_request_id(state["run_id"]),
    }
    if any(request[key] != value for key, value in expected_values.items()):
        raise GraphError("review request does not bind to the accepted maker receipt")
    if request["reviewer"] != {
        "id": REVIEWER_ID,
        "reasoning_effort": REVIEWER_REASONING_EFFORT,
        "read_only": True,
    } or request["timeout_seconds"] != REVIEW_TIMEOUT_SECONDS:
        raise GraphError("review request has an unsupported reviewer contract")
    created_at = _parse_utc_timestamp(request["created_at"], "review request created_at")
    deadline_at = _parse_utc_timestamp(request["deadline_at"], "review request deadline_at")
    if deadline_at != created_at + timedelta(seconds=REVIEW_TIMEOUT_SECONDS):
        raise GraphError("review request has an invalid deadline")
    if _now() > deadline_at:
        raise GraphError("review request deadline expired")
    return request


def start(root: Path, card_id: str, brief_content: str) -> dict[str, Any]:
    card_id = _validate_card_id(card_id)
    graph = _load_graph(root)
    brief = _artifact_bytes(brief_content)
    base_head, dirty = _clean_preflight(root)
    run_id = uuid4().hex
    _acquire_lock(root, run_id)
    try:
        artifacts = _artifacts(root, run_id)
        artifacts.write_text("brief.md", brief.decode("utf-8"))
        baseline = {
            "schema_version": 1,
            "base_head": base_head,
            "git_status_porcelain_v1": dirty,
            "git_status_sha256": _artifact_sha256(dirty.encode("utf-8")),
        }
        artifacts.write_json("baseline.json", baseline)
        state = {
            "schema_version": 2,
            "graph_name": graph["name"],
            "run_id": run_id,
            "card_id": card_id,
            "base_head": base_head,
            "node": "preflight",
            "status": "running",
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
            "artifacts": {
                "brief": {"file": "brief.md", "sha256": _artifact_sha256(brief)},
                "baseline": {
                    "file": "baseline.json",
                    "sha256": _artifact_sha256(_json_bytes(baseline)),
                    "git_status_sha256": baseline["git_status_sha256"],
                },
            },
            "history": [],
        }
        _transition(root, graph, state, "preflight_pass")
        _write_state(root, run_id, state)
        return state
    except Exception:
        _release_lock(root, run_id)
        raise


def _maker_run_id(graph_run_id: str) -> str:
    return f"maker-{_validate_run_id(graph_run_id)}"


def _maker_command(root: Path, state: dict[str, Any]) -> list[str]:
    run_id = _validate_run_id(str(state["run_id"]))
    brief_path = _run_dir(root, run_id) / "brief.md"
    brief_relative = brief_path.relative_to(root).as_posix()
    prompt = "\n".join(
        [
            f"Read the immutable graph brief at {brief_relative}.",
            f"Produce the plan-only maker result for card {state['card_id']}.",
            "Do not modify files. Return only an implementation-ready plan and missing evidence.",
        ]
    )
    return [
        sys.executable,
        str(root / ".agent" / "bin" / "deepseek_agent.py"),
        "--role",
        "maker",
        "--plan-only",
        "--max-turns",
        str(MAKER_MAX_TURNS),
        "--request-timeout-seconds",
        str(MAKER_REQUEST_TIMEOUT_SECONDS),
        "--run-timeout-seconds",
        str(MAKER_RUN_TIMEOUT_SECONDS),
        "--run-id",
        _maker_run_id(run_id),
        prompt,
    ]


def _read_maker_receipt_inputs(root: Path, state: dict[str, Any]) -> tuple[dict[str, Any], bytes, bytes]:
    graph_run_id = _validate_run_id(str(state["run_id"]))
    maker_run_id = _maker_run_id(graph_run_id)
    maker_artifacts = RunArtifacts(root, MAKER_ARTIFACT_NAMESPACE, maker_run_id)
    runner_state_path = maker_artifacts.path("run-state.json")
    result_path = maker_artifacts.path("run-result.md")
    runner_state_bytes = runner_state_path.read_bytes()
    result_bytes = result_path.read_bytes()
    if len(runner_state_bytes) > MAX_ARTIFACT_BYTES or len(result_bytes) > MAX_ARTIFACT_BYTES:
        raise GraphError("maker artifact exceeds the graph size limit")
    try:
        runner_state = json.loads(runner_state_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise GraphError("maker run-state is not valid UTF-8 JSON") from exc
    if not isinstance(runner_state, dict):
        raise GraphError("maker run-state must be a JSON object")
    expected_paths = {
        "run_state": f".agent/self-improving/runs/{maker_run_id}/run-state.json",
        "run_result": f".agent/self-improving/runs/{maker_run_id}/run-result.md",
    }
    if (
        runner_state.get("run_id") != maker_run_id
        or runner_state.get("role") != "maker"
        or runner_state.get("mode") != "plan-only"
        or runner_state.get("status") != "completed"
        or runner_state.get("event") != "completed"
        or runner_state.get("artifacts") != expected_paths
        or runner_state.get("tool_error_count") != 0
    ):
        raise GraphError("maker checkpoint does not satisfy the fixed plan-only contract")
    try:
        result_text = result_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise GraphError("maker result is not valid UTF-8") from exc
    result_lines = result_text.splitlines()
    if not result_lines or result_lines[0] != f"# DeepSeek run {maker_run_id}":
        raise GraphError("maker result does not carry the expected run identity")
    if not "\n".join(result_lines[1:]).strip():
        raise GraphError("maker result has no plan content")
    return runner_state, runner_state_bytes, result_bytes


def _block_maker(root: Path, graph: dict[str, Any], state: dict[str, Any], reason: str) -> dict[str, Any]:
    state["failure"] = {"stage": "maker", "reason": reason}
    _transition(root, graph, state, "maker_fail")
    _write_state(root, state["run_id"], state)
    _release_lock(root, state["run_id"])
    return state


def run_maker(root: Path, run_id: str) -> dict[str, Any]:
    run_id = _validate_run_id(run_id)
    graph = _load_graph(root)
    state = _read_state(root, run_id)
    if state["node"] != "await_maker":
        raise GraphError("a maker run is not expected at this graph node")
    _assert_lock_owner(root, run_id)
    try:
        _assert_preflight_matches(root, state)
        maker_artifacts = RunArtifacts(
            root,
            MAKER_ARTIFACT_NAMESPACE,
            _maker_run_id(run_id),
        )
        if maker_artifacts.run_dir.exists():
            raise GraphError("maker artifact directory already exists for this graph run")
        completed = subprocess.run(
            _maker_command(root, state),
            cwd=root,
            capture_output=True,
            check=False,
            encoding="utf-8",
            errors="replace",
            text=True,
            timeout=MAKER_PROCESS_TIMEOUT_SECONDS,
            shell=False,
        )
        if completed.returncode != 0:
            raise GraphError(f"maker process failed with exit code {completed.returncode}")
        runner_state, runner_state_bytes, result_bytes = _read_maker_receipt_inputs(root, state)
        _assert_preflight_matches(root, state)
        artifacts = _artifacts(root, run_id)
        artifacts.write_text("plan.md", result_bytes.decode("utf-8"))
        plan_sha256 = _artifact_sha256(artifacts.path("plan.md").read_bytes())
        receipt = {
            "schema_version": 1,
            "card_id": state["card_id"],
            "graph_run_id": run_id,
            "base_head": state["base_head"],
            "baseline_sha256": state["artifacts"]["baseline"]["sha256"],
            "brief_sha256": state["artifacts"]["brief"]["sha256"],
            "maker_run_id": runner_state["run_id"],
            "maker_state_sha256": _artifact_sha256(runner_state_bytes),
            "maker_result_sha256": _artifact_sha256(result_bytes),
            "plan_sha256": plan_sha256,
            "role": runner_state["role"],
            "mode": runner_state["mode"],
            "status": runner_state["status"],
            "tool_error_count": runner_state["tool_error_count"],
        }
        artifacts.write_json("maker-receipt.json", receipt)
        state["artifacts"]["plan"] = {"file": "plan.md", "sha256": plan_sha256}
        state["artifacts"]["maker"] = {
            "file": "maker-receipt.json",
            "sha256": _artifact_sha256(artifacts.path("maker-receipt.json").read_bytes()),
            "run_id": receipt["maker_run_id"],
            "result_sha256": receipt["maker_result_sha256"],
        }
        review_request, review_request_sha256 = _write_review_request(root, state)
        state["artifacts"]["review_request"] = {
            "file": "review-request.json",
            "sha256": review_request_sha256,
            "request_id": review_request["review_request_id"],
        }
        _transition(root, graph, state, "maker_complete")
        _write_state(root, run_id, state)
    except (GraphError, OSError, subprocess.TimeoutExpired) as exc:
        return _block_maker(root, graph, state, str(exc))
    return state


def _block_review(root: Path, graph: dict[str, Any], state: dict[str, Any], reason: str) -> dict[str, Any]:
    state["failure"] = {"stage": "review", "reason": reason}
    _transition(root, graph, state, "review_fail")
    _write_state(root, state["run_id"], state)
    _release_lock(root, state["run_id"])
    return state


def submit_review(root: Path, run_id: str, content: str) -> dict[str, Any]:
    run_id = _validate_run_id(run_id)
    graph = _load_graph(root)
    state = _read_state(root, run_id)
    if state["node"] != "await_review":
        raise GraphError("a review is not expected at this graph node")
    _assert_lock_owner(root, run_id)
    try:
        _assert_preflight_matches(root, state)
        request = _read_review_request(root, state)
        artifact = _artifact_bytes(content)
        review = json.loads(artifact.decode("utf-8"))
    except (GraphError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        return _block_review(root, graph, state, str(exc))
    if not isinstance(review, dict):
        return _block_review(root, graph, state, "review artifact must be a JSON object")
    expected_keys = {
        "schema_version",
        "card_id",
        "graph_run_id",
        "base_head",
        "baseline_sha256",
        "brief_sha256",
        "maker_receipt_sha256",
        "maker_run_id",
        "maker_result_sha256",
        "plan_sha256",
        "review_request_id",
        "reviewer_id",
        "reasoning_effort",
        "reviewed_at",
        "verdict",
        "findings",
    }
    if set(review) != expected_keys:
        return _block_review(root, graph, state, "review artifact has missing or unsupported fields")
    expected_values = {
        "schema_version": 1,
        "card_id": state["card_id"],
        "graph_run_id": run_id,
        "base_head": state["base_head"],
        "baseline_sha256": request["baseline_sha256"],
        "brief_sha256": request["brief_sha256"],
        "maker_receipt_sha256": request["maker_receipt_sha256"],
        "maker_run_id": request["maker_run_id"],
        "maker_result_sha256": request["maker_result_sha256"],
        "plan_sha256": request["plan_sha256"],
        "review_request_id": request["review_request_id"],
        "reviewer_id": REVIEWER_ID,
        "reasoning_effort": REVIEWER_REASONING_EFFORT,
    }
    if any(review[key] != value for key, value in expected_values.items()):
        return _block_review(root, graph, state, "review artifact does not bind to the graph receipt")
    try:
        reviewed_at = _parse_utc_timestamp(review["reviewed_at"], "reviewed_at")
        created_at = _parse_utc_timestamp(request["created_at"], "review request created_at")
        deadline_at = _parse_utc_timestamp(request["deadline_at"], "review request deadline_at")
    except GraphError as exc:
        return _block_review(root, graph, state, str(exc))
    if reviewed_at < created_at or reviewed_at > deadline_at:
        return _block_review(root, graph, state, "reviewed_at is outside the review request window")
    if review["verdict"] not in {"APPROVE", "REJECT", "ESCALATE"}:
        return _block_review(root, graph, state, "review verdict must be APPROVE, REJECT, or ESCALATE")
    findings = review["findings"]
    if not isinstance(findings, list) or any(
        not isinstance(item, str) or not item.strip() for item in findings
    ):
        return _block_review(root, graph, state, "review findings must be non-empty strings")
    if review["verdict"] != "APPROVE" and not findings:
        return _block_review(root, graph, state, "rejected or escalated reviews must include findings")

    artifacts = _artifacts(root, run_id)
    artifacts.write_json("review.json", review)
    state["artifacts"]["review"] = {
        "file": "review.json",
        "sha256": _artifact_sha256(artifacts.path("review.json").read_bytes()),
    }
    event = f"review_{review['verdict'].lower()}"
    _transition(root, graph, state, event)
    _write_state(root, run_id, state)
    if state["status"] != "running":
        _release_lock(root, run_id)
    return state


def fail_review(root: Path, run_id: str, reason: str) -> dict[str, Any]:
    run_id = _validate_run_id(run_id)
    graph = _load_graph(root)
    state = _read_state(root, run_id)
    if state["node"] != "await_review":
        raise GraphError("a review failure is not expected at this graph node")
    _assert_lock_owner(root, run_id)
    failure_reason = reason.strip()
    if not failure_reason or len(failure_reason.encode("utf-8")) > MAX_ARTIFACT_BYTES:
        raise GraphError("review failure reason is required and must fit the artifact limit")
    try:
        _read_review_request(root, state)
    except GraphError as exc:
        failure_reason = f"{failure_reason}: {exc}"
    return _block_review(root, graph, state, failure_reason)


def _block_ack(root: Path, graph: dict[str, Any], state: dict[str, Any], reason: str) -> dict[str, Any]:
    state["failure"] = {"stage": "ack", "reason": reason}
    _transition(root, graph, state, "ack_fail")
    _write_state(root, state["run_id"], state)
    _release_lock(root, state["run_id"])
    return state


def acknowledge(root: Path, run_id: str, acknowledgement: str) -> dict[str, Any]:
    run_id = _validate_run_id(run_id)
    graph = _load_graph(root)
    state = _read_state(root, run_id)
    if state["node"] != "await_ack":
        raise GraphError("human acknowledgement is not expected at this graph node")
    _assert_lock_owner(root, run_id)
    try:
        _assert_preflight_matches(root, state)
    except GraphError as exc:
        return _block_ack(root, graph, state, str(exc))
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

    maker_parser = subparsers.add_parser("run-maker")
    maker_parser.add_argument("--run-id", required=True)

    review_parser = subparsers.add_parser("submit-review")
    review_parser.add_argument("--run-id", required=True)

    review_failure_parser = subparsers.add_parser("fail-review")
    review_failure_parser.add_argument("--run-id", required=True)
    review_failure_parser.add_argument("--reason", required=True)

    ack_parser = subparsers.add_parser("ack")
    ack_parser.add_argument("--run-id", required=True)
    ack_parser.add_argument("--text", required=True)

    status_parser = subparsers.add_parser("status")
    status_parser.add_argument("--run-id", required=True)

    args = parser.parse_args(argv)
    root = args.root.resolve()
    try:
        if args.command == "start":
            _print_state(start(root, args.card_id, _stdin()))
        elif args.command == "run-maker":
            _print_state(run_maker(root, args.run_id))
        elif args.command == "submit-review":
            _print_state(submit_review(root, args.run_id, _stdin()))
        elif args.command == "fail-review":
            _print_state(fail_review(root, args.run_id, args.reason))
        elif args.command == "ack":
            _print_state(acknowledge(root, args.run_id, args.text))
        elif args.command == "status":
            _print_state(_read_state(root, _validate_run_id(args.run_id)))
        return 0
    except GraphError as exc:
        print(f"dev-graph: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
