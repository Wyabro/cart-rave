"""Bounded OpenAI-compatible agent for the Cart Clash agentic loop."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
import re
import subprocess
import sys
import time
from uuid import uuid4
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path.cwd().resolve()
MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash")
ENDPOINT = os.environ.get(
    "DEEPSEEK_PROXY_URL",
    "http://127.0.0.1:9000/v1/chat/completions",
).rstrip("/")
RUN_RESULT = ROOT / ".agent" / "self-improving" / "run-result.md"
RUN_STATE = ROOT / ".agent" / "self-improving" / "run-state.json"
MAX_TURNS = 24
MAX_TOOL_OUTPUT = 30_000
MAX_FILE_OUTPUT = 80_000
MAX_COMMAND_SECONDS = 60
MODEL_REQUEST_TIMEOUT_SECONDS = 90
RUN_TIMEOUT_SECONDS = 900

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def _clip(value: object, limit: int = MAX_TOOL_OUTPUT) -> str:
    text = str(value)
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n... output clipped at {limit} characters ..."


def _save_run_result(value: object, *, run_id: str) -> None:
    RUN_RESULT.parent.mkdir(parents=True, exist_ok=True)
    RUN_RESULT.write_text(
        f"# DeepSeek run {run_id}\n\n{str(value).rstrip()}\n",
        encoding="utf-8",
    )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _write_json_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    temp_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(path)


def _write_checkpoint(
    path: Path,
    *,
    run_id: str,
    role: str,
    mode: str,
    status: str,
    event: str,
    turn: int,
    started_at: str,
    error: str | None = None,
) -> dict:
    payload = {
        "run_id": run_id,
        "role": role,
        "mode": mode,
        "status": status,
        "event": event,
        "turn": turn,
        "started_at": started_at,
        "updated_at": _utc_now(),
    }
    if error:
        payload["error"] = error
    _write_json_atomic(path, payload)
    return payload


def _tool_definitions_for(role: str, *, plan_only: bool) -> list[dict]:
    if role == "checker" or plan_only:
        return [
            tool
            for tool in TOOL_DEFINITIONS
            if tool["function"]["name"] != "write_file"
        ]
    return TOOL_DEFINITIONS


def _run_id() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{stamp}-{uuid4().hex[:10]}"


def _safe_path(raw_path: str, *, allow_missing: bool = False) -> Path:
    candidate = Path(raw_path or ".")
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    resolved = candidate.resolve(strict=False)
    try:
        relative = resolved.relative_to(ROOT)
    except ValueError as exc:
        raise ValueError("path must stay inside the loop worktree") from exc
    if ".git" in {part.lower() for part in relative.parts}:
        raise ValueError(".git paths are not agent-editable")
    if not allow_missing and not resolved.exists():
        raise FileNotFoundError(str(relative))
    return resolved


def _sensitive_path(path: Path) -> bool:
    name = path.name.lower()
    return (
        name == ".env"
        or name.startswith(".env.")
        or name.endswith((".pem", ".key", ".p12", ".pfx"))
        or name in {"id_rsa", "credentials.json", "secrets.json"}
    )


def _read_file(args: dict) -> str:
    path = _safe_path(str(args.get("path", "")))
    if _sensitive_path(path):
        raise PermissionError("secret-like files are not readable by the loop")
    if not path.is_file():
        raise ValueError("path is not a file")
    return _clip(path.read_text(encoding="utf-8"), MAX_FILE_OUTPUT)


def _list_files(args: dict) -> str:
    path = _safe_path(str(args.get("path", ".")))
    depth = max(0, min(int(args.get("depth", 2)), 5))
    if path.is_file():
        return str(path.relative_to(ROOT))
    results: list[str] = []
    base_depth = len(path.relative_to(ROOT).parts)
    for entry in sorted(path.rglob("*")):
        if not entry.is_file() or _sensitive_path(entry):
            continue
        if len(entry.relative_to(ROOT).parts) - base_depth > depth:
            continue
        results.append(str(entry.relative_to(ROOT)))
        if len(results) >= 500:
            break
    return "\n".join(results) or "(no files)"


_DENIED_COMMANDS = (
    r"\bgit\s+(commit|push|reset|clean|checkout|restore)\b",
    r"\bnpm\s+run\s+(ship|deploy)\b",
    r"\b(remove-item|del\s|erase\s|rmdir\s|format\s|rm\s+-)\b",
    r"\b(powershell|pwsh)\b.*\b(remove-item|del\s|erase\s|rmdir\s)\b",
)


def _run_command(args: dict) -> str:
    command = str(args.get("command", "")).strip()
    if not command:
        raise ValueError("command is required")
    lowered = command.lower()
    if any(re.search(pattern, lowered) for pattern in _DENIED_COMMANDS):
        raise PermissionError("staging, commits, pushes, deploys, and deletes are blocked")
    requested_timeout = float(args.get("timeout_seconds", 60))
    timeout = max(1, min(int(requested_timeout), MAX_COMMAND_SECONDS))
    completed = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )
    output = (completed.stdout or "") + ("\n" + completed.stderr if completed.stderr else "")
    return _clip(f"exit_code={completed.returncode}\n{output.strip()}")


def _write_file(args: dict) -> str:
    path = _safe_path(str(args.get("path", "")), allow_missing=True)
    relative = path.relative_to(ROOT).as_posix().lower()
    if relative in {
        "agents.md",
        "docs/briefing.md",
        ".cursor/rules/cart-clash.mdc",
    }:
        raise PermissionError("project authority files are not loop-editable")
    if _sensitive_path(path):
        raise PermissionError("secret-like files are not loop-editable")
    content = args.get("content")
    if not isinstance(content, str):
        raise ValueError("content must be a string")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return f"wrote {path.relative_to(ROOT)} ({len(content)} characters)"


def _tool(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        },
    }


TOOL_DEFINITIONS = [
    _tool(
        "read_file",
        "Read a UTF-8 text file inside the current worktree.",
        {"path": {"type": "string"}},
        ["path"],
    ),
    _tool(
        "list_files",
        "List files inside the current worktree.",
        {
            "path": {"type": "string"},
            "depth": {"type": "integer", "minimum": 0, "maximum": 5},
        },
        [],
    ),
    _tool(
        "run_command",
        "Run a bounded read or test command. No deploy, commit, push, or delete commands.",
        {
            "command": {"type": "string"},
            "timeout_seconds": {"type": "number", "minimum": 1, "maximum": 120},
        },
        ["command"],
    ),
    _tool(
        "write_file",
        "Write a UTF-8 text file inside the current worktree.",
        {
            "path": {"type": "string"},
            "content": {"type": "string"},
        },
        ["path", "content"],
    ),
]


def _system_prompt(role: str, *, plan_only: bool = False) -> str:
    common = "\n".join(
        [
            f"You are the {role} for Cart Clash.",
            f"The current worktree is {ROOT}.",
            "Read docs/BRIEFING.md, AGENTS.md, and the top of docs/STATUS.md before acting.",
            "Follow AGENTS.md exactly: protect unrelated dirty work; do not deploy, push, commit, stage, or edit project authority files.",
            "Work only on the stated task. Use the smallest coherent change.",
            "Use tools for repository facts. Do not invent test results. Keep the final response short and factual.",
        ]
    )
    if role == "checker":
        return common + "\nYou are read-only. Inspect the diff and relevant files, and run safe checks when useful. Do not use write_file. Your final non-empty line MUST be exactly APPROVE, REJECT: <actionable reason>, or ESCALATE: <reason requiring human judgment>."
    if plan_only:
        return common + "\nYou are the plan-only maker. Diagnose the task and produce an implementation-ready plan. Do not modify files, stage, commit, push, deploy, or delete anything. The write_file tool is unavailable by design. Return the plan and state missing evidence."
    return common + "\nYou are the maker. Diagnose the task, make the requested change in this isolated worktree, and verify it with safe commands. Do not stop at a proposed patch: apply the change with write_file, then inspect the result."


def _call_model(
    messages: list[dict],
    tools: list[dict],
    api_key: str,
    *,
    timeout_seconds: int = MODEL_REQUEST_TIMEOUT_SECONDS,
) -> dict:
    payload = {
        "model": MODEL,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "stream": False,
    }
    request = Request(
        ENDPOINT,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if exc.code in {401, 403}:
            raise RuntimeError("DeepSeek rejected the key; set DEEPSEEK_API_KEY without printing it") from exc
        raise RuntimeError(f"DeepSeek proxy request failed with HTTP {exc.code}: {_clip(detail, 2000)}") from exc
    except URLError as exc:
        raise RuntimeError(f"DeepSeek proxy is unreachable at {ENDPOINT}: {exc.reason}") from exc


def _execute_tool(name: str, arguments: dict, role: str, *, plan_only: bool = False) -> str:
    try:
        if name == "read_file":
            return _read_file(arguments)
        if name == "list_files":
            return _list_files(arguments)
        if name == "run_command":
            return _run_command(arguments)
        if name == "write_file":
            if role != "maker" or plan_only:
                raise PermissionError("write_file is unavailable in this mode")
            return _write_file(arguments)
        raise ValueError(f"unknown tool: {name}")
    except subprocess.TimeoutExpired:
        return "tool_error: command timed out"
    except Exception as exc:
        return f"tool_error: {type(exc).__name__}: {exc}"


def _api_key() -> str | None:
    for name in ("DEEPSEEK_API_KEY", "CURSOR_DEEPSEEK_API_KEY"):
        value = os.environ.get(name)
        if value:
            return value
    if os.name != "nt":
        return None
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as key:
            for name in ("DEEPSEEK_API_KEY", "CURSOR_DEEPSEEK_API_KEY"):
                value, _ = winreg.QueryValueEx(key, name)
                if isinstance(value, str) and value:
                    return value
    except (FileNotFoundError, OSError):
        pass
    return None


def _emit(event: str, run_id: str, **fields: object) -> None:
    payload = {"event": event, "run_id": run_id, **fields}
    print(f"[loop] {json.dumps(payload, ensure_ascii=False, sort_keys=True)}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--role", choices=("maker", "checker"), required=True)
    parser.add_argument(
        "--plan-only",
        action="store_true",
        help="run the maker as a read-only planner; write_file is not exposed",
    )
    parser.add_argument("--max-turns", type=int, default=MAX_TURNS)
    parser.add_argument(
        "--request-timeout-seconds",
        type=int,
        default=MODEL_REQUEST_TIMEOUT_SECONDS,
    )
    parser.add_argument(
        "--run-timeout-seconds",
        type=int,
        default=RUN_TIMEOUT_SECONDS,
    )
    parser.add_argument("--run-state", default=str(RUN_STATE))
    parser.add_argument("prompt", nargs="+")
    args = parser.parse_args()
    role = args.role
    if not 1 <= args.max_turns <= MAX_TURNS:
        parser.error(f"--max-turns must be between 1 and {MAX_TURNS}")
    if not 1 <= args.request_timeout_seconds <= MODEL_REQUEST_TIMEOUT_SECONDS:
        parser.error(
            f"--request-timeout-seconds must be between 1 and {MODEL_REQUEST_TIMEOUT_SECONDS}"
        )
    if not 1 <= args.run_timeout_seconds <= RUN_TIMEOUT_SECONDS:
        parser.error(
            f"--run-timeout-seconds must be between 1 and {RUN_TIMEOUT_SECONDS}"
        )
    if args.plan_only and role != "maker":
        parser.error("--plan-only is only valid with --role maker")

    plan_only = bool(args.plan_only)
    mode = "plan-only" if plan_only else role
    run_id = _run_id()
    state_path = Path(args.run_state).resolve()
    started_at = _utc_now()
    turn = 0
    deadline = time.monotonic() + args.run_timeout_seconds
    _write_checkpoint(
        state_path,
        run_id=run_id,
        role=role,
        mode=mode,
        status="running",
        event="started",
        turn=turn,
        started_at=started_at,
    )
    _emit("started", run_id, role=role, mode=mode, max_turns=args.max_turns)

    api_key = _api_key()
    if not api_key:
        error = "DEEPSEEK_API_KEY is not set; the key is required but is never stored in the repository"
        _write_checkpoint(
            state_path,
            run_id=run_id,
            role=role,
            mode=mode,
            status="failed",
            event="missing_api_key",
            turn=turn,
            started_at=started_at,
            error=error,
        )
        _emit("failed", run_id, error=error)
        print(error, file=sys.stderr)
        return 2

    messages: list[dict] = [
        {"role": "system", "content": _system_prompt(role, plan_only=plan_only)},
        {"role": "user", "content": " ".join(args.prompt)},
    ]
    tools = _tool_definitions_for(role, plan_only=plan_only)

    try:
        for turn in range(1, args.max_turns + 1):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"DeepSeek run exceeded {args.run_timeout_seconds}s")
            request_timeout = max(1, min(args.request_timeout_seconds, int(remaining)))
            _write_checkpoint(
                state_path,
                run_id=run_id,
                role=role,
                mode=mode,
                status="running",
                event="model_request",
                turn=turn,
                started_at=started_at,
            )
            _emit("model_request", run_id, turn=turn, timeout_seconds=request_timeout)
            response = _call_model(
                messages,
                tools,
                api_key,
                timeout_seconds=request_timeout,
            )
            choices = response.get("choices") or []
            if not choices or not isinstance(choices[0], dict):
                raise RuntimeError("DeepSeek returned no assistant choice")
            message = choices[0].get("message") or {}
            messages.append(message)
            tool_calls = message.get("tool_calls") or []
            _write_checkpoint(
                state_path,
                run_id=run_id,
                role=role,
                mode=mode,
                status="running",
                event="model_response",
                turn=turn,
                started_at=started_at,
            )
            _emit("model_response", run_id, turn=turn, tool_calls=len(tool_calls))
            if not tool_calls:
                text = message.get("content") or ""
                if role == "maker":
                    _save_run_result(text, run_id=run_id)
                if role == "checker":
                    lines = [line.strip() for line in str(text).splitlines() if line.strip()]
                    if not lines or not re.fullmatch(r"(?:APPROVE|REJECT|ESCALATE)(?::.*)?", lines[-1]):
                        print(text)
                        print("ESCALATE: checker did not return a valid final decision")
                    else:
                        print(text)
                else:
                    print(text)
                _write_checkpoint(
                    state_path,
                    run_id=run_id,
                    role=role,
                    mode=mode,
                    status="completed",
                    event="completed",
                    turn=turn,
                    started_at=started_at,
                )
                _emit("completed", run_id, turn=turn)
                return 0
            for tool_call in tool_calls:
                if deadline - time.monotonic() <= 0:
                    raise TimeoutError(f"DeepSeek run exceeded {args.run_timeout_seconds}s")
                function = tool_call.get("function") or {}
                name = function.get("name", "")
                _write_checkpoint(
                    state_path,
                    run_id=run_id,
                    role=role,
                    mode=mode,
                    status="running",
                    event="tool_request",
                    turn=turn,
                    started_at=started_at,
                )
                _emit("tool_request", run_id, turn=turn, tool=name)
                try:
                    arguments = json.loads(function.get("arguments") or "{}")
                except json.JSONDecodeError as exc:
                    result = f"tool_error: invalid JSON arguments: {exc}"
                else:
                    result = _execute_tool(name, arguments, role, plan_only=plan_only)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.get("id", "missing-tool-id"),
                        "content": _clip(result),
                    }
                )
                _write_checkpoint(
                    state_path,
                    run_id=run_id,
                    role=role,
                    mode=mode,
                    status="running",
                    event="tool_result",
                    turn=turn,
                    started_at=started_at,
                )
                _emit("tool_result", run_id, turn=turn, tool=name, error=result.startswith("tool_error:"))
        raise RuntimeError(f"DeepSeek reached the {args.max_turns}-turn bound before finishing")
    except (RuntimeError, TimeoutError) as exc:
        error = str(exc)
        _write_checkpoint(
            state_path,
            run_id=run_id,
            role=role,
            mode=mode,
            status="failed",
            event="failed",
            turn=turn,
            started_at=started_at,
            error=error,
        )
        _emit("failed", run_id, turn=turn, error=error)
        print(error, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
