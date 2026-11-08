"""updater_core.py - Pure, deterministic logic for OpenShip update detection.

This module contains NO I/O side effects (no HTTP, no subprocess, no filesystem).
It is fully unit-testable in isolation. All the plumbing (network, docker, CLI,
locking, logging, state) lives in openship_updater.py.

OpenShip "emits" update requests through its official release-advisories.json
file (the "UPGRADE-PROMPT GATE"), pinned to a release tag:

    https://raw.githubusercontent.com/oblien/openship/<tag>/release-advisories.json

A newer release alone does NOT prompt for an upgrade; only an *advisory* entry
does. Each advisory has::

    { id, severity: critical|recommended|info, announce, affects (semver range),
      title, message, modes?: [desktop|selfhosted|cloud], action? }

This module evaluates whether an advisory applies to the installed version and
whether an update should be triggered, according to a configurable policy.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Semver helpers
# ---------------------------------------------------------------------------

_SEMVER_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)(?:[-+]([0-9A-Za-z.-]+))?$")


@dataclass(frozen=True)
class Version:
    major: int
    minor: int
    patch: int
    prerelease: str = ""

    @property
    def core(self) -> Tuple[int, int, int]:
        return (self.major, self.minor, self.patch)

    def __str__(self) -> str:
        base = "{}.{}.{}".format(self.major, self.minor, self.patch)
        return "{}-{}".format(base, self.prerelease) if self.prerelease else base


def parse_version(raw: str) -> Version:
    """Parse a version string such as 'v0.7.2', '0.6.9' or '1.2.3-rc1'.

    Raises ValueError when the string cannot be parsed.
    """
    if raw is None:
        raise ValueError("version is None")
    text = str(raw).strip()
    if not text:
        raise ValueError("version is empty")
    m = _SEMVER_RE.match(text)
    if not m:
        m = _SEMVER_RE.match(text.split()[0])
    if not m:
        raise ValueError("invalid version string: {!r}".format(raw))
    return Version(
        major=int(m.group(1)),
        minor=int(m.group(2)),
        patch=int(m.group(3)),
        prerelease=m.group(4) or "",
    )


def compare_versions(a: str, b: str) -> int:
    """Compare two version strings.

    Returns -1 if a < b, 0 if equal, 1 if a > b.
    A release (no prerelease) is newer than any prerelease of the same core.
    """
    va = parse_version(a)
    vb = parse_version(b)
    if va.core != vb.core:
        return -1 if va.core < vb.core else 1
    if va.prerelease == vb.prerelease:
        return 0
    if va.prerelease == "":
        return 1
    if vb.prerelease == "":
        return -1
    return -1 if va.prerelease < vb.prerelease else 1


# ---------------------------------------------------------------------------
# Semver range satisfaction (for the advisory "affects" field)
# ---------------------------------------------------------------------------

_RANGE_RE = re.compile(r"^\s*(<=|>=|<|>|=|==)?\s*v?(\d+)\.(\d+)\.(\d+)\s*$")


def version_satisfies(installed: str, range_spec: str) -> bool:
    """Return True if `installed` satisfies a simple semver range.

    Supported operators: <=, >=, <, >, =/==, or none (exact match). A
    comma-separated list is treated as a logical AND, e.g. ">=0.6.0,<0.7.0".
    An empty/blank range matches everything (advisory with no affects).
    """
    parts = [p for p in str(range_spec).split(",") if p.strip()]
    if not parts:
        return True  # no constraint -> applies to all
    for part in parts:
        m = _RANGE_RE.match(part.strip())
        if not m:
            raise ValueError(
                "invalid semver range {!r} (part {!r})".format(range_spec, part)
            )
        op = m.group(1) or "="
        bound = "{}.{}.{}".format(m.group(2), m.group(3), m.group(4))
        cmp_res = compare_versions(installed, bound)
        if op == "<=":
            ok = cmp_res <= 0
        elif op == ">=":
            ok = cmp_res >= 0
        elif op == "<":
            ok = cmp_res < 0
        elif op == ">":
            ok = cmp_res > 0
        else:  # "=" or "=="
            ok = cmp_res == 0
        if not ok:
            return False
    return True


# ---------------------------------------------------------------------------
# Advisory model & evaluation
# ---------------------------------------------------------------------------

SEVERITY_ORDER = {"info": 0, "recommended": 1, "critical": 2}


@dataclass
class Advisory:
    id: str
    severity: str
    affects: str
    title: str = ""
    message: str = ""
    announce: bool = False
    modes: List[str] = field(default_factory=list)
    action: Dict = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Dict) -> "Advisory":
        return cls(
            id=d.get("id", ""),
            severity=d.get("severity", "info"),
            affects=d.get("affects", ""),
            title=d.get("title", ""),
            message=d.get("message", ""),
            announce=bool(d.get("announce", False)),
            modes=list(d.get("modes") or []),
            action=dict(d.get("action") or {}),
        )

    def applies_to(self, installed: str, modes: Optional[List[str]] = None) -> bool:
        """Whether this advisory concerns `installed` and the given mode(s)."""
        if modes is not None and self.modes:
            if not any(m in self.modes for m in modes):
                return False
        try:
            return version_satisfies(installed, self.affects)
        except ValueError:
            return False


def evaluate_advisories(
    installed: str,
    advisories: List[Dict],
    modes: Optional[List[str]] = None,
) -> List[Advisory]:
    """Return the advisories that apply to the installed version/mode."""
    parsed = [Advisory.from_dict(a) for a in advisories if isinstance(a, dict)]
    return [a for a in parsed if a.applies_to(installed, modes)]


# ---------------------------------------------------------------------------
# Update decision
# ---------------------------------------------------------------------------

@dataclass
class UpdateDecision:
    should_update: bool
    reason: str
    severity: str = "info"
    installed_version: Optional[str] = None
    latest_version: Optional[str] = None
    newer_available: bool = False
    advisory: Optional[Advisory] = None


def decide_update(
    installed: str,
    latest: str,
    advisories: List[Dict],
    policy: str = "advisory",
    modes: Optional[List[str]] = None,
) -> UpdateDecision:
    """Decide whether to trigger an update.

    Policies:
      - "advisory" (default): update when an applicable advisory with severity
        recommended or critical exists.
      - "critical": update only when an applicable critical advisory exists.
      - "latest": update whenever a newer release exists (advisory or not).
      - "off": never update (detection only).
    """
    newer_available = compare_versions(latest, installed) > 0
    applicable = evaluate_advisories(installed, advisories, modes)
    critical = [a for a in applicable if a.severity == "critical"]
    actionable = [a for a in applicable if a.severity in ("recommended", "critical")]

    base = UpdateDecision(
        should_update=False,
        reason="",
        installed_version=installed,
        latest_version=latest,
        newer_available=newer_available,
    )

    if policy == "off":
        base.reason = "policy is 'off'"
        return base

    if policy == "latest":
        if newer_available:
            base.should_update = True
            base.reason = "newer release available ({} -> {})".format(installed, latest)
            base.severity = "recommended"
            base.advisory = actionable[0] if actionable else None
        else:
            base.reason = "already up to date"
        return base

    if policy == "critical":
        if critical:
            a = critical[0]
            base.should_update = True
            base.reason = "critical advisory applies: {}".format(a.id)
            base.severity = "critical"
            base.advisory = a
        else:
            base.reason = "no critical advisory applies"
        return base

    # Default: "advisory"
    if actionable:
        a = max(actionable, key=lambda x: SEVERITY_ORDER.get(x.severity, 0))
        base.should_update = True
        base.reason = "advisory applies: {} ({})".format(a.id, a.severity)
        base.severity = a.severity
        base.advisory = a
    else:
        base.reason = "no applicable advisory"
    return base


# ---------------------------------------------------------------------------
# Version extraction helpers
# ---------------------------------------------------------------------------

_VERSION_TOKEN_RE = re.compile(r"v?(\d+\.\d+\.\d+)")


def extract_version_from_text(text: str) -> Optional[str]:
    """Extract the first semver-looking token from arbitrary output.

    Returns the bare version (no leading 'v') or None when nothing matches.
    """
    if not text:
        return None
    m = _VERSION_TOKEN_RE.search(str(text))
    return m.group(1) if m else None


def extract_version_from_image(image: str) -> Optional[str]:
    """Extract the version from a Docker image ref.

    Example: 'ghcr.io/oblien/openship-api:0.6.9' -> '0.6.9'.
    Returns None when the ref has no parseable version tag (e.g. ':latest').
    """
    if not image:
        return None
    tag = image.rsplit(":", 1)[-1] if ":" in image else ""
    if not tag:
        return None
    try:
        return str(parse_version(tag))
    except ValueError:
        return None


