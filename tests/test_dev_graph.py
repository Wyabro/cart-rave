"""Regression tests for the fail-closed Cart Clash development plan graph."""

from __future__ import annotations

import importlib.util
import json
import shutil
import sys
import tempfile
import unittest
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

    def _maker_process(self, state: dict, **artifact_kwargs: object):
        def fake_process(command: list[str], **kwargs: object) -> SimpleNamespace:
            self.maker_commands.append((command, kwargs))
            self._write_maker_artifacts(state, **artifact_kwargs)
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        return fake_process

    def _run_maker(self, state: dict, **artifact_kwargs: object) -> dict:
        with patch.object(graph.subprocess, "run", side_effect=self._maker_process(state, **artifact_kwargs)):
            return graph.run_maker(self.root, state["run_id"])

    def _approved_review(self, state: dict) -> str:
        return json.dumps(
            {
                "schema_version": 1,
                "card_id": state["card_id"],
                "graph_run_id": state["run_id"],
                "plan_sha256": state["artifacts"]["plan"]["sha256"],
                "verdict": "APPROVE",
                "findings": [],
            }
        )

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
        lock = json.loads(graph._lock_path(self.root).read_text(encoding="utf-8"))

        self.assertEqual(lock["run_id"], first["run_id"])
        self.assertNotIn("pid", lock)
        with self.assertRaisesRegex(graph.GraphError, first["run_id"]):
            self._start()

    def test_maker_receipt_binds_the_frozen_preflight_and_uses_fixed_argv(self) -> None:
        state = self._start()
        state = self._run_maker(state)
        receipt = json.loads(
            graph._artifacts(self.root, state["run_id"]).path("maker-receipt.json").read_text(encoding="utf-8")
        )
        command, kwargs = self.maker_commands[0]

        self.assertEqual(state["node"], "await_review")
        self.assertEqual(receipt["graph_run_id"], state["run_id"])
        self.assertEqual(receipt["brief_sha256"], state["artifacts"]["brief"]["sha256"])
        self.assertEqual(receipt["baseline_sha256"], state["artifacts"]["baseline"]["sha256"])
        self.assertEqual(receipt["plan_sha256"], state["artifacts"]["plan"]["sha256"])
        self.assertEqual(
            state["artifacts"]["plan"]["sha256"],
            graph._artifact_sha256(graph._artifacts(self.root, state["run_id"]).path("plan.md").read_bytes()),
        )
        self.assertEqual(
            state["artifacts"]["maker"]["sha256"],
            graph._artifact_sha256(
                graph._artifacts(self.root, state["run_id"]).path("maker-receipt.json").read_bytes()
            ),
        )
        self.assertEqual(
            command,
            graph._maker_command(self.root, graph._read_state(self.root, state["run_id"])),
        )
        self.assertFalse(kwargs["shell"])
        self.assertEqual(kwargs["timeout"], graph.MAKER_PROCESS_TIMEOUT_SECONDS)

    def test_maker_checkpoint_mismatch_blocks_and_releases_the_lock(self) -> None:
        state = self._start()
        state = self._run_maker(state, mode="maker")

        self.assertEqual(state["status"], "blocked")
        self.assertIn("fixed plan-only contract", state["failure"]["reason"])
        self.assertFalse(graph._lock_path(self.root).exists())

    def test_maker_tool_error_blocks_and_releases_the_lock(self) -> None:
        state = self._start()
        state = self._run_maker(state, tool_error_count=1)

        self.assertEqual(state["status"], "blocked")
        self.assertIn("fixed plan-only contract", state["failure"]["reason"])
        self.assertFalse(graph._lock_path(self.root).exists())

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
        self.assertFalse(graph._lock_path(self.root).exists())

    def test_synthetic_approval_trace_requires_receipt_digest_then_exact_ack(self) -> None:
        state = self._run_maker(self._start())
        review = json.loads(self._approved_review(state))
        review["plan_sha256"] = "0" * 64

        with self.assertRaisesRegex(graph.GraphError, "does not bind"):
            graph.submit_review(self.root, state["run_id"], json.dumps(review))

        self.assertEqual(graph._read_state(self.root, state["run_id"])["node"], "await_review")
        state = graph.submit_review(self.root, state["run_id"], self._approved_review(state))
        self.assertEqual(state["node"], "await_ack")

        with self.assertRaisesRegex(graph.GraphError, "exactly"):
            graph.acknowledge(self.root, state["run_id"], "okay")

        state = graph.acknowledge(self.root, state["run_id"], "ack DEV-GRAPH-2")
        self.assertEqual(state["status"], "complete")
        self.assertFalse(graph._lock_path(self.root).exists())


if __name__ == "__main__":
    unittest.main()
