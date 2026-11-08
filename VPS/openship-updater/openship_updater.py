#!/usr/bin/env python3
"""openship_updater.py - Detect OpenShip update requests and trigger updates.

Runs on the VPS (Ubuntu 24.04 / ARM64), orchestrated by systemd. Uses only the
Python standard library (no pip dependencies).

Usage:
  python3 openship_updater.py --check     # detect only (dry-run), no changes
  python3 openship_updater.py --apply     # detect + update if applicable (systemd)
  python3 openship_updater.py --force     # apply the update regardless of detection
  python3 openship_updater.py --reconcile # only self-heal the stack (docker compose up -d)

After every update attempt the script ALWAYS reconciles the OpenShip Compose
stack (`cd ~/.openship/compose && docker compose up -d`) so that an update that
aborts mid-way can never leave the `api`/`edge` containers stuck in `Created`
(lesson-learned §5).

Exit codes:
  0  no update needed, or update applied successfully
  1  error / update failed
  2  update available but not applied (used by --check to signal "actionable")
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import Dict, List, Optional

from updater_core import (
    compare_versions,
    decide_update,
    evaluate_advisories,
    extract_version_from_image,
    extract_version_from_text,
)

# ---------------------------------------------------------------------------
# Configuration (overridable via environment variables)
# ---------------------------------------------------------------------------

OPENSHIP_BIN = os.environ.get("OPENSHIP_BIN", "/home/ubuntu/.openship/bin/openship")
GITHUB_API_LATEST = "https://api.github.com/repos/oblien/openship/releases/latest"
ADVISORY_URL_TMPL = (
    "https://raw.githubusercontent.com/oblien/openship/{tag}/release-advisories.json"
)
UPDATE_POLICY = os.environ.get("UPDATE_POLICY", "advisory")
UPDATE_MODES = [m for m in os.environ.get("UPDATE_MODES", "selfhosted").split(",") if m]
STATE_FILE = os.environ.get("STATE_FILE", "/home/ubuntu/openship-updater/state.json")
LOCK_FILE = os.environ.get("LOCK_FILE", "/home/ubuntu/openship-updater/openship-updater.lock")
LOG_FILE = os.environ.get("LOG_FILE", "/home/ubuntu/openship-updater/openship-updater.log")
USER_AGENT = "openship-updater/1.0 (+https://github.com/oblien/openship)"
HTTP_TIMEOUT = 20
UPDATE_TIMEOUT = 1800  # seconds - `openship update` also runs `openship up`
COMPOSE_DIR = os.environ.get("COMPOSE_DIR", "/home/ubuntu/.openship/compose")
RECONCILE_TIMEOUT = 900  # seconds - `docker compose up -d` on the core stack
RECONCILE_SETTLE_SECONDS = 3  # let Docker settle after `up -d` before re-checking

_lock_fd = None


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(msg: str, level: str = "INFO") -> None:
    line = "{} [{}] {}".format(time.strftime("%Y-%m-%dT%H:%M:%S%z"), level, msg)
    print(line, file=sys.stderr)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except OSError:
        pass


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def http_get_json(url: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/vnd.github+json",
        },
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ---------------------------------------------------------------------------
# Detection primitives
# ---------------------------------------------------------------------------

def get_latest_tag() -> str:
    data = http_get_json(GITHUB_API_LATEST)
    tag = str(data.get("tag_name", "")).strip()
    if not tag:
        raise RuntimeError("latest release has no tag_name")
    return tag


def get_advisories(tag: str) -> List[Dict]:
    url = ADVISORY_URL_TMPL.format(tag=tag)
    try:
        data = http_get_json(url)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            log("no release-advisories.json for tag {} (404)".format(tag), "WARN")
            return []
        raise
    return list(data.get("advisories", []) or [])


def _version_from_cli() -> Optional[str]:
    for flag in ("--version", "-V"):
        try:
            out = subprocess.run(
                [OPENSHIP_BIN, flag],
                capture_output=True,
                text=True,
                timeout=30,
            ).stdout.strip()
            v = extract_version_from_text(out)
            if v:
                return v
        except (OSError, subprocess.SubprocessError):
            continue
    return None


def _version_from_docker() -> Optional[str]:
    try:
        out = subprocess.run(
            ["docker", "ps", "--format", "{{.Image}}"],
            capture_output=True,
            text=True,
            timeout=30,
        ).stdout
        for line in out.splitlines():
            if "openship-api" in line:
                v = extract_version_from_image(line.strip())
                if v:
                    return v
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def get_installed_version() -> str:
    v = _version_from_cli() or _version_from_docker()
    if not v:
        raise RuntimeError("could not determine installed OpenShip version")
    return v


# ---------------------------------------------------------------------------
# State & locking
# ---------------------------------------------------------------------------

def load_state() -> Dict:
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(state: Dict) -> None:
    try:
        os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(state, f, indent=2)
        os.replace(tmp, STATE_FILE)
    except OSError as e:
        log("could not save state: {}".format(e), "WARN")


def acquire_lock() -> bool:
    global _lock_fd
    try:
        import fcntl

        os.makedirs(os.path.dirname(LOCK_FILE), exist_ok=True)
        fd = open(LOCK_FILE, "w")
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _lock_fd = fd
        return True
    except OSError:
        if _lock_fd is not None:
            _lock_fd.close()
            _lock_fd = None
        return False


def release_lock() -> None:
    global _lock_fd
    if _lock_fd is None:
        return
    try:
        import fcntl

        fcntl.flock(_lock_fd, fcntl.LOCK_UN)
    finally:
        _lock_fd.close()
        _lock_fd = None


# ---------------------------------------------------------------------------
# Update application
# ---------------------------------------------------------------------------

def run_update() -> bool:
    log("running: {} update".format(OPENSHIP_BIN))
    try:
        proc = subprocess.run(
            [OPENSHIP_BIN, "update"],
            capture_output=True,
            text=True,
            timeout=UPDATE_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        log("openship update timed out after {}s".format(UPDATE_TIMEOUT), "ERROR")
        return False
    if proc.returncode != 0:
        tail = (proc.stderr or "").strip()[-2000:]
        log("openship update failed (rc={}): {}".format(proc.returncode, tail), "ERROR")
        return False
    log("openship update succeeded")
    return True


def verify_update(installed_before: str) -> bool:
    try:
        installed_after = get_installed_version()
    except RuntimeError as e:
        log("post-update version check failed: {}".format(e), "ERROR")
        return False
    if compare_versions(installed_after, installed_before) > 0:
        log("version bumped: {} -> {}".format(installed_before, installed_after))
        return True
    log("version did not bump: still {}".format(installed_after), "WARN")
    return False


def cleanup_old_images(previous_version: str) -> None:
    """Best-effort cleanup: prune dangling images + remove the previous
    version's tagged OpenShip images (safe - we know it was replaced)."""
    if not previous_version:
        return
    try:
        subprocess.run(["docker", "image", "prune", "-f"], capture_output=True, timeout=300)
        out = subprocess.run(
            ["docker", "images", "--format", "{{.Repository}}:{{.Tag}}"],
            capture_output=True,
            text=True,
            timeout=60,
        ).stdout
        suffix = ":{}".format(previous_version)
        for line in out.splitlines():
            ref = line.strip()
            if "openship" in ref and ref.endswith(suffix):
                r = subprocess.run(["docker", "rmi", ref], capture_output=True, timeout=300)
                if r.returncode == 0:
                    log("removed old image {}".format(ref))
                else:
                    log("could not remove {}: {}".format(ref, (r.stderr or "").strip()[-200:]), "WARN")
    except (OSError, subprocess.SubprocessError) as e:
        log("image cleanup failed: {}".format(e), "WARN")


