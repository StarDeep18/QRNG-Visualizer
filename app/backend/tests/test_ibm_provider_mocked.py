"""Mocked IBM Quantum provider lifecycle (integration).

The real SDK classes are replaced with fakes that reproduce the exact
call surfaces used by IBMQuantumProvider (QiskitRuntimeService,
SamplerV2, RuntimeJobV2). Result payloads are REAL qiskit BitArray
containers, so bit extraction is exercised with genuine SDK data
structures. No network, no credentials, no fabricated success paths.
"""

from __future__ import annotations

import threading
import time
from typing import Optional

import pytest
from qiskit.primitives.containers import BitArray, DataBin, PubResult

from qlab.config import IBMConfig, Limits
from qlab.models import JobState, Mode
from qlab.providers.base import ProviderError, ProviderNotConfigured, ProviderRateLimited
from qlab.providers.ibm_provider import IBMQuantumProvider
from qlab.services.experiment_service import ExperimentStore
from qlab.services.job_manager import JobManager
from qlab.services.qrng_service import QrngService

FAKE_TOKEN = "fake-token-for-mocked-tests-only"
CONFIGURED = IBMConfig(api_key=FAKE_TOKEN, instance=None,
                       channel="ibm_quantum_platform", pinned_backend=None)
NOT_CONFIGURED = IBMConfig(api_key=None, instance=None,
                           channel="ibm_quantum_platform", pinned_backend=None)


class FakeConfiguration:
    def __init__(self, simulator=False, n_qubits=7):
        self.simulator = simulator
        self.n_qubits = n_qubits


class FakeStatus:
    def __init__(self, operational=True, pending_jobs=0, status_msg="online"):
        self.operational = operational
        self.pending_jobs = pending_jobs
        self.status_msg = status_msg


class FakeBackend:
    def __init__(self, name, pending=0):
        self.name = name
        self._config = FakeConfiguration()
        self._status = FakeStatus(pending_jobs=pending)

    def configuration(self):
        return self._config

    def status(self):
        return self._status


class FakeJob:
    """Scripted RuntimeJobV2: status() walks `script`, repeating the last."""

    def __init__(self, job_id, script, bits):
        self._id = job_id
        self._script = list(script) or ["DONE"]
        self._i = 0
        self._bits = bits

    def job_id(self):
        return self._id

    def status(self):
        value = self._script[min(self._i, len(self._script) - 1)]
        self._i += 1
        return _St(value)

    def error_message(self):
        return "simulated provider failure (QPU error)"

    def result(self):
        ba = BitArray.from_samples(list(self._bits))
        return [PubResult(DataBin(c=ba))]

    def metrics(self):
        return {"timestamps": {"created": "2026-10-06T12:00:00Z",
                               "running": "2026-10-06T12:00:05Z",
                               "finished": "2026-10-06T12:00:09Z"}}

    def creation_date(self):
        return "2026-10-06T12:00:00Z"


class _St:
    def __init__(self, name):
        self.name = name


class FakeSamplerV2:
    """Replaces qiskit_ibm_runtime.SamplerV2. Configurable via class knobs."""
    fail_with: Optional[Exception] = None
    script = ["VALIDATING", "QUEUED", "RUNNING", "DONE"]
    bits = "0110" * 16

    def __init__(self, mode=None):
        self._backend = mode

    def run(self, pubs, shots=None):
        if FakeSamplerV2.fail_with is not None:
            raise FakeSamplerV2.fail_with
        job = FakeJob(f"fake-job-{int(time.time() * 1000) % 100000}",
                      list(FakeSamplerV2.script), FakeSamplerV2.bits[:shots])
        FAKE_JOBS[job.job_id()] = job
        return job


class FakeService:
    def __init__(self, channel=None, token=None, instance=None):
        if token == "reject-me":
            from qiskit_ibm_runtime.api.exceptions import RequestsApiError
            raise RequestsApiError("Invalid token", status_code=401)
        self._backends = [FakeBackend("ibm_first", pending=2),
                          FakeBackend("ibm_second", pending=9)]

    def backends(self, simulator=False, operational=True):
        return [b for b in self._backends
                if b.configuration().simulator is False or simulator]

    def backend(self, name):
        for b in self._backends:
            if b.name == name:
                return b
        from qiskit_ibm_runtime.api.exceptions import RequestsApiError
        raise RequestsApiError(f"Backend not found: {name}", status_code=404)

    def job(self, job_id):
        job = FAKE_JOBS.get(job_id)
        if job is None:
            from qiskit_ibm_runtime.api.exceptions import RequestsApiError
            raise RequestsApiError("Job not found", status_code=404)
        return job


