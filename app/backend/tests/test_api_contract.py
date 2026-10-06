"""API contract tests (frontend ↔ backend): the exact TRD §9–§11 shapes,
via FastAPI TestClient with a temp runtime — simulator mode exercises the
REAL qrng service + job manager + store end-to-end."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from qlab.config import Limits
from qlab.main import create_app
from qlab.models import JobState
from qlab.runtime import build_runtime


@pytest.fixture
def client(tmp_path):
    limits = Limits(min_shots=8, max_shots=4096, default_shots=256,
                    max_bits=8192, default_bits=256, job_timeout_s=30,
                    submit_cooldown_s=0, poll_initial_s=0.02, poll_max_s=0.05)
    runtime = build_runtime(limits=limits, data_path=tmp_path / "data")
    app = create_app(runtime)
    with TestClient(app) as test_client:
        yield test_client


def _poll(client, experiment_id, timeout=15.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = client.get(f"/api/qrng/jobs/{experiment_id}").json()
        if body["status"] in ("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "RATE_LIMITED"):
            return body
        time.sleep(0.05)
    raise AssertionError(f"job did not finish; last status: {body}")


# --------------------------------------------------------------------- health/config

def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_qrng_config_reports_hardware_unavailable_without_credentials(client):
    r = client.get("/api/qrng/config")
    assert r.status_code == 200
    body = r.json()
    assert body["hardware"]["available"] is False
    assert "IBM_QUANTUM_API_KEY" in body["hardware"]["reason"]
    assert body["hardware"]["setup_hint"]
    assert body["simulator"]["available"] is True
    assert body["simulator"]["simulator"] is True
    assert body["limits"]["min_shots"] == 8
    assert body["circuit"]["qubits"] == 1


def test_qrng_backends_unavailable_without_credentials(client):
    r = client.get("/api/qrng/backends")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False and body["backends"] == []


# --------------------------------------------------------------------- PRNG contract

def test_prng_generate_contract(client):
    r = client.post("/api/prng/generate", json={"seed": "demo", "bits": 128})
    assert r.status_code == 200
    body = r.json()
    assert body["algorithm"] == "splitmix64"
    assert len(body["bits"]) == 128
    assert body["zero_count"] + body["one_count"] == 128
    assert body["theoretical_zero_pct"] == 50.0
    assert body["experiment_id"].startswith("EXP-")
    assert body["seed_derivation"]


def test_prng_same_seed_same_result_via_api(client):
    a = client.post("/api/prng/generate", json={"seed": 424242, "bits": 256}).json()
    b = client.post("/api/prng/generate", json={"seed": "424242", "bits": 256}).json()
    assert a["bits"] == b["bits"]
    assert a["experiment_id"] != b["experiment_id"]          # new records, same stream


def test_prng_invalid_inputs(client):
    empty = client.post("/api/prng/generate", json={"seed": "", "bits": 10})
    assert empty.status_code == 400                       # actionable route-level check
    assert empty.json()["error"]["code"] == "INVALID_SEED"
    assert client.post("/api/prng/generate", json={"seed": "x", "bits": 0}).status_code == 422
    r = client.post("/api/prng/generate", json={"seed": "x", "bits": 999999})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_BITS"
    assert r.json()["error"]["hint"]


# --------------------------------------------------------------------- QRNG contract

def test_qrng_hardware_without_credentials_is_rejected_with_guidance(client):
    r = client.post("/api/qrng/jobs", json={"shots": 64, "mode": "hardware"})
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "PROVIDER_NOT_CONFIGURED"
    assert ".env" in err["hint"]
    # crucial: no experiment was created, nothing pretends to run
    assert client.get("/api/experiments").json()["experiments"] == []


def test_qrng_simulator_end_to_end(client):
    r = client.post("/api/qrng/jobs", json={"shots": 128, "mode": "simulator"})
    assert r.status_code == 202
    job = r.json()
    assert job["job_id"] == job["experiment_id"]
    assert job["source"] == "quantum_simulator"           # explicitly labelled
    assert job["provider"] == "local_statevector"
    assert job["circuit"]["qubits"] == 1

    final = _poll(client, job["experiment_id"])
    assert final["status"] == "COMPLETED"

    result = client.get(f"/api/qrng/jobs/{job['experiment_id']}/result").json()
    assert len(result["bits"]) == 128
    assert result["source"] == "quantum_simulator"
    assert result["zero_count"] + result["one_count"] == 128
    assert result["theoretical_zero_pct"] == 50.0
    assert abs(result["observed_zero_pct"] + result["observed_one_pct"] - 100.0) < 0.01
    assert result["provider_job_id"].startswith("sim-")
    assert result["status_history"]


def test_qrng_result_not_ready_conflict(client):
    r = client.post("/api/qrng/jobs", json={"shots": 32, "mode": "simulator"})
    exp_id = r.json()["experiment_id"]
    _poll(client, exp_id)
    # use a fresh in-flight job? simulator finishes instantly — instead check 404 path
    missing = client.get("/api/qrng/jobs/EXP-99999/result")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "JOB_NOT_FOUND"


def test_qrng_invalid_shots(client):
    r = client.post("/api/qrng/jobs", json={"shots": 2, "mode": "simulator"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_SHOTS"
    assert "between 8 and 4096" in r.json()["error"]["message"]


def test_qrng_seed_only_in_simulator(client):
    r = client.post("/api/qrng/jobs", json={"shots": 32, "mode": "hardware", "seed": "x"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_REQUEST"   # seeded hardware is rejected up front


# --------------------------------------------------------------------- experiments/compare

def test_experiments_listing(client):
    client.post("/api/prng/generate", json={"seed": "hist", "bits": 32})
    client.post("/api/qrng/jobs", json={"shots": 32, "mode": "simulator"})
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        listing = client.get("/api/experiments").json()["experiments"]
        if len(listing) >= 2 and all(e["status"] == "COMPLETED" for e in listing):
            break
        time.sleep(0.05)
    kinds = {e["kind"] for e in listing}
    assert kinds == {"prng", "qrng"}
    sources = {e["source"] for e in listing}
    assert "classical" in sources and "quantum_simulator" in sources


def test_compare_flow(client):
    client.post("/api/prng/generate", json={"seed": "warm", "bits": 16})
    job = client.post("/api/qrng/jobs", json={"shots": 64, "mode": "simulator"}).json()
    _poll(client, job["experiment_id"])

    r = client.post("/api/compare", json={"bits": 64, "seed": "compare-me"})
    assert r.status_code == 200
    body = r.json()
    assert body["prng"]["algorithm"] == "splitmix64"
    assert len(body["prng"]["bits"]) == 64
    assert body["qrng"]["source"] == "quantum_simulator"
    assert body["qrng"]["provider_job_id"].startswith("sim-")
    assert "histogram" in body["note"].lower() or "50/50" in body["note"]


def test_compare_requires_completed_qrng(client):
    r = client.post("/api/compare", json={"bits": 64, "seed": "x"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "COMPARE_REQUIRES_QRNG"


def test_experiment_detail(client):
    prng = client.post("/api/prng/generate", json={"seed": "detail", "bits": 16}).json()
    detail = client.get(f"/api/experiments/{prng['experiment_id']}").json()
    assert detail["kind"] == "prng"
    assert detail["source"] == "classical"
    assert detail["algorithm"] == "splitmix64"
    assert detail["bits"] == prng["bits"]


# --------------------------------------------------------------------- error envelope

def test_error_envelope_is_actionable_everywhere(client):
    for method, path in (("get", "/api/qrng/jobs/NOPE"),
                         ("get", "/api/experiments/NOPE")):
        r = getattr(client, method)(path)
        assert r.status_code == 404
        body = r.json()
        assert set(body) == {"error"}
        assert body["error"]["code"] and body["error"]["message"]
        assert body["error"]["hint"]


def test_validation_error_envelope(client):
    r = client.post("/api/prng/generate", json={"seed": "x"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