# ---------------------------------------------------------------------------
# Stack reconciliation (self-heal after a half-applied update)
# ---------------------------------------------------------------------------
#
# lesson-learned §5: `openship update` updates the CLI and then recreates the
# Compose stack. While the API container is being recreated the CLI can no
# longer reach localhost:4000 and the command aborts mid-way, leaving the new
# `api` + `edge` containers in the `Created` state (never started). The edge
# then stops listening on :80/:443 and every hosted site goes down (HTTP 000).
#
# The reliable repair (lesson-learned §5) is:
#     cd ~/.openship/compose && docker compose up -d
# which starts any `Created` container and recreates drifted ones. It is
# idempotent and data-safe: named volumes are never touched and we never run
# `down`/`rm`. We therefore run it automatically right after every update
# attempt (and as a pre-flight self-heal), and expose it via `--reconcile`.


def list_stuck_containers() -> List[str]:
    """Return OpenShip containers stuck in `Created`/`Exited` state.

    This is the `docker ps -a` control: a container stuck in `Created` was
    never started (the §5 failure mode), while `Exited` means it died.
    """
    try:
        out = subprocess.run(
            [
                "docker",
                "ps",
                "-a",
                "--filter",
                "name=openship-",
                "--format",
                "{{.Names}}\t{{.Status}}",
            ],
            capture_output=True,
            text=True,
            timeout=60,
        ).stdout
    except (OSError, subprocess.SubprocessError) as e:
        log("could not list containers: {}".format(e), "WARN")
        return []
    stuck = []
    for line in (out or "").splitlines():
        name, _, status = line.partition("\t")
        name = name.strip()
        status = status.strip()
        low = status.lower()
        if name and (low.startswith("created") or low.startswith("exited")):
            stuck.append("{} ({})".format(name, status))
    return stuck


