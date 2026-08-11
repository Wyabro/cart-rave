"""Regression tests for the loop capability and artifact boundary."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
MODULE_DIR = ROOT / ".agent" / "bin"
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

import loop_safety


class LoopSafetyTests(unittest.TestCase):
    def test_run_artifacts_are_atomic_and_isolated_by_run(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            first = loop_safety.RunArtifacts(root, Path(".agent/runtime/dev-graph"), "run-a")
            second = loop_safety.RunArtifacts(root, Path(".agent/runtime/dev-graph"), "run-b")

            first.write_json("state.json", {"run_id": "run-a"})
            second.write_text("plan.md", "# Plan\n")

            self.assertNotEqual(first.run_dir, second.run_dir)
            self.assertEqual(first.path("state.json").read_text(encoding="utf-8"), '{\n  "run_id": "run-a"\n}\n')
            self.assertTrue(second.path("plan.md").is_file())
            self.assertEqual(list(root.rglob("*.tmp")), [])

    def test_run_artifacts_reject_path_escape(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            with self.assertRaisesRegex(loop_safety.LoopSafetyError, "namespace"):
                loop_safety.RunArtifacts(root, Path("../outside"), "run-a")
            artifacts = loop_safety.RunArtifacts(root, Path(".agent/self-improving/runs"), "run-a")
            with self.assertRaisesRegex(loop_safety.LoopSafetyError, "one file name"):
                artifacts.write_text("../outside.md", "no")

    def test_readonly_operation_uses_fixed_argv_without_a_shell(self) -> None:
        completed = SimpleNamespace(returncode=0, stdout="clean\n", stderr="")
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(loop_safety.subprocess, "run", return_value=completed) as run:
                output = loop_safety.run_readonly(Path(temp_dir), "git_status")

        self.assertEqual(output, "exit_code=0\nclean")
        arguments, keywords = run.call_args
        self.assertEqual(arguments[0], list(loop_safety.READ_ONLY_COMMANDS["git_status"]))
        self.assertNotIn("shell", keywords)
        self.assertNotIn("powershell", " ".join(arguments[0]).lower())

    def test_unknown_operation_fails_before_process_spawn(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(loop_safety.subprocess, "run") as run:
                with self.assertRaisesRegex(loop_safety.LoopSafetyError, "unsupported"):
                    loop_safety.run_readonly(Path(temp_dir), "git_push")

        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