FAKE_JOBS: dict[str, FakeJob] = {}


@pytest.fixture
def mocked_sdk(monkeypatch):
    FakeSamplerV2.fail_with = None
    FakeSamplerV2.script = ["VALIDATING", "QUEUED", "RUNNING", "DONE"]
    FakeSamplerV2.bits = "0110" * 16
    FAKE_JOBS.clear()
    monkeypatch.setattr("qiskit_ibm_runtime.QiskitRuntimeService", FakeService)
    monkeypatch.setattr("qiskit_ibm_runtime.SamplerV2", FakeSamplerV2)
    monkeypatch.setattr("qlab.providers.ibm_provider.transpile",
                        lambda circuit, backend=None, optimization_level=1: circuit)
    yield
    FakeSamplerV2.fail_with = None


def _fast_limits(**over):
    base = dict(min_shots=8, max_shots=4096, default_shots=256, max_bits=8192,
                default_bits=256, job_timeout_s=30, submit_cooldown_s=0,
                poll_initial_s=0.02, poll_max_s=0.05)
    base.update(over)
    return Limits(**base)


def _build(config: IBMConfig):
    store = ExperimentStore.__new__(ExperimentStore)          # temp-dir store
    import pathlib, tempfile
    tmp = tempfile.mkdtemp()
    store.__init__(pathlib.Path(tmp))
    provider = IBMQuantumProvider(config_loader=lambda: config)
    limits = _fast_limits()
    jobs = JobManager(store, limits)
    qrng = QrngService(store, jobs, {"ibm_quantum": provider}, limits)
    return store, provider, jobs, qrng, limits


