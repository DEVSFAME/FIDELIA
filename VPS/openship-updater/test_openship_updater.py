#!/usr/bin/env python3
"""Unit tests for the OpenShip updater's stack reconciliation logic.

Focus: an update must NEVER leave the OpenShip core stack in the `Created`
state (lesson-learned §5). The `docker compose up -d` reconciliation must run
after every update attempt, must be a no-op on a healthy stack, and the
`docker ps -a` control must detect stuck containers.

Run:  python3 -m unittest -v test_openship_updater
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

# Keep test noise out of the production log file.
os.environ["LOG_FILE"] = os.path.join(
    tempfile.gettempdir(), "openship-updater-test.log"
)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import openship_updater as u  # noqa: E402


class FakeCompleted:
    """Minimal stand-in for subprocess.CompletedProcess."""

    def __init__(self, stdout: str = "", stderr: str = "", returncode: int = 0):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


class TestListStuckContainers(unittest.TestCase):
    """The `docker ps -a` control."""

    def test_parses_created_and_exited(self):
        out = (
            "openship-api-1\tCreated\n"
            "openship-edge\tExited (137) 2 minutes ago\n"
            "openship-postgres-1\tUp 10 days (healthy)\n"
        )
        with mock.patch.object(u.subprocess, "run", return_value=FakeCompleted(stdout=out)):
            stuck = u.list_stuck_containers()
        self.assertEqual(len(stuck), 2)
        self.assertIn("openship-api-1 (Created)", stuck)
        self.assertTrue(any(s.startswith("openship-edge") for s in stuck))

    def test_healthy_stack_returns_empty(self):
        out = (
            "openship-api-1\tUp 10 minutes (healthy)\n"
            "openship-edge\tUp 10 minutes\n"
        )
        with mock.patch.object(u.subprocess, "run", return_value=FakeCompleted(stdout=out)):
            self.assertEqual(u.list_stuck_containers(), [])

    def test_subprocess_error_is_swallowed(self):
        with mock.patch.object(u.subprocess, "run", side_effect=OSError("boom")):
            self.assertEqual(u.list_stuck_containers(), [])


class TestCoreStackStatus(unittest.TestCase):
    """Scoped `docker compose ps -a` parsing."""

    def test_parses_compose_ps(self):
        out = "openship-api-1\tUp 10 minutes (healthy)\nopenship-edge\tCreated\n"
        with mock.patch.object(u.os.path, "isfile", return_value=True), mock.patch.object(
            u.subprocess, "run", return_value=FakeCompleted(stdout=out)
        ):
            status = u.core_stack_status()
        self.assertEqual(status["openship-api-1"], "Up 10 minutes (healthy)")
        self.assertEqual(status["openship-edge"], "Created")

    def test_missing_compose_file(self):
        with mock.patch.object(u.os.path, "isfile", return_value=False):
            self.assertEqual(u.core_stack_status(), {})

    def test_subprocess_error_returns_empty(self):
        with mock.patch.object(u.os.path, "isfile", return_value=True), mock.patch.object(
            u.subprocess, "run", side_effect=OSError("nope")
        ):
            self.assertEqual(u.core_stack_status(), {})


class TestComposeUp(unittest.TestCase):
    """The `docker compose up -d` primitive (lesson-learned §5 command)."""

    def test_runs_in_compose_dir(self):
        with mock.patch.object(u.os.path, "isfile", return_value=True), mock.patch.object(
            u.subprocess, "run", return_value=FakeCompleted(returncode=0)
        ) as run:
            self.assertTrue(u._compose_up())
        args, kwargs = run.call_args
        self.assertEqual(args[0][:3], ["docker", "compose", "up"])
        self.assertIn("-d", args[0])
        self.assertEqual(kwargs["cwd"], u.COMPOSE_DIR)

    def test_nonzero_returncode(self):
        with mock.patch.object(u.os.path, "isfile", return_value=True), mock.patch.object(
            u.subprocess, "run",
            return_value=FakeCompleted(returncode=1, stderr="boom"),
        ):
            self.assertFalse(u._compose_up())

    def test_timeout(self):
        with mock.patch.object(u.os.path, "isfile", return_value=True), mock.patch.object(
            u.subprocess, "run",
            side_effect=subprocess.TimeoutExpired(cmd="docker compose up -d", timeout=1),
        ):
            self.assertFalse(u._compose_up())

    def test_missing_compose_file(self):
        with mock.patch.object(u.os.path, "isfile", return_value=False):
            self.assertFalse(u._compose_up())


class TestReconcileStack(unittest.TestCase):
    """Reconciliation must heal `Created` containers and be a no-op when healthy."""

    def setUp(self):
        # Never sleep in tests.
        self._settle = mock.patch.object(u, "RECONCILE_SETTLE_SECONDS", 0)
        self._settle.start()
        self.addCleanup(self._settle.stop)

    def test_noop_when_healthy(self):
        with mock.patch.object(
            u, "core_stack_status",
            return_value={"openship-api-1": "Up 10 minutes (healthy)"},
        ), mock.patch.object(u, "_compose_up") as compose_up, mock.patch.object(
            u, "list_stuck_containers", return_value=[]
        ):
            self.assertTrue(u.reconcile_stack())
        compose_up.assert_not_called()  # production untouched

    def test_heals_created_container_in_phase1(self):
        statuses = [
            {"openship-api-1": "Created", "openship-edge": "Created"},  # top check
            {"openship-api-1": "Up 5s (healthy)", "openship-edge": "Up 5s"},  # after up -d
        ]
        with mock.patch.object(
            u, "core_stack_status", side_effect=statuses
        ), mock.patch.object(u, "_compose_up", return_value=True) as compose_up, mock.patch.object(
            u, "list_stuck_containers", return_value=[]
        ), mock.patch.object(u, "_remove_container") as rm:
            self.assertTrue(u.reconcile_stack())
        compose_up.assert_called_once()
        rm.assert_not_called()  # phase 1 was enough

    def test_fallback_removes_and_retries(self):
        statuses = [
            {"openship-api-1": "Created"},  # top check
            {"openship-api-1": "Created"},  # after phase 1 -> still stuck
            {"openship-api-1": "Up 5s"},    # after fallback -> healed
        ]
        with mock.patch.object(
            u, "core_stack_status", side_effect=statuses
        ), mock.patch.object(u, "_compose_up", return_value=True) as compose_up, mock.patch.object(
            u, "list_stuck_containers", return_value=[]
        ), mock.patch.object(u, "_remove_container") as rm:
            self.assertTrue(u.reconcile_stack())
        self.assertEqual(compose_up.call_count, 2)
        rm.assert_called_once_with("openship-api-1")

    def test_returns_false_when_still_stuck_after_fallback(self):
        with mock.patch.object(
            u, "core_stack_status", return_value={"openship-api-1": "Created"}
        ), mock.patch.object(u, "_compose_up", return_value=True), mock.patch.object(
            u, "list_stuck_containers", return_value=[]
        ), mock.patch.object(u, "_remove_container"):
            self.assertFalse(u.reconcile_stack())

    def test_returns_false_when_compose_up_fails(self):
        with mock.patch.object(
            u, "core_stack_status", return_value={"openship-api-1": "Created"}
        ), mock.patch.object(u, "_compose_up", return_value=False), mock.patch.object(
            u, "list_stuck_containers", return_value=[]
        ), mock.patch.object(u, "_remove_container"):
            self.assertFalse(u.reconcile_stack())

    def test_force_runs_even_when_healthy(self):
        with mock.patch.object(
            u, "core_stack_status", return_value={"openship-api-1": "Up 1s"}
        ), mock.patch.object(u, "_compose_up", return_value=True) as compose_up, mock.patch.object(
            u, "list_stuck_containers", return_value=[]
        ):
            self.assertTrue(u.reconcile_stack(force=True))
        compose_up.assert_called_once()



class TestReconcileFlag(unittest.TestCase):
    """`--reconcile` = standalone self-heal, never triggers an update."""

    def test_reconcile_flag_calls_forced_reconcile(self):
        with mock.patch.object(u, "acquire_lock", return_value=True), mock.patch.object(
            u, "release_lock"
        ), mock.patch.object(u, "reconcile_stack", return_value=True) as rec:
            rc = u.main(["--reconcile"])
        self.assertEqual(rc, 0)
        rec.assert_called_once_with(force=True)

    def test_reconcile_flag_reports_failure(self):
        with mock.patch.object(u, "acquire_lock", return_value=True), mock.patch.object(
            u, "release_lock"
        ), mock.patch.object(u, "reconcile_stack", return_value=False):
            self.assertEqual(u.main(["--reconcile"]), 1)

    def test_reconcile_flag_never_triggers_update(self):
        with mock.patch.object(u, "acquire_lock", return_value=True), mock.patch.object(
            u, "release_lock"
        ), mock.patch.object(u, "reconcile_stack", return_value=True), mock.patch.object(
            u, "run_update"
        ) as run_upd:
            u.main(["--reconcile"])
        run_upd.assert_not_called()


class TestMainUpdatePath(unittest.TestCase):
    """The §5 fix: reconcile ALWAYS runs after an update attempt."""

    def _run_main(self, update_ok, reconcile_ok, verify_ok):
        decision = mock.Mock(should_update=True, reason="test", severity="recommended")
        with mock.patch.object(u, "acquire_lock", return_value=True), mock.patch.object(
            u, "release_lock"
        ), mock.patch.object(u, "_stuck_core_names", return_value=[]), mock.patch.object(
            u, "get_installed_version", return_value="0.8.1"
        ), mock.patch.object(u, "get_latest_tag", return_value="v0.8.2"), mock.patch.object(
            u, "get_advisories", return_value=[]
        ), mock.patch.object(u, "decide_update", return_value=decision), mock.patch.object(
            u, "evaluate_advisories", return_value=[]
        ), mock.patch.object(u, "load_state", return_value={}), mock.patch.object(
            u, "save_state"
        ), mock.patch.object(u, "run_update", return_value=update_ok) as run_upd, mock.patch.object(
            u, "reconcile_stack", return_value=reconcile_ok
        ) as rec, mock.patch.object(u, "verify_update", return_value=verify_ok), mock.patch.object(
            u, "cleanup_old_images"
        ):
            rc = u.main(["--apply"])
        return rc, run_upd, rec

    def test_reconcile_called_even_when_update_fails(self):
        # `openship update` aborts (rc!=0) but the stack was left broken:
        # reconcile must still run and repair it -> success if version bumped.
        rc, run_upd, rec = self._run_main(update_ok=False, reconcile_ok=True, verify_ok=True)
        run_upd.assert_called_once()
        rec.assert_called_once()
        self.assertEqual(rc, 0)

    def test_success_path(self):
        rc, _run_upd, rec = self._run_main(update_ok=True, reconcile_ok=True, verify_ok=True)
        self.assertEqual(rc, 0)
        rec.assert_called_once()

    def test_fails_when_update_and_reconcile_fail(self):
        rc, _run_upd, rec = self._run_main(update_ok=False, reconcile_ok=False, verify_ok=False)
        rec.assert_called_once()
        self.assertEqual(rc, 1)

    def test_fails_when_reconcile_fails_but_version_bumped(self):
        rc, _run_upd, rec = self._run_main(update_ok=True, reconcile_ok=False, verify_ok=True)
        rec.assert_called_once()
        self.assertEqual(rc, 1)


class TestPreFlightHeal(unittest.TestCase):
    """A leftover §5 state from a killed run is repaired before detection."""

    def test_preflight_heals_leftover_stuck_stack(self):
        decision = mock.Mock(
            should_update=False, reason="no applicable advisory", severity="info"
        )
        with mock.patch.object(u, "acquire_lock", return_value=True), mock.patch.object(
            u, "release_lock"
        ), mock.patch.object(
            u, "_stuck_core_names", return_value=["openship-api-1"]
        ), mock.patch.object(
            u, "get_installed_version", return_value="0.8.2"
        ), mock.patch.object(u, "get_latest_tag", return_value="v0.8.2"), mock.patch.object(
            u, "get_advisories", return_value=[]
        ), mock.patch.object(u, "decide_update", return_value=decision), mock.patch.object(
            u, "evaluate_advisories", return_value=[]
        ), mock.patch.object(u, "load_state", return_value={}), mock.patch.object(
            u, "save_state"
        ), mock.patch.object(u, "reconcile_stack", return_value=True) as rec:
            rc = u.main(["--apply"])
        rec.assert_called_once()  # pre-flight heal happened
        self.assertEqual(rc, 0)  # no update needed


if __name__ == "__main__":
    unittest.main(verbosity=2)


