"""IQMProvider tests — fully mocked, no network, no real credentials.

Covers (TRD §19 / IQM integration spec §16):
  * configuration gating (not configured → honest errors, never fake data)
  * native circuit construction: prx(π/2, π/2) + measure = |0⟩→H→measure
  * circuit validation against the LIVE (mocked) architecture
  * submission lifecycle → normalized states (QUEUED/RUNNING/COMPLETED/…)
  * PER-SHOT bit extraction from CircuitMeasurementResults (never counts)
  * strict bit validation (wrong shot count / multi-bit rows / bad values)
  * server-side token refresh: proactive (JWT exp), reactive (401 retry-once)
  * no duplicate quantum jobs on auth-retry (rejected ≠ created)
  * error translation (rate limit, auth, timeout, 5xx, network)
  * provider registry selection: IQM first when configured, IBM fallback
"""

from __future__ import annotations

import base64
import json
import math
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import pytest

from qlab.config import IQMConfig
from qlab.models import JobState, Mode
from qlab.providers import build_default_providers, provider_for_mode
from qlab.providers.base import (
    ProviderError,
    ProviderNotConfigured,
    ProviderRateLimited,
    ProviderResultError,
)
from qlab.providers.iqm_provider import IQM_REGISTER_KEY, IQMProvider

# --------------------------------------------------------------------------- 
# helpers / fakes
# ---------------------------------------------------------------------------

QUBIT = "QB1"


@dataclass(frozen=True)
class FakeQC:
    alias: str
    display_name: str

    @property
    def is_mock(self) -> bool:
        return self.alias.endswith(":mock")


def make_cfg(**overrides) -> IQMConfig:
    defaults = dict(
        server_url="https://cocos.resonance.meetiqm.com/garnet",
        access_token="test-access-token",
        refresh_token=None,
        quantum_computer=None,
        qubit=None,
        auth_token_url=None,
        auth_server_url=None,
        auth_realm="cortex",
        auth_client_id="iqm_client",
        auth_client_secret=None,
    )
    defaults.update(overrides)
    return IQMConfig(**defaults)


def make_jwt(seconds_left: float = 30.0) -> str:
    header = base64.urlsafe_b64encode(b'{"alg":"RS256"}').decode().rstrip("=")
    payload = base64.urlsafe_b64encode(
        json.dumps({"exp": time.time() + seconds_left}).encode()
    ).decode().rstrip("=")
    sig = base64.urlsafe_b64encode(b"fakesig").decode().rstrip("=")
    return f"{header}.{payload}.{sig}"


class FakeJobStatus:
    def __init__(self, name: str) -> None:
        self.name = name


@dataclass
class FakeTracker:
    job_id: uuid.UUID
    status: FakeJobStatus = field(default_factory=lambda: FakeJobStatus("WAITING"))
    errors: Any = None
    status_sequence: list[str] = field(default_factory=list)
    _update_count: int = 0

    def update(self) -> None:
        if self.status_sequence:
            idx = min(self._update_count, len(self.status_sequence) - 1)
            self.status = FakeJobStatus(self.status_sequence[idx])
            self._update_count += 1


