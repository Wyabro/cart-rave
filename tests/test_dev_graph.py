"""Regression tests for the fail-closed Cart Clash development plan graph."""

from __future__ import annotations

import importlib.util
import json
import shutil
import sys
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / ".agent" / "bin" / "dev_graph.py"
if str(MODULE_PATH.parent) not in sys.path:
    sys.path.insert(0, str(MODULE_PATH.parent))

import loop_safety

SPEC = importlib.util.spec_from_file_location("cart_clash_dev_graph", MODULE_PATH)
assert SPEC and SPEC.loader
graph = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = graph
SPEC.loader.exec_module(graph)


class DevGraphTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        destination = self.root / ".agent" / "graphs" / "dev-graph.json"
        destination.parent.mkdir(parents=True)
        shutil.copyfile(ROOT / ".agent" / "graphs" / "dev-graph.json", destination)
        self.head = "a" * 40
        self.git_output = patch.object(graph, "_git_output", return_value=self.head + "\n")
        self.mock_git_output = self.git_output.start()
        self.mock_git_output.side_effect = self._git_result
        self.maker_commands: list[tuple[list[str], dict]] = []
        self.checker_commands: list[tuple[list[str], dict]] = []

    def tearDown(self) -> None:
        self.git_output.stop()
        self.temp_dir.cleanup()

    def _git_result(self, _root: Path, *arguments: str) -> str:
        if arguments == ("rev-parse", "HEAD"):
            return self.head + "\n"
        if arguments == ("status", "--porcelain=v1", "--untracked-files=all"):
            return ""
        self.fail(f"unexpected git call: {arguments}")

    def _start(self) -> dict:
        return graph.start(self.root, "DEV-GRAPH-2", "# Immutable brief\n\nInspect one seam.\n")

    def _write_maker_artifacts(
        self,
        state: dict,
        *,
        mode: str = "plan-only",
        tool_error_count: int = 0,
        result: str | None = None,
    ) -> None:
        maker_run_id = graph._maker_run_id(state["run_id"])
        artifacts = loop_safety.RunArtifacts(
            self.root,
            graph.MAKER_ARTIFACT_NAMESPACE,
            maker_run_id,
        )
        artifacts.write_text(
            "run-result.md",
            result or f"# DeepSeek run {maker_run_id}\n\n# Plan\n\nInspect one seam.\n",
        )
        artifacts.write_json(
            "run-state.json",
            {
                "run_id": maker_run_id,
                "role": "maker",
                "mode": mode,
                "model": state["deepseek_model"],
                "status": "completed",
                "event": "completed",
                "turn": 1,
                "tool_error_count": tool_error_count,
                "artifacts": {
                    "run_state": f".agent/self-improving/runs/{maker_run_id}/run-state.json",
                    "run_result": f".agent/self-improving/runs/{maker_run_id}/run-result.md",
                },
            },
        )

    def _write_checker_artifacts(
        self,
        state: dict,
        *,
        mode: str = "checker",
        tool_error_count: int = 0,
        result: str | None = None,
    ) -> None:
        checker_run_id = graph._checker_run_id(state["run_id"])
        artifacts = loop_safety.RunArtifacts(
            self.root,
            graph.MAKER_ARTIFACT_NAMESPACE,
            checker_run_id,
        )
        artifacts.write_text(
            "run-result.md",
            result or f"# DeepSeek run {checker_run_id}\n\nPlan is scoped.\nAPPROVE\n",
        )
        artifacts.write_json(
            "run-state.json",
            {
                "run_id": checker_run_id,
                "role": "checker",
                "mode": mode,
                "model": state["deepseek_model"],
                "status": "completed",
                "event": "completed",
                "turn": 1,
                "tool_error_count": tool_error_count,
                "artifacts": {
                    "run_state": f".agent/self-improving/runs/{checker_run_id}/run-state.json",
                    "run_result": f".agent/self-improving/runs/{checker_run_id}/run-result.md",
                },
            },
        )

    def _maker_process(self, state: dict, **artifact_kwargs: object):
        def fake_process(command: list[str], **kwargs: object) -> SimpleNamespace:
            self.maker_commands.append((command, kwargs))
            self._write_maker_artifacts(state, **artifact_kwargs)
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        return fake_process

    def _checker_process(self, state: dict, **artifact_kwargs: object):
        def fake_process(command: list[str], **kwargs: object) -> SimpleNamespace:
            self.checker_commands.append((command, kwargs))
            self._write_checker_artifacts(state, **artifact_kwargs)
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        return fake_process

    def _run_maker(self, state: dict, **artifact_kwargs: object) -> dict:
        with patch.object(graph.subprocess, "run", side_effect=self._maker_process(state, **artifact_kwargs)):
            return graph.run_maker(self.root, state["run_id"])

    def _run_checker(self, state: dict, **artifact_kwargs: object) -> dict:
        with patch.object(graph.subprocess, "run", side_effect=self._checker_process(state, **artifact_kwargs)):
            return graph.run_checker(self.root, state["run_id"])

    def _checker_request(self, state: dict) -> dict:
        artifacts = graph._artifacts(self.root, state["run_id"])
        return json.loads(artifacts.path("checker-request.json").read_text(encoding="utf-8"))

    def test_graph_definition_rejects_command_nodes(self) -> None:
        contract = json.loads((ROOT / ".agent" / "graphs" / "dev-graph.json").read_text())
        contract["nodes"]["await_maker"]["command"] = ["powershell", "-Command", "..."]

        with self.assertRaisesRegex(graph.GraphError, "unsupported fields"):
            graph._validate_graph(contract)

    def test_start_requires_a_clean_worktree(self) -> None:
        self.mock_git_output.side_effect = [self.head + "\n", " M src/main.js\n"]

        with self.assertRaisesRegex(graph.GraphError, "clean worktree"):
            self._start()

        self.assertFalse((self.root / ".agent" / "runtime" / "dev-graph").exists())

    def test_logical_lock_survives_the_starter_process_lifetime(self) -> None:
        first = self._start()
        lock = json.loads(graph._lock_path(self.root, "DEV-GRAPH-2").read_text(encoding="utf-8"))

        self.assertEqual(lock["run_id"], first["run_id"])
        self.assertNotIn("pid", lock)
        self.assertEqual(lock["card_id"], "DEV-GRAPH-2")
        with self.assertRaisesRegex(graph.GraphError, first["run_id"]):
            self._start()

    def test_a_different_card_can_start_while_another_card_is_locked(self) -> None:
        first = self._start()
        second = graph.start(self.root, "OTHER-CARD-1", "# Second brief\n")

        self.assertNotEqual(first["run_id"], second["run_id"])
        self.assertEqual(second["card_id"], "OTHER-CARD-1")
        self.assertTrue(graph._lock_path(self.root, "DEV-GRAPH-2").exists())
        self.assertTrue(graph._lock_path(self.root, "OTHER-CARD-1").exists())

        # * A second run for the SAME card still fails closed.
        with self.assertRaisesRegex(graph.GraphError, first["run_id"]):
            self._start()

    def test_maker_receipt_binds_the_frozen_preflight_and_uses_fixed_argv(self) -> None:
        state = self._run_maker(self._start())
        receipt = json.loads(
            graph._artifacts(self.root, state["run_id"]).path("maker-receipt.json").read_text(encoding="utf-8")
        )
        command, kwargs = self.maker_commands[0]

        self.assertEqual(state["node"], "await_checker")
        self.assertEqual(receipt["graph_run_id"], state["run_id"])
        self.assertEqual(receipt["model"], state["deepseek_model"])
        self.assertEqual(receipt["plan_sha256"], state["artifacts"]["plan"]["sha256"])
        request = self._checker_request(state)
        self.assertEqual(request["checker_request_id"], graph._checker_request_id(state["run_id"]))
        self.assertEqual(request["checker"]["model"], state["deepseek_model"])
        self.assertEqual(
            command,
            graph._maker_command(self.root, graph._read_state(self.root, state["run_id"])),
        )
        self.assertFalse(kwargs["shell"])
        self.assertEqual(kwargs["timeout"], graph.MAKER_PROCESS_TIMEOUT_SECONDS)
        self.assertEqual(kwargs["env"]["DEEPSEEK_MODEL"], state["deepseek_model"])

    def test_maker_checkpoint_mismatch_blocks_and_releases_the_lock(self) -> None:
        state = self._run_maker(self._start(), mode="maker")

        self.assertEqual(state["status"], "blocked")
        self.assertIn("fixed plan-only contract", state["failure"]["reason"])
        self.assertFalse(graph._lock_path(self.root, "DEV-GRAPH-2").exists())

    def test_maker_tool_error_blocks_and_releases_the_lock(self) -> None:
        state = self._run_maker(self._start(), tool_error_count=1)

        self.assertEqual(state["status"], "blocked")
        self.assertIn("fixed plan-only contract", state["failure"]["reason"])
        self.assertFalse(graph._lock_path(self.root, "DEV-GRAPH-2").exists())

    def test_checker_request_write_failure_blocks_and_releases_the_lock(self) -> None:
        state = self._start()

        with patch.object(graph, "_write_checker_request", side_effect=graph.GraphError("request write failed")):
            state = self._run_maker(state)

        self.assertEqual(state["status"], "blocked")
        self.assertEqual(state["failure"], {"stage": "maker", "reason": "request write failed"})
        self.assertFalse(graph._lock_path(self.root, "DEV-GRAPH-2").exists())

    def test_maker_worktree_drift_blocks_and_releases_the_lock(self) -> None:
        state = self._start()
        self.mock_git_output.side_effect = [
            self.head + "\n",
            "",
            self.head + "\n",
            " M src/main.js\n",
        ]

        state = self._run_maker(state)

        self.assertEqual(state["status"], "blocked")
        self.assertIn("worktree baseline changed", state["failure"]["reason"])
        self.assertFalse(graph._lock_path(self.root, "DEV-GRAPH-2").exists())

    def test_checker_receipt_is_bound_and_uses_fixed_read_only_argv(self) -> None:
        state = self._run_maker(self._start())
        state = self._run_checker(state)
        receipt = json.loads(
            graph._artifacts(self.root, state["run_id"]).path("checker-receipt.json").read_text(encoding="utf-8")
        )
        command, kwargs = self.checker_commands[0]

        self.assertEqual(state["node"], "await_ack")
        self.assertEqual(receipt["checker_run_id"], graph._checker_run_id(state["run_id"]))
        self.assertEqual(receipt["checker_request_sha256"], state["artifacts"]["checker_request"]["sha256"])
        self.assertEqual(receipt["model"], state["deepseek_model"])
        self.assertEqual(receipt["verdict"], "APPROVE")
        self.assertEqual(receipt["findings"], [])
        self.assertEqual(command, graph._checker_command(self.root, graph._read_state(self.root, state["run_id"])))
        self.assertFalse(kwargs["shell"])
        self.assertEqual(kwargs["timeout"], graph.CHECKER_PROCESS_TIMEOUT_SECONDS)
        self.assertEqual(kwargs["env"]["DEEPSEEK_MODEL"], state["deepseek_model"])

    def test_checker_checkpoint_mismatch_blocks_and_releases_the_lock(self) -> None:
        state = self._run_maker(self._start())
        state = self._run_checker(state, mode="maker")

        self.assertEqual(state["status"], "blocked")
        self.assertEqual(state["failure"]["stage"], "checker")
        self.assertIn("fixed read-only contract", state["failure"]["reason"])
        self.assertFalse(graph._lock_path(self.root, "DEV-GRAPH-2").exists())

    def test_checker_invalid_final_decision_blocks_and_releases_the_lock(self) -> None:
        state = self._run_maker(self._start())
        checker_run_id = graph._checker_run_id(state["run_id"])
        state = self._run_checker(
            state,
            result=f"# DeepSeek run {checker_run_id}\n\nThe plan looks good.\n",
        )

        self.assertEqual(state["status"], "blocked")
        self.assertIn("invalid final decision", state["failure"]["reason"])
        self.assertFalse(graph._lock_path(self.root, "DEV-GRAPH-2").exists())

    def test_replayed_checker_result_blocks_and_releases_the_lock(self) -> None:
        first = self._run_maker(self._start())
        first_checker_run_id = graph._checker_run_id(first["run_id"])
        first = self._run_checker(
            first,
            result=(
                f"# DeepSeek run {first_checker_run_id}\n\n"
                "REJECT: Do not reuse this checker result.\n"
            ),
        )
        first_checker = loop_safety.RunArtifacts(
            self.root,
            graph.MAKER_ARTIFACT_NAMESPACE,
            graph._checker_run_id(first["run_id"]),
        )
        replay_result = first_checker.path("run-result.md").read_text(encoding="utf-8")
        state = self._run_maker(self._start())
        state = self._run_checker(state, result=replay_result)

        self.assertEqual(state["status"], "blocked")
        self.assertIn("expected run identity", state["failure"]["reason"])
        self.assertFalse(graph._lock_path(self.root, "DEV-GRAPH-2").exists())

    def test_checker_rejection_is_terminal_and_releases_the_lock(self) -> None:
        state = self._run_maker(self._start())
        checker_run_id = graph._checker_run_id(state["run_id"])
        state = self._run_checker(
            state,
            result=(
                f"# DeepSeek run {checker_run_id}\n\n"
                "The plan is missing a source seam.\n"
                "REJECT: Name the source seam and regression test.\n"
            ),
        )

        self.assertEqual(state["status"], "rejected")
        self.assertFalse(graph._lock_path(self.root, "DEV-GRAPH-2").exists())

    def test_checker_worktree_drift_blocks_and_releases_the_lock(self) -> None:
        state = self._run_maker(self._start())
        self.mock_git_output.side_effect = [self.head + "\n", " M src/main.js\n"]

        state = self._run_checker(state)

        self.assertEqual(state["status"], "blocked")
        self.assertEqual(state["failure"]["stage"], "checker")
        self.assertIn("worktree baseline changed", state["failure"]["reason"])
        self.assertFalse(graph._lock_path(self.root, "DEV-GRAPH-2").exists())

    def test_checker_deadline_expiry_blocks_and_releases_the_lock(self) -> None:
        state = self._run_maker(self._start())
        deadline = graph._parse_utc_timestamp(self._checker_request(state)["deadline_at"], "deadline")

        with patch.object(graph, "_now", return_value=deadline + timedelta(seconds=1)):
            state = self._run_checker(state)

        self.assertEqual(state["status"], "blocked")
        self.assertIn("deadline expired", state["failure"]["reason"])
        self.assertFalse(graph._lock_path(self.root, "DEV-GRAPH-2").exists())

    def test_ack_worktree_drift_blocks_and_releases_the_lock(self) -> None:
        state = self._run_checker(self._run_maker(self._start()))
        self.mock_git_output.side_effect = [self.head + "\n", " M src/main.js\n"]

        state = graph.acknowledge(self.root, state["run_id"], "ack DEV-GRAPH-2")

        self.assertEqual(state["status"], "blocked")
        self.assertEqual(state["failure"]["stage"], "ack")
        self.assertIn("worktree baseline changed", state["failure"]["reason"])
        self.assertFalse(graph._lock_path(self.root, "DEV-GRAPH-2").exists())

    def test_synthetic_approval_trace_requires_exact_ack(self) -> None:
        state = self._run_checker(self._run_maker(self._start()))
        self.assertEqual(state["node"], "await_ack")
        self.assertFalse(hasattr(graph, "submit_review"))
        self.assertFalse(hasattr(graph, "fail_review"))

        with self.assertRaisesRegex(graph.GraphError, "exactly"):
            graph.acknowledge(self.root, state["run_id"], "okay")

        state = graph.acknowledge(self.root, state["run_id"], "ack DEV-GRAPH-2")
        self.assertEqual(state["status"], "complete")
        self.assertFalse(graph._lock_path(self.root, "DEV-GRAPH-2").exists())


if __name__ == "__main__":
    unittest.main()
