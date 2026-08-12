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
            self.assertEqual(first.path("state.json").read_bytes(), b'{\n  "run_id": "run-a"\n}\n')
            self.assertTrue(second.path("plan.md").is_file())
            self.assertEqual(list(root.rglob("*.tmp")), [])

    def test_atomic_write_retries_transient_windows_file_locks(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "run-state.json"
            real_replace = loop_safety.os.replace
            attempts = 0

            def replace_after_two_locks(source: Path, destination: Path) -> None:
                nonlocal attempts
                attempts += 1
                if attempts < 3:
                    raise PermissionError("file is locked")
                real_replace(source, destination)

            with (
                patch.object(loop_safety.os, "replace", side_effect=replace_after_two_locks),
                patch.object(loop_safety.time, "sleep") as sleep,
            ):
                loop_safety.atomic_write_text(path, "clean\n")

            self.assertEqual(attempts, 3)
            self.assertEqual(path.read_text(encoding="utf-8"), "clean\n")
            self.assertEqual(list(path.parent.glob("*.tmp")), [])
            sleep.assert_has_calls(
                [
                    unittest.mock.call(loop_safety.ATOMIC_REPLACE_INITIAL_DELAY_SECONDS),
                    unittest.mock.call(loop_safety.ATOMIC_REPLACE_INITIAL_DELAY_SECONDS * 2),
                ]
            )

    def test_atomic_write_removes_temporary_file_after_persistent_lock(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "run-state.json"
            with (
                patch.object(loop_safety.os, "replace", side_effect=PermissionError("file is locked")) as replace,
                patch.object(loop_safety.time, "sleep"),
                self.assertRaisesRegex(PermissionError, "file is locked"),
            ):
                loop_safety.atomic_write_text(path, "blocked\n")

            self.assertEqual(replace.call_count, loop_safety.ATOMIC_REPLACE_ATTEMPTS)
            self.assertFalse(path.exists())
            self.assertEqual(list(path.parent.glob("*.tmp")), [])

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

    def test_npm_qa_uses_the_platform_executable(self) -> None:
        expected = "npm.cmd" if loop_safety.os.name == "nt" else "npm"

        self.assertEqual(loop_safety.READ_ONLY_COMMANDS["npm_qa"][0], expected)

    def test_unknown_operation_fails_before_process_spawn(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(loop_safety.subprocess, "run") as run:
                with self.assertRaisesRegex(loop_safety.LoopSafetyError, "unsupported"):
                    loop_safety.run_readonly(Path(temp_dir), "git_push")

        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