class FakeIQMClient:
    """Mimics the iqm-client surface the provider uses."""

    def __init__(self, *, shots_bits: str = "0110", arch_qubits: list[str] | None = None,
                 fail_submit: Exception | None = None,
                 fail_status: Exception | None = None,
                 fail_measurements: Exception | None = None,
                 status_sequence: list[str] | None = None,
                 quantum_computers: list[FakeQC] | None = None) -> None:
        self.shots_bits = shots_bits
        self.arch_qubits = arch_qubits or [QUBIT, "QB2"]
        self.fail_submit = fail_submit
        self.fail_status = fail_status
        self.fail_measurements = fail_measurements
        self.status_sequence = status_sequence or ["WAITING", "COMPLETED"]
        # quantum computers the (fake) server reports — real QPUs + mocks
        self.quantum_computers = quantum_computers or [
            FakeQC("garnet", "IQM Garnet"),
            FakeQC("garnet:mock", "IQM Garnet (mock)"),
            FakeQC("sirius", "IQM Sirius"),
            FakeQC("sirius:mock", "IQM Sirius (mock)"),
        ]
        self.submitted: list[dict[str, Any]] = []
        self.trackers: dict[str, FakeTracker] = {}
        self.measurements_calls = 0

    # -- architecture ------------------------------------------------------
    def get_dynamic_quantum_architecture(self) -> Any:
        from iqm.station_control.interface.models.dynamic_quantum_architecture import (
            DynamicQuantumArchitecture,
            GateInfo,
            GateImplementationInfo,
        )

        loci = [(q,) for q in self.arch_qubits]
        impl = GateImplementationInfo(loci=loci)
        gates = {
            "prx": GateInfo(implementations={"prx_impl": impl},
                            default_implementation="prx_impl", override_default_implementation={}),
            "measure": GateInfo(implementations={"measure_impl": impl},
                                default_implementation="measure_impl", override_default_implementation={}),
        }
        return DynamicQuantumArchitecture(
            calibration_set_id=uuid.uuid4(),
            qubits=self.arch_qubits,
            computational_resonators=[],
            gates=gates,
        )

    def get_health(self) -> dict[str, Any]:
        return {"status": "ok"}

    # -- jobs ---------------------------------------------------------------
    def submit_circuits(self, circuits: Any, shots: int = 1, **kwargs: Any) -> FakeTracker:
        if self.fail_submit is not None:
            raise self.fail_submit
        job_id = uuid.uuid4()
        tracker = FakeTracker(job_id=job_id,
                              status=FakeJobStatus(self.status_sequence[0]),
                              status_sequence=list(self.status_sequence))
        self.trackers[str(job_id)] = tracker
        self.submitted.append({"shots": shots, "circuits": circuits})
        return tracker

    def get_job(self, job_id: uuid.UUID) -> FakeTracker:
        tracker = self.trackers.get(str(job_id))
        if tracker is None:
            from iqm.iqm_client import NotFoundError

            raise NotFoundError(f"job {job_id} not found")
        return tracker

    def get_job_measurements(self, job_id: uuid.UUID) -> list[dict[str, list[list[int]]]]:
        if self.fail_measurements is not None:
            raise self.fail_measurements
        self.measurements_calls += 1
        bits = self.shots_bits
        return [{IQM_REGISTER_KEY: [[int(b)] for b in bits]}]


class FakeRefreshResponse:
    def __init__(self, status_code: int, payload: dict[str, Any] | None = None) -> None:
        self.status_code = status_code
        self._payload = payload or {}

    def json(self) -> dict[str, Any]:
        return self._payload


class FakeRefreshHTTP:
    """requests-like fake for the token refresh endpoint."""

    def __init__(self, *, responses: list[FakeRefreshResponse] | None = None) -> None:
        self.responses = list(responses or [])
        self.calls: list[dict[str, Any]] = []

    def post(self, url: str, data=None, auth=None, timeout=None):
        self.calls.append({"url": url, "data": dict(data or {}), "auth": auth})
        if self.responses:
            return self.responses.pop(0)
        return FakeRefreshResponse(200, {"access_token": "refreshed-access"})


def make_provider(cfg: IQMConfig | None = None, client: FakeIQMClient | None = None,
                  refresh_http: FakeRefreshHTTP | None = None) -> IQMProvider:
    return IQMProvider(
        config_loader=lambda: cfg or make_cfg(),
        client_factory=lambda url, quantum_computer, token: client or FakeIQMClient(),
        refresh_client=refresh_http,
    )


# ---------------------------------------------------------------------------
# configuration
# ---------------------------------------------------------------------------


def test_not_configured_when_missing_url_or_token():
    provider = IQMProvider(config_loader=lambda: make_cfg(server_url=None))
    assert provider.configured() is False
    provider = IQMProvider(config_loader=lambda: make_cfg(access_token=None))
    assert provider.configured() is False


