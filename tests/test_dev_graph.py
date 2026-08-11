"""Regression tests for the model-free Cart Clash development plan graph."""

from __future__ import annotations

import importlib.util
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / ".agent" / "bin" / "dev_graph.py"
if str(MODULE_PATH.parent) not in sys.path:
    sys.path.insert(0, str(MODULE_PATH.parent))

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
        return graph.start(self.root, "DEV-GRAPH-1")

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
        contract["nodes"]["await_plan"]["command"] = ["powershell", "-Command", "..."]

        with self.assertRaisesRegex(graph.GraphError, "unsupported fields"):
            graph._validate_graph(contract)

    def test_start_requires_a_clean_worktree(self) -> None:
        self.mock_git_output.side_effect = [self.head + "\n", " M src/main.js\n"]

        with self.assertRaisesRegex(graph.GraphError, "clean worktree"):
            self._start()

        self.assertFalse((self.root / ".agent" / "runtime" / "dev-graph").exists())

    def test_second_run_is_blocked_by_the_persistent_lock(self) -> None:
        first = self._start()

        with self.assertRaisesRegex(graph.GraphError, first["run_id"]):
            self._start()

    def test_synthetic_approval_trace_requires_digest_then_exact_ack(self) -> None:
        state = self._start()
        state = graph.submit_plan(self.root, state["run_id"], "# Plan\n\nInspect one seam.\n")
        review = json.loads(self._approved_review(state))
        review["plan_sha256"] = "0" * 64

        with self.assertRaisesRegex(graph.GraphError, "does not bind"):
            graph.submit_review(self.root, state["run_id"], json.dumps(review))

        self.assertEqual(graph._read_state(self.root, state["run_id"])["node"], "await_review")
        state = graph.submit_review(self.root, state["run_id"], self._approved_review(state))
        self.assertEqual(state["node"], "await_ack")

        with self.assertRaisesRegex(graph.GraphError, "exactly"):
            graph.acknowledge(self.root, state["run_id"], "okay")

        state = graph.acknowledge(self.root, state["run_id"], "ack DEV-GRAPH-1")
        self.assertEqual(state["status"], "complete")
        self.assertFalse((self.root / ".agent" / "runtime" / "dev-graph" / "active.lock").exists())

    def test_synthetic_rejection_trace_is_terminal_and_releases_the_lock(self) -> None:
        state = self._start()
        state = graph.submit_plan(self.root, state["run_id"], "# Plan\n")
        review = {
            "schema_version": 1,
            "card_id": state["card_id"],
            "graph_run_id": state["run_id"],
            "plan_sha256": state["artifacts"]["plan"]["sha256"],
            "verdict": "REJECT",
            "findings": ["No source seam."],
        }

        state = graph.submit_review(self.root, state["run_id"], json.dumps(review))

        self.assertEqual(state["node"], "rejected")
        self.assertEqual(state["status"], "rejected")
        self.assertFalse((self.root / ".agent" / "runtime" / "dev-graph" / "active.lock").exists())

if __name__ == "__main__":
    unittest.main()