def _wait_terminal(qrng, experiment_id, timeout=10.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        exp = qrng.get(experiment_id)
        if exp.status in (JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED,
                          JobState.TIMED_OUT, JobState.RATE_LIMITED):
            return exp
        time.sleep(0.02)
    raise AssertionError("job did not reach a terminal state in time")


# --------------------------------------------------------------------- happy path

def test_full_hardware_lifecycle_with_real_result_parsing(mocked_sdk):
    store, provider, jobs, qrng, limits = _build(CONFIGURED)
    exp = qrng.create_job(shots=64, mode=Mode.HARDWARE, backend="ibm_first")

    assert exp.provider == "ibm_quantum"
    assert exp.mode is Mode.HARDWARE
    assert exp.source == "quantum_hardware"

    done = _wait_terminal(qrng, exp.id)
    assert done.status is JobState.COMPLETED
    assert done.backend == "ibm_first"
    assert done.provider_job_id and done.provider_job_id.startswith("fake-job-")
    assert done.bits == "0110" * 16
    assert done.zero_count == 32 and done.one_count == 32
    assert done.transpiled_ops == ["h", "measure"]
    assert done.provider_metadata.get("provider_timestamps", {}).get("running")
    states = [h["state"] for h in done.status_history]
    for expected in ("CREATED", "VALIDATING", "SUBMITTING", "SUBMITTED", "COMPLETED"):
        assert expected in states, states
    assert "QUEUED" in states and "RUNNING" in states


def test_auto_backend_selects_least_busy(mocked_sdk):
    store, provider, jobs, qrng, limits = _build(CONFIGURED)
    exp = qrng.create_job(shots=16, mode=Mode.HARDWARE)      # backend=None → auto
    done = _wait_terminal(qrng, exp.id)
    assert done.backend == "ibm_first"                        # pending=2 beats pending=9


def test_result_counts_and_stats_consistent(mocked_sdk):
    store, provider, jobs, qrng, limits = _build(CONFIGURED)
    exp = qrng.create_job(shots=64, mode=Mode.HARDWARE)
    done = _wait_terminal(qrng, exp.id)
    view = done.result_dict()
    assert view["observed_zero_pct"] == 50.0
    assert view["theoretical_one_pct"] == 50.0
    assert view["sigma_pct"] == pytest.approx(6.25)
    assert view["provider_job_id"].startswith("fake-job-")


# --------------------------------------------------------------------- failure paths

def test_rate_limited_submission_is_surfaced(mocked_sdk):
    from qiskit_ibm_runtime.api.exceptions import RequestsApiError
    FakeSamplerV2.fail_with = RequestsApiError("Too many requests", status_code=429)
    store, provider, jobs, qrng, limits = _build(CONFIGURED)
    exp = qrng.create_job(shots=16, mode=Mode.HARDWARE)
    done = _wait_terminal(qrng, exp.id)
    assert done.status is JobState.RATE_LIMITED
    assert done.error_code == "RATE_LIMITED"
    assert "rate limit" in done.error_message.lower()


def test_auth_failure_is_surfaced_with_hint(mocked_sdk):
    store, provider, jobs, qrng, limits = _build(
        IBMConfig(api_key="reject-me", instance=None,
                  channel="ibm_quantum_platform", pinned_backend=None))
    exp = qrng.create_job(shots=16, mode=Mode.HARDWARE)
    done = _wait_terminal(qrng, exp.id)
    assert done.status is JobState.FAILED
    assert done.error_code == "PROVIDER_AUTH_FAILED"
    assert "IBM_QUANTUM_API_KEY" in done.error_hint


def test_provider_job_failure_records_error_message(mocked_sdk):
    FakeSamplerV2.script = ["QUEUED", "ERROR"]
    store, provider, jobs, qrng, limits = _build(CONFIGURED)
    exp = qrng.create_job(shots=16, mode=Mode.HARDWARE)
    done = _wait_terminal(qrng, exp.id)
    assert done.status is JobState.FAILED
    assert "simulated provider failure" in (done.status_detail or "")
    assert done.bits is None                          # no bits on failure — never faked


def test_unknown_backend_fails_with_provider_error(mocked_sdk):
    """Backend resolution happens in the worker (real provider call); an
    unknown backend surfaces as an async FAILED state with the provider's
    translated error — never as fake success."""
    store, provider, jobs, qrng, limits = _build(CONFIGURED)
    exp = qrng.create_job(shots=16, mode=Mode.HARDWARE, backend="ibm_nonexistent")
    done = _wait_terminal(qrng, exp.id)
    assert done.status is JobState.FAILED
    assert done.error_code == "PROVIDER_NOT_FOUND"     # translated provider 404
    assert done.bits is None


def test_hardware_mode_requires_configuration(mocked_sdk):
    store, provider, jobs, qrng, limits = _build(NOT_CONFIGURED)
    with pytest.raises(ProviderNotConfigured) as err:
        qrng.create_job(shots=16, mode=Mode.HARDWARE)
    assert "not configured" in str(err.value).lower()
    assert ".env" in err.value.hint


def test_seeding_is_rejected_in_hardware_mode(mocked_sdk):
    store, provider, jobs, qrng, limits = _build(CONFIGURED)
    with pytest.raises(ProviderError) as err:
        qrng.create_job(shots=16, mode=Mode.HARDWARE, seed="nope")
    assert err.value.code == "INVALID_REQUEST"


# --------------------------------------------------------------------- timeout + recovery

def test_timeout_then_late_recovery(mocked_sdk):
    FakeSamplerV2.script = ["QUEUED"]                 # never finishes on its own
    store, provider, jobs, qrng, limits = _build(CONFIGURED)
    limits_fast_timeout = _fast_limits(job_timeout_s=0.5)
    jobs2 = JobManager(store, limits_fast_timeout)
    qrng2 = QrngService(store, jobs2, {"ibm_quantum": provider}, limits_fast_timeout)
    exp = qrng2.create_job(shots=16, mode=Mode.HARDWARE)
    done = _wait_terminal(qrng2, exp.id)
    assert done.status is JobState.TIMED_OUT
    assert done.provider_job_id                        # job id retained

    # provider finishes later → status refresh recovers the real result
    job = FAKE_JOBS[done.provider_job_id]
    job._script = ["DONE"]
    job._final = None
    job._bits = "10" * 8
    changed = qrng2.refresh_stale(done)
    assert changed
    recovered = qrng2.get(exp.id)
    assert recovered.status is JobState.COMPLETED
    assert recovered.bits == "10" * 8
    assert recovered.one_count == 8


# --------------------------------------------------------------------- cooldown

def test_hardware_submission_cooldown(mocked_sdk):
    store, provider, jobs, qrng, limits = _build(CONFIGURED)
    limits_cool = _fast_limits(submit_cooldown_s=30)
    jobs3 = JobManager(store, limits_cool)
    qrng3 = QrngService(store, jobs3, {"ibm_quantum": provider}, limits_cool)
    first = qrng3.create_job(shots=16, mode=Mode.HARDWARE)
    with pytest.raises(ProviderError) as err:
        qrng3.create_job(shots=16, mode=Mode.HARDWARE)
    assert err.value.code == "SUBMIT_COOLDOWN"
    assert getattr(err.value, "retry_after", 0) > 0
    _wait_terminal(qrng3, first.id)