def test_configured_with_url_and_token():
    assert make_provider().configured() is True


def test_create_circuit_requires_configuration():
    provider = IQMProvider(config_loader=lambda: make_cfg(access_token=None))
    with pytest.raises(ProviderNotConfigured):
        provider.create_qrng_circuit()


# ---------------------------------------------------------------------------
# circuit construction & validation
# ---------------------------------------------------------------------------


def test_circuit_is_prx_pi_half_plus_measure_on_live_qubit():
    client = FakeIQMClient()
    provider = make_provider(client=client)
    circuit = provider.create_qrng_circuit()
    prx, measure = circuit.instructions
    assert prx.name == "prx"
    assert prx.locus == (QUBIT,)                    # real name from the (mocked) architecture
    assert abs(prx.args["angle"] - math.pi / 2) < 1e-12
    assert abs(prx.args["phase"] - math.pi / 2) < 1e-12
    assert measure.name == "measure"
    assert measure.args["key"] == IQM_REGISTER_KEY


def test_circuit_validates_against_live_architecture():
    provider = make_provider()
    circuit = provider.create_qrng_circuit()
    provider.validate_circuit(circuit)              # must not raise


def test_circuit_rejected_when_wrong_shape():
    from iqm.pulse.circuit_operations import Circuit, CircuitOperation

    provider = make_provider()
    with pytest.raises(ProviderError) as excinfo:
        provider.validate_circuit(Circuit(name="bad", instructions=(
            CircuitOperation("prx", locus=(QUBIT,), args={"angle": 3.0, "phase": 0.0}),
            CircuitOperation("measure", locus=(QUBIT,), args={"key": "m", "feedback_key": "m"}),
        )))
    assert "π/2" in excinfo.value.message


def test_configured_qubit_must_exist_live():
    provider = make_provider(cfg=make_cfg(qubit="QB_DOES_NOT_EXIST"))
    with pytest.raises(ProviderError) as excinfo:
        provider.create_qrng_circuit()
    assert "IQM_QUBIT" in excinfo.value.message
    assert "QB_DOES_NOT_EXIST" in excinfo.value.message


# ---------------------------------------------------------------------------
# submission lifecycle
# ---------------------------------------------------------------------------


def test_submit_returns_normalized_submission():
    client = FakeIQMClient()
    provider = make_provider(client=client)
    submission = provider.submit_job(provider.create_qrng_circuit(), shots=4)
    assert submission.backend == "garnet"           # derived from the real server URL tail
    assert submission.provider_job_id
    assert client.submitted[0]["shots"] == 4
    assert "prx(π/2, π/2)" in submission.transpiled_ops[0]


def test_submit_rejects_seed():
    provider = make_provider()
    with pytest.raises(ProviderError):
        provider.submit_job(provider.create_qrng_circuit(), shots=4, seed="s")


def test_status_maps_waiting_processing_completed():
    client = FakeIQMClient(status_sequence=["PROCESSING", "COMPLETED"])
    provider = make_provider(client=client)
    submission = provider.submit_job(provider.create_qrng_circuit(), shots=4)
    assert provider.get_job_status(submission.provider_job_id).status is JobState.RUNNING
    assert provider.get_job_status(submission.provider_job_id).status is JobState.COMPLETED


def test_status_maps_failed_and_cancelled():
    client = FakeIQMClient(status_sequence=["FAILED"])
    provider = make_provider(client=client)
    submission = provider.submit_job(provider.create_qrng_circuit(), shots=4)
    info = provider.get_job_status(submission.provider_job_id)
    assert info.status is JobState.FAILED

    client2 = FakeIQMClient(status_sequence=["CANCELLED"])
    provider2 = make_provider(client=client2)
    sub2 = provider2.submit_job(provider2.create_qrng_circuit(), shots=4)
    assert provider2.get_job_status(sub2.provider_job_id).status is JobState.CANCELLED


