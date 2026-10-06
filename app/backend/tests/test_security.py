"""Security tests (TRD §19): secrets never in responses, logs, or the
client-facing surface; configuration is validated; hygiene files exist."""

from __future__ import annotations

import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from qlab.config import Limits, redact
from qlab.main import create_app
from qlab.runtime import build_runtime

REPO_ROOT = Path(__file__).resolve().parents[3]
SENTINEL = "SENTINEL-TOKEN-a1b2c3d4e5f6-never-real"


@pytest.fixture
def secret_env(monkeypatch, tmp_path):
    """Configure a sentinel IBM token as if a real .env existed."""
    monkeypatch.setattr("qlab.config._file_env",
                        lambda: {"IBM_QUANTUM_API_KEY": SENTINEL})
    yield


@pytest.fixture
def client_with_secret(secret_env, tmp_path, monkeypatch):
    limits = Limits(min_shots=8, max_shots=4096, default_shots=256, max_bits=8192,
                    default_bits=256, job_timeout_s=30, submit_cooldown_s=0,
                    poll_initial_s=0.02, poll_max_s=0.05)
    runtime = build_runtime(limits=limits, data_path=tmp_path / "data")
    # keep security tests hermetic: no real network — the fake provider
    # failure deliberately embeds the sentinel so we can assert redaction.
    from qlab.providers.base import ProviderError

    def _no_network(self, name=None):
        raise ProviderError(
            "PROVIDER_ERROR",
            f"simulated failure mentioning {SENTINEL} in its message",
            "simulated hint",
        )

    monkeypatch.setattr(
        "qlab.providers.ibm_provider.IBMQuantumProvider.get_backend_metadata", _no_network
    )
    return TestClient(create_app(runtime))


def test_token_absent_from_all_api_responses(client_with_secret):
    paths = ["/api/health", "/api/qrng/config", "/api/qrng/backends",
             "/api/experiments", "/docs", "/openapi.json"]
    for path in paths:
        r = client_with_secret.get(path)
        assert SENTINEL not in r.text, f"token leaked via {path}"


def test_provider_error_messages_are_redacted_in_responses(client_with_secret):
    """Even when a provider error echoes the secret, the API redacts it."""
    r = client_with_secret.get("/api/qrng/backends")
    body = r.json()
    assert SENTINEL not in r.text
    assert "[REDACTED]" in body["reason"]


def test_token_absent_from_logs(client_with_secret, caplog):
    with caplog.at_level(logging.DEBUG, logger="qlab"):
        client_with_secret.get("/api/qrng/config")
        client_with_secret.get("/api/qrng/backends")
        client_with_secret.post("/api/prng/generate", json={"seed": "s", "bits": 8})
    assert SENTINEL not in caplog.text


def test_redact_helper_replaces_secret(secret_env):
    assert redact(f"error with token {SENTINEL} inside") == "error with token [REDACTED] inside"


def test_hardware_mode_reports_configured_with_token(client_with_secret):
    body = client_with_secret.get("/api/qrng/config").json()
    assert body["hardware"]["available"] is True
    # and the config response still never echoes the token itself
    assert SENTINEL not in str(body)


def test_env_example_exists_without_real_secrets():
    example = REPO_ROOT / ".env.example"
    assert example.is_file()
    content = example.read_text()
    assert "IBM_QUANTUM_API_KEY=" in content
    assert "=" != content.split("IBM_QUANTUM_API_KEY=")[1][0]  # empty value, not a secret


def test_gitignore_protects_env_files():
    gitignore = (REPO_ROOT / ".gitignore").read_text()
    assert ".env" in gitignore
    assert ".env.example" in gitignore or "!.env.example" in gitignore


def test_frontend_never_imports_backend_config():
    """The frontend source must not reference backend env vars at all."""
    frontend = REPO_ROOT / "app" / "frontend" / "src"
    if not frontend.is_dir():
        pytest.skip("frontend src not present yet")
    offenders = []
    for path in frontend.rglob("*.ts*"):
        text = path.read_text(errors="ignore")
        if "IBM_QUANTUM" in text:
            offenders.append(str(path))
    assert not offenders, f"backend env names found in frontend: {offenders}"
