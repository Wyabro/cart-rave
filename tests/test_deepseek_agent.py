"""Regression tests for the self-improving loop runner's control plane."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / ".agent" / "bin" / "deepseek_agent.py"
if str(MODULE_PATH.parent) not in sys.path:
    sys.path.insert(0, str(MODULE_PATH.parent))

import loop_safety

SPEC = importlib.util.spec_from_file_location("cart_clash_deepseek_agent", MODULE_PATH)
assert SPEC and SPEC.loader
agent = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = agent
SPEC.loader.exec_module(agent)


class DeepSeekAgentControlPlaneTests(unittest.TestCase):
    def test_plan_only_maker_does_not_receive_write_file(self) -> None:
        plan_tools = agent._tool_definitions_for("maker", plan_only=True)
        apply_tools = agent._tool_definitions_for("maker", plan_only=False)

        self.assertNotIn("write_file", {tool["function"]["name"] for tool in plan_tools})
        self.assertIn("write_file", {tool["function"]["name"] for tool in apply_tools})
        self.assertIn("run_readonly", {tool["function"]["name"] for tool in plan_tools})
        self.assertNotIn("run_command", {tool["function"]["name"] for tool in apply_tools})
        self.assertIn("write_file tool is unavailable by design", agent._system_prompt("maker", plan_only=True))

    def test_checker_is_read_only_and_requires_an_actionable_terminal_verdict(self) -> None:
        checker_tools = agent._tool_definitions_for("checker", plan_only=False)

        self.assertNotIn("write_file", {tool["function"]["name"] for tool in checker_tools})
        self.assertIn("final non-empty line MUST be exactly APPROVE", agent._system_prompt("checker"))
        self.assertEqual(agent._checker_final_verdict("Review complete\nAPPROVE"), "APPROVE")
        self.assertEqual(
            agent._checker_final_verdict("REJECT: The plan has no source seam."),
            "REJECT",
        )
        with self.assertRaisesRegex(RuntimeError, "actionable reason"):
            agent._checker_final_verdict("ESCALATE")
        with self.assertRaisesRegex(RuntimeError, "valid final decision"):
            agent._checker_final_verdict("looks good")

    def test_plan_only_write_attempt_is_rejected_before_path_access(self) -> None:
        result = agent._execute_tool(
            "write_file",
            {"path": "outside-worktree.txt", "content": "must not write"},
            "maker",
            plan_only=True,
        )

        self.assertTrue(result.startswith("tool_error: PermissionError:"))

    def test_checkpoint_is_atomic_and_has_run_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            state_path = root / "run-state.json"
            artifacts = loop_safety.RunArtifacts(
                root,
                Path(".agent/self-improving/runs"),
                "run-123",
            )
            payload = agent._write_checkpoint(
                state_path,
                artifacts,
                run_id="run-123",
                role="maker",
                mode="plan-only",
                status="running",
                event="model_request",
                turn=2,
                started_at="2026-08-10T00:00:00+00:00",
            )

            self.assertEqual(payload["run_id"], "run-123")
            self.assertEqual(json.loads(state_path.read_text(encoding="utf-8"))["event"], "model_request")
            self.assertEqual(
                json.loads(artifacts.path("run-state.json").read_text(encoding="utf-8"))["run_id"],
                "run-123",
            )
            self.assertEqual(
                payload["artifacts"]["run_result"],
                ".agent/self-improving/runs/run-123/run-result.md",
            )
            self.assertEqual(payload["tool_error_count"], 0)
            self.assertEqual(payload["model"], agent.MODEL)
            self.assertEqual(list(root.rglob("*.tmp")), [])

    def test_run_result_carries_the_same_run_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            artifacts = loop_safety.RunArtifacts(
                root,
                Path(".agent/self-improving/runs"),
                "run-456",
            )
            result_path = agent._save_run_result(artifacts, "PLAN", run_id="run-456")

            self.assertTrue(result_path.read_text(encoding="utf-8").startswith("# DeepSeek run run-456\n"))
            self.assertEqual(result_path, artifacts.path("run-result.md"))

    def test_deadline_order_leaves_tool_commands_shorter_than_model_requests(self) -> None:
        self.assertLess(agent.MAX_COMMAND_SECONDS, agent.MODEL_REQUEST_TIMEOUT_SECONDS)
        self.assertLessEqual(agent.MODEL_REQUEST_TIMEOUT_SECONDS, agent.RUN_TIMEOUT_SECONDS)


if __name__ == "__main__":
    unittest.main()