# ---------------------------------------------------------------------------
# per-shot bit extraction (the core honesty guarantee)
# ---------------------------------------------------------------------------


def test_result_bits_are_per_shot_shot_ordered():
    client = FakeIQMClient(shots_bits="01101001")
    provider = make_provider(client=client)
    submission = provider.submit_job(provider.create_qrng_circuit(), shots=8)
    result = provider.get_job_result(submission.provider_job_id, shots=8)
    assert result.bits == "01101001"                # exact per-shot order
    assert result.counts == {"0": 4, "1": 4}
    assert result.backend == "garnet"
    assert result.metadata["measurement_retrieval"].startswith("per-shot")
    assert client.measurements_calls == 1


def test_result_rejects_wrong_shot_count():
    client = FakeIQMClient(shots_bits="01")         # 2 shots returned
    provider = make_provider(client=client)
    submission = provider.submit_job(provider.create_qrng_circuit(), shots=4)
    with pytest.raises(ProviderResultError):
        provider.get_job_result(submission.provider_job_id, shots=4)


def test_result_rejects_multi_bit_rows():
    client = FakeIQMClient(shots_bits="0110")

    def bad_measurements(job_id):
        return [{IQM_REGISTER_KEY: [[0, 1], [1], [0], [1]]}]

    client.get_job_measurements = bad_measurements
    provider = make_provider(client=client)
    submission = provider.submit_job(provider.create_qrng_circuit(), shots=4)
    with pytest.raises(ProviderResultError):
        provider.get_job_result(submission.provider_job_id, shots=4)


def test_result_rejects_non_binary_values():
    client = FakeIQMClient()

    def bad_measurements(job_id):
        return [{IQM_REGISTER_KEY: [[2], [1], [0], [1]]}]

    client.get_job_measurements = bad_measurements
    provider = make_provider(client=client)
    submission = provider.submit_job(provider.create_qrng_circuit(), shots=4)
    with pytest.raises(ProviderResultError):
        provider.get_job_result(submission.provider_job_id, shots=4)


# ---------------------------------------------------------------------------
# token refresh (server-side only)
# ---------------------------------------------------------------------------


def test_refresh_proactive_before_expiry():
    cfg = make_cfg(access_token=make_jwt(seconds_left=30.0), refresh_token="r1",
                   auth_server_url="https://auth.example.com")
    http = FakeRefreshHTTP()
    client = FakeIQMClient()
    provider = IQMProvider(config_loader=lambda: cfg,
                           client_factory=lambda url, quantum_computer, token: client,
                           refresh_client=http)
    provider.submit_job(provider.create_qrng_circuit(), shots=4)
    assert len(http.calls) == 1                      # refreshed proactively (<120s left)
    assert http.calls[0]["url"] == (
        "https://auth.example.com/realms/cortex/protocol/openid-connect/token"
    )
    assert http.calls[0]["data"]["grant_type"] == "refresh_token"
    assert http.calls[0]["data"]["refresh_token"] == "r1"
    assert http.calls[0]["data"]["client_id"] == "iqm_client"
    assert client.submitted                          # submission went through with new token


def test_no_refresh_when_token_is_long_lived():
    http = FakeRefreshHTTP()
    provider = make_provider(refresh_http=http)      # opaque token, no refresh_token in cfg
    provider.submit_job(provider.create_qrng_circuit(), shots=4)
    assert http.calls == []


def test_no_refresh_when_jwt_still_valid():
    cfg = make_cfg(access_token=make_jwt(seconds_left=3600.0), refresh_token="r1",
                   auth_server_url="https://auth.example.com")
    http = FakeRefreshHTTP()
    provider = IQMProvider(config_loader=lambda: cfg,
                           client_factory=lambda url, quantum_computer, token: FakeIQMClient(),
                           refresh_client=http)
    provider.submit_job(provider.create_qrng_circuit(), shots=4)
    assert http.calls == []                          # plenty of time left → no refresh


