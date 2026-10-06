"""Shared fixtures. Tests are hermetic: no ambient IBM credentials, no
network, temp data dirs."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture(autouse=True)
def hermetic_env(monkeypatch):
    """Remove ambient IBM configuration so tests never depend on real
    credentials or hit the network by accident."""
    for key in (
        "IBM_QUANTUM_API_KEY",
        "IBM_QUANTUM_INSTANCE",
        "IBM_QUANTUM_CHANNEL",
        "IBM_QUANTUM_BACKEND",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr("qlab.config._file_env", lambda: {})
    yield