def core_stack_status() -> Dict[str, str]:
    """Return {container_name: status} for the OpenShip core Compose stack.

    Scoped with `docker compose ps -a` so app containers
    (`openship-<project>-<service>`) never pollute the pass/fail decision of
    the core stack (api / dashboard / edge / postgres / redis).
    """
    compose_file = os.path.join(COMPOSE_DIR, "docker-compose.yml")
    if not os.path.isfile(compose_file):
        log("compose file not found: {}".format(compose_file), "WARN")
        return {}
    try:
        proc = subprocess.run(
            ["docker", "compose", "ps", "-a", "--format", "{{.Name}}\t{{.Status}}"],
            cwd=COMPOSE_DIR,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (OSError, subprocess.SubprocessError) as e:
        log("could not read compose stack status: {}".format(e), "WARN")
        return {}
    result: Dict[str, str] = {}
    for line in (proc.stdout or "").splitlines():
        name, _, status = line.partition("\t")
        name = name.strip()
        if name:
            result[name] = status.strip()
    return result


def _stuck_core_names() -> List[str]:
    """Names of core-stack containers left in `Created`/`Exited` state (§5 failure)."""
    return [
        name
        for name, status in core_stack_status().items()
        if status.lower().startswith("created") or status.lower().startswith("exited")
    ]


def _remove_container(name: str) -> None:
    """Force-remove a container (best effort).

    Only ever called on a core container that is already `Created`/`Exited`, so
    it is safe: a `Created` container never ran and all persistent state lives
    in named volumes (never removed without `-v`).
    """
    try:
        subprocess.run(
            ["docker", "rm", "-f", name],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (OSError, subprocess.SubprocessError) as e:
        log("reconcile: could not remove {}: {}".format(name, e), "WARN")


def _compose_up() -> bool:
    """Run `docker compose up -d` in the OpenShip compose dir (lesson-learned §5).

    Idempotent: on a healthy stack it leaves running containers untouched.
    """
    compose_file = os.path.join(COMPOSE_DIR, "docker-compose.yml")
    if not os.path.isfile(compose_file):
        log("reconcile aborted: {} not found".format(compose_file), "ERROR")
        return False
    log("reconcile: running 'docker compose up -d' in {}".format(COMPOSE_DIR))
    try:
        proc = subprocess.run(
            ["docker", "compose", "up", "-d"],
            cwd=COMPOSE_DIR,
            capture_output=True,
            text=True,
            timeout=RECONCILE_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        log(
            "reconcile: docker compose up -d timed out after {}s".format(
                RECONCILE_TIMEOUT
            ),
            "ERROR",
        )
        return False
    except (OSError, subprocess.SubprocessError) as e:
        log("reconcile: docker compose up -d could not run: {}".format(e), "ERROR")
        return False
    if proc.returncode != 0:
        tail = ((proc.stderr or "") + (proc.stdout or "")).strip()[-2000:]
        log(
            "reconcile: docker compose up -d failed (rc={}): {}".format(
                proc.returncode, tail
            ),
            "ERROR",
        )
        return False
    return True


def reconcile_stack(force: bool = False) -> bool:
    """Self-heal the OpenShip stack after a (possibly half-applied) update.

    Phase 1 runs the reliable lesson-learned §5 command
    (`cd ~/.openship/compose && docker compose up -d`), which starts any core
    container left in `Created` and restarts `Exited` ones. Phase 2 (fallback)
    mirrors the rest of the documented repair: if the stack is still stuck it
    force-removes the stuck core containers and re-runs compose (safe - a stuck
    container is already broken and all state lives in named volumes).

    When the stack is already healthy and `force` is False this is a no-op, so
    production sites are never disturbed.

    Returns True when no core container is left in `Created`/`Exited` state.
    """
    stuck = _stuck_core_names()
    if not stuck and not force:
        log("reconcile: core stack healthy, nothing to do")
        return True

    if stuck:
        log(
            "reconcile: stuck core containers detected: {}".format(", ".join(stuck)),
            "WARN",
        )
    # Surface any *other* OpenShip container stuck (apps), for visibility only.
    others = [
        c
        for c in list_stuck_containers()
        if not any(c.startswith(n + " ") for n in stuck)
    ]
    if others:
        log(
            "reconcile: note - other OpenShip containers not running: {}".format(
                ", ".join(others)
            ),
            "WARN",
        )

    # Phase 1: the reliable §5 command.
    up_ok = _compose_up()
    time.sleep(RECONCILE_SETTLE_SECONDS)
    remaining = _stuck_core_names()
    if up_ok and not remaining:
        log("reconcile: core stack is up (no Created/Exited container)")
        return True

    # Phase 2 (fallback): remove the stuck core containers, then retry.
    log(
        "reconcile: fallback - removing stuck core containers and retrying: {}".format(
            ", ".join(remaining) or "(compose up reported an error)"
        ),
        "WARN",
    )
    for name in remaining:
        _remove_container(name)
    _compose_up()
    time.sleep(RECONCILE_SETTLE_SECONDS)
    remaining = _stuck_core_names()
    if remaining:
        log(
            "reconcile: core containers STILL not running after fallback: {}".format(
                ", ".join(remaining)
            ),
            "ERROR",
        )
        return False
    log("reconcile: core stack is up (no Created/Exited container)")
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="OpenShip update detector & applier")
    parser.add_argument(
        "--check",
        dest="apply",
        action="store_false",
        help="detect only (dry-run); do not apply the update",
    )
    parser.add_argument(
        "--apply",
        dest="apply",
        action="store_true",
        help="detect and update if applicable",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="apply the update regardless of detection result",
    )
    parser.add_argument(
        "--reconcile",
        action="store_true",
        help="only reconcile the OpenShip stack (start any Created/Exited "
        "container) and exit; never triggers an update",
    )
    parser.add_argument("--policy", default=None, help="override UPDATE_POLICY")
    parser.set_defaults(apply=False)
    args = parser.parse_args(argv)

    # `--reconcile`: standalone self-heal, never triggers an update.
    if args.reconcile:
        if not acquire_lock():
            log("another instance is already running; exiting", "WARN")
            return 0
        try:
            ok = reconcile_stack(force=True)
            print("RECONCILE: ok={}".format(ok))
            return 0 if ok else 1
        finally:
            release_lock()

    policy = args.policy or UPDATE_POLICY
    dry_run = not args.apply and not args.force

    if not args.force and not acquire_lock():
        log("another instance is already running; exiting", "WARN")
        return 0

    try:
        # Pre-flight self-heal: repair a leftover §5 state (a previous run that
        # was killed between `openship update` and reconciliation). No-op on a
        # healthy stack, so production sites are never disturbed.
        if not dry_run and _stuck_core_names():
            log(
                "pre-flight: repairing a leftover stuck stack from a previous run",
                "WARN",
            )
            reconcile_stack()

        installed = get_installed_version()
        log("installed OpenShip version: {}".format(installed))

        latest = get_latest_tag()
        log("latest release tag: {}".format(latest))

        advisories = get_advisories(latest)
        log("advisories fetched: {} for tag {}".format(len(advisories), latest))

        decision = decide_update(
            installed, latest, advisories, policy=policy, modes=UPDATE_MODES
        )
        log(
            "decision: should_update={} reason={!r} severity={}".format(
                decision.should_update, decision.reason, decision.severity
            )
        )

        if args.force:
            decision.should_update = True
            decision.reason = "--force"

        state = load_state()
        state["last_checked"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        state["installed_version"] = installed
        state["latest_version"] = latest
        state["policy"] = policy
        state["advisory_count"] = len(advisories)
        state["applicable_advisories"] = [
            a.id for a in evaluate_advisories(installed, advisories, UPDATE_MODES)
        ]

        if not decision.should_update:
            state["last_decision"] = "no_update"
            save_state(state)
            print("NO_UPDATE: {}".format(decision.reason))
            return 0

        print("UPDATE_REQUESTED: {}".format(decision.reason))
        state["last_decision"] = "update_requested"
        save_state(state)

        if dry_run:
            log("dry-run: update requested but NOT applied")
            return 2  # actionable, but not applied

        state["last_result"] = "in_progress"
        save_state(state)

        update_ok = run_update()
        # ALWAYS reconcile after the update attempt: `openship update` can abort
        # mid-way and leave the new api/edge containers in `Created` (§5), which
        # brings the edge (and every hosted site) down. Idempotent when healthy.
        reconcile_ok = reconcile_stack()
        state["reconcile_ok"] = reconcile_ok

        if not update_ok and not reconcile_ok:
            log("update failed and the stack could not be reconciled", "ERROR")
            state["last_result"] = "failed"
            save_state(state)
            return 1
        if not update_ok:
            log(
                "`openship update` reported an error but the stack was "
                "reconciled; verifying version",
                "WARN",
            )

        ok = verify_update(installed)
        if ok and reconcile_ok:
            cleanup_old_images(installed)
            state["last_result"] = "updated"
            state["updated_from"] = installed
            try:
                state["updated_to"] = get_installed_version()
            except RuntimeError:
                pass
        elif ok and not reconcile_ok:
            state["last_result"] = "updated_but_reconcile_failed"
            state["updated_from"] = installed
            try:
                state["updated_to"] = get_installed_version()
            except RuntimeError:
                pass
        else:
            state["last_result"] = "update_ran_but_version_unchanged"
        save_state(state)
        print(
            "UPDATE_APPLIED: {} -> {} (ok={}, reconcile_ok={})".format(
                installed, state.get("updated_to", "?"), ok, reconcile_ok
            )
        )
        return 0 if (ok and reconcile_ok) else 1

    except Exception as e:
        log("error: {}".format(e), "ERROR")
        return 1
    finally:
        if not args.force:
            release_lock()


if __name__ == "__main__":
    sys.exit(main())