def test_refresh_failure_blocks_submission_without_job():
    cfg = make_cfg(access_token=make_jwt(seconds_left=10.0), refresh_token="r1",
                   auth_server_url="https://auth.example.com")
    http = FakeRefreshHTTP(responses=[FakeRefreshResponse(400, {"error": "invalid_grant"})])
    client = FakeIQMClient()
    provider = IQMProvider(config_loader=lambda: cfg,
                           client_factory=lambda url, quantum_computer, token: client,
                           refresh_client=http)
    with pytest.raises(ProviderError) as excinfo:
        provider.submit_job(provider.create_qrng_circuit(), shots=4)
    assert excinfo.value.code == "PROVIDER_AUTH_REFRESH_FAILED"
    assert "r1" not in excinfo.value.message          # refresh token never leaks
    assert client.submitted == []                     # NO quantum job was created


def test_refresh_required_but_no_endpoint_configured():
    cfg = make_cfg(access_token=make_jwt(seconds_left=10.0), refresh_token="r1")
    provider = IQMProvider(config_loader=lambda: cfg,
                           client_factory=lambda url, quantum_computer, token: FakeIQMClient(),
                           refresh_client=FakeRefreshHTTP())
    with pytest.raises(ProviderError) as excinfo:
        provider.submit_job(provider.create_qrng_circuit(), shots=4)
    assert excinfo.value.code == "PROVIDER_AUTH_REFRESH_FAILED"


