"""Regression tests for the self-improving loop runner's control plane."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / ".agent" / "bin" / "deepseek_agent.py"
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
        self.assertIn("write_file tool is unavailable by design", agent._system_prompt("maker", plan_only=True))

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
            state_path = Path(temp_dir) / "run-state.json"
            payload = agent._write_checkpoint(
                state_path,
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
            self.assertEqual(list(state_path.parent.glob("*.tmp")), [])

    def test_run_result_carries_the_same_run_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            result_path = Path(temp_dir) / "run-result.md"
            with patch.object(agent, "RUN_RESULT", result_path):
                agent._save_run_result("PLAN", run_id="run-456")

            self.assertTrue(result_path.read_text(encoding="utf-8").startswith("# DeepSeek run run-456\n"))

    def test_deadline_order_leaves_tool_commands_shorter_than_model_requests(self) -> None:
        self.assertLess(agent.MAX_COMMAND_SECONDS, agent.MODEL_REQUEST_TIMEOUT_SECONDS)
        self.assertLessEqual(agent.MODEL_REQUEST_TIMEOUT_SECONDS, agent.RUN_TIMEOUT_SECONDS)


if __name__ == "__main__":
    unittest.main()