def test_auth_error_retry_creates_exactly_one_job():
    """401 on first submit → refresh → ONE retry. The rejected request
    created no job, so exactly one quantum job exists afterwards."""
    cfg = make_cfg(access_token="opaque-token", refresh_token="r1",
                   auth_server_url="https://auth.example.com")
    http = FakeRefreshHTTP()

    calls = {"n": 0}

    class AuthOnceClient(FakeIQMClient):
        def submit_circuits(self, circuits, shots=1, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                from iqm.iqm_client import AuthenticationError

                raise AuthenticationError("401 Unauthorized")
            return super().submit_circuits(circuits, shots=shots, **kwargs)

    client = AuthOnceClient()
    provider = IQMProvider(config_loader=lambda: cfg,
                           client_factory=lambda url, quantum_computer, token: client,
                           refresh_client=http)
    submission = provider.submit_job(provider.create_qrng_circuit(), shots=4)
    assert calls["n"] == 2                           # initial attempt + single retry
    assert len(client.submitted) == 1                # exactly one real job
    assert submission.provider_job_id


def test_timeout_during_submit_is_never_retried():
    """Ambiguous failure (timeout) → honest error, no second submit."""
    import requests

    client = FakeIQMClient()

    class TimeoutClient(FakeIQMClient):
        def submit_circuits(self, circuits, shots=1, **kwargs):
            raise requests.exceptions.Timeout("request timed out")

    provider = IQMProvider(config_loader=lambda: make_cfg(),
                           client_factory=lambda url, quantum_computer, token: TimeoutClient(),
                           refresh_client=FakeRefreshHTTP())
    with pytest.raises(ProviderError) as excinfo:
        provider.submit_job(provider.create_qrng_circuit(), shots=4)
    assert excinfo.value.code == "PROVIDER_TIMEOUT"


# ---------------------------------------------------------------------------
# error translation
# ---------------------------------------------------------------------------


def test_rate_limit_translated():
    from iqm.iqm_client import AuthenticationError  # noqa: F401  (import sanity)

    client = FakeIQMClient()

    class RateLimited(Exception):
        status_code = 429

    class RLClient(FakeIQMClient):
        def submit_circuits(self, circuits, shots=1, **kwargs):
            raise RateLimited("too many requests")

    provider = IQMProvider(config_loader=lambda: make_cfg(),
                           client_factory=lambda url, quantum_computer, token: RLClient(),
                           refresh_client=None)
    with pytest.raises(ProviderRateLimited):
        provider.submit_job(provider.create_qrng_circuit(), shots=4)


def test_auth_error_translated_without_token_leak():
    from iqm.iqm_client import AuthenticationError

    token = "super-secret-access-token-xyz"
    client = FakeIQMClient()

    class AuthClient(FakeIQMClient):
        def submit_circuits(self, circuits, shots=1, **kwargs):
            raise AuthenticationError(f"invalid token {token}")

    provider = IQMProvider(config_loader=lambda: make_cfg(access_token=token),
                           client_factory=lambda url, quantum_computer, token: AuthClient())
    with pytest.raises(ProviderError) as excinfo:
        provider.submit_job(provider.create_qrng_circuit(), shots=4)
    assert excinfo.value.code == "PROVIDER_AUTH_FAILED"
    assert token not in excinfo.value.message
    assert token not in (excinfo.value.hint or "")


def test_5xx_translated_as_unavailable():
    client = FakeIQMClient()

    class ServerError(Exception):
        status_code = 503

    class SEClient(FakeIQMClient):
        def submit_circuits(self, circuits, shots=1, **kwargs):
            raise ServerError("maintenance")

    provider = IQMProvider(config_loader=lambda: make_cfg(),
                           client_factory=lambda url, quantum_computer, token: SEClient())
    with pytest.raises(ProviderError) as excinfo:
        provider.submit_job(provider.create_qrng_circuit(), shots=4)
    assert excinfo.value.code == "PROVIDER_UNAVAILABLE"


# ---------------------------------------------------------------------------
# backend metadata + registry selection
# ---------------------------------------------------------------------------


def test_backend_metadata_lists_real_qcs_and_excludes_mocks():
    provider = make_provider(client=FakeIQMClient(arch_qubits=["QB1", "QB2", "QB3"]))
    infos = provider.get_backend_metadata()
    # mocks are simulators — they must NEVER be offered in hardware mode
    assert [i.name for i in infos] == ["garnet", "sirius"]
    assert all(i.simulator is False for i in infos)
    garnet = infos[0]
    assert garnet.operational is True
    assert garnet.qubits == 3
    assert "IQM Garnet" in (garnet.status_message or "")


def test_backend_metadata_single_qc_filter():
    provider = make_provider()
    infos = provider.get_backend_metadata(name="sirius")
    assert [i.name for i in infos] == ["sirius"]


def test_submit_selects_requested_real_qc():
    client = FakeIQMClient()
    provider = make_provider(client=client)
    submission = provider.submit_job(provider.create_qrng_circuit(), shots=4, backend="sirius")
    assert submission.backend == "sirius"


def test_submit_rejects_mock_quantum_computer():
    provider = make_provider()
    with pytest.raises(ProviderError) as excinfo:
        provider.submit_job(provider.create_qrng_circuit(), shots=4, backend="garnet:mock")
    assert excinfo.value.code == "SIMULATOR_BACKEND_REJECTED"


def test_submit_rejects_unknown_quantum_computer():
    provider = make_provider()
    with pytest.raises(ProviderError) as excinfo:
        provider.submit_job(provider.create_qrng_circuit(), shots=4, backend="does_not_exist")
    assert excinfo.value.code == "INVALID_BACKEND"
    assert "garnet" in (excinfo.value.hint or "")    # real choices listed in the hint


def test_submit_rejects_request_conflicting_with_pinned_qc():
    provider = make_provider(cfg=make_cfg(quantum_computer="garnet"))
    with pytest.raises(ProviderError) as excinfo:
        provider.submit_job(provider.create_qrng_circuit(), shots=4, backend="sirius")
    assert excinfo.value.code == "INVALID_BACKEND"
    assert "IQM_QUANTUM_COMPUTER" in excinfo.value.message


def test_pinned_quantum_computer_used_when_valid():
    provider = make_provider(cfg=make_cfg(quantum_computer="sirius"))
    assert provider.create_qrng_circuit().instructions[0].locus == (QUBIT,)
    submission = provider.submit_job(provider.create_qrng_circuit(), shots=4)
    assert submission.backend == "sirius"


def test_provider_for_mode_prefers_iqm_when_configured(monkeypatch):
    providers = build_default_providers()
    assert providers["iqm"].name == "iqm"
    # nothing configured → still returns a provider (for honest errors)
    hw = provider_for_mode(providers, Mode.HARDWARE)
    assert hw.name == "iqm"

    monkeypatch.setattr(providers["iqm"], "_config_loader",
                        lambda: make_cfg(access_token="tok", server_url="https://x"))
    assert provider_for_mode(providers, Mode.HARDWARE).name == "iqm"

    # IQM unconfigured + IBM configured → IBM fallback
    monkeypatch.setattr(providers["iqm"], "_config_loader", lambda: make_cfg(access_token=None))
    monkeypatch.setattr(
        providers["ibm_quantum"], "_config_loader",
        lambda: type("C", (), {"configured": True})(),
    )
    assert provider_for_mode(providers, Mode.HARDWARE).name == "ibm_quantum"


def test_simulator_mode_unchanged():
    providers = build_default_providers()
    assert provider_for_mode(providers, Mode.SIMULATOR).name == "local_statevector"


def test_describe_shape():
    provider = make_provider()
    d = provider.describe()
    assert d == {"name": "iqm", "label": IQMProvider.label, "simulator": False, "configured": True}


# ---------------------------------------------------------------------------
# full pipeline through QrngService + JobManager (mocked IQM backend)
# ---------------------------------------------------------------------------


def test_full_pipeline_through_qrng_service(tmp_path):
    import pathlib

    from qlab.config import Limits
    from qlab.services.experiment_service import ExperimentStore
    from qlab.services.job_manager import JobManager
    from qlab.services.qrng_service import QrngService

    bits = "10110110"                                  # 8 shots → the illustrative 182 pattern
    client = FakeIQMClient(shots_bits=bits, status_sequence=["WAITING", "COMPLETED"])
    provider = IQMProvider(
        config_loader=lambda: make_cfg(),
        client_factory=lambda url, quantum_computer, token: client,
    )
    store = ExperimentStore(pathlib.Path(tmp_path))
    limits = Limits(min_shots=8, max_shots=4096, job_timeout_s=30, poll_initial_s=0.01,
                    poll_max_s=0.05, submit_cooldown_s=0)
    jobs = JobManager(store, limits)
    qrng = QrngService(store, jobs, {"iqm": provider, "local_statevector": build_default_providers()["local_statevector"]}, limits)

    exp = qrng.create_job(shots=8, mode=Mode.HARDWARE)
    assert exp.provider == "iqm"

    deadline = time.time() + 10
    while time.time() < deadline:
        exp = qrng.get(exp.id)
        if exp.status in (JobState.COMPLETED, JobState.FAILED, JobState.TIMED_OUT):
            break
        time.sleep(0.02)

    assert exp.status is JobState.COMPLETED, exp.error_message
    assert exp.bits == bits                            # per-shot IQM measurements, shot-ordered
    assert exp.backend == "garnet"
    assert exp.provider_job_id and exp.provider_job_id != exp.id
    assert exp.source == "quantum_hardware"
    assert exp.zero_count == 3 and exp.one_count == 5
    assert exp.provider_metadata["measurement_retrieval"].startswith("per-shot")
    assert exp.transpiled_ops and "prx(π/2, π/2)" in exp.transpiled_ops[0]

    # the normalized result view (what the frontend consumes) carries provenance
    view = exp.result_dict()
    assert view["provider"] == "iqm"
    assert view["backend"] == "garnet"
    assert view["bits"] == bits
    assert view["job_id"] == exp.id
    # no secrets ever leave the provider
    serialized = json.dumps(view)
    assert "test-access-token" not in serialized
