"""IQMProvider — real hardware path via the IQM Quantum API (iqm-client).

Executes the fixed QRNG circuit (|0⟩ → H → measure) on a real IQM QPU
using the *native* IQM circuit format (``iqm.pulse.Circuit``), because the
``qiskit-iqm`` adapter's qiskit pin conflicts with this project's qiskit
version (see docs/DECISIONS notes in README). The math is exact:

    H = R_y(π/2) · Z  and  Z|0⟩ = |0⟩
    ⇒  prx(angle=π/2, phase=π/2) ≡ R_y(π/2) on |0⟩ prepares |+⟩ = H|0⟩

so ``prx(π/2, π/2)`` followed by a Z-basis ``measure`` is *exactly* the
approved QRNG circuit — no approximation, no adapter needed.

Non-negotiable rules implemented here (mirrors ibm_provider.py):
  * Bits returned by get_job_result() come ONLY from the provider's
    per-shot measurement data (``get_job_measurements``) — never from
    counts, never from any local random source.
  * Qubit names are taken from the LIVE dynamic quantum architecture —
    never invented.
  * Credentials are read server-side from config only; every message
    that could echo provider data goes through redact().
  * Token refresh happens server-side (Cortex Keycloak or OAuth token
    endpoint). Tokens are never logged and never returned to the client.
  * Auth retries never duplicate a quantum job: a 401 means the request
    was REJECTED (no job created), so a single retry after refresh is
    safe; ambiguous failures (timeouts) are never blindly retried.
"""

from __future__ import annotations

import base64
import json
import math
import threading
import time
import uuid as uuid_mod
from typing import Any, Callable, Optional

from ..config import IQMConfig, load_iqm_config, redact
from ..models import JobState
from .base import (
    BackendInfo,
    ProviderError,
    ProviderNotConfigured,
    ProviderRateLimited,
    ProviderResult,
    ProviderResultError,
    ProviderStatusInfo,
    ProviderSubmission,
    QuantumProvider,
)

IQM_CREDENTIALS_HINT = (
    "IQM hardware mode needs IQM_SERVER_URL and IQM_ACCESS_TOKEN in app/backend/.env "
    "(see .env.example). Get them from the IQM Resonance dashboard (long-lived token) "
    "or your IQM/Cortex tokens (access + optional refresh token). The server picks "
    "them up on the next submission — no restart needed. Simulator mode remains "
    "available and is always labelled as simulation."
)

# deterministic register key for the single measured bit
IQM_REGISTER_KEY = "qrng_bit"

# proactive refresh margin: refresh when the access token has less than this left
_REFRESH_MARGIN_S = 120.0
# TTL for the cached dynamic quantum architecture (qubit names must be real,
# but they only change with a new calibration — a short cache is honest)
_ARCH_CACHE_TTL = 300.0
_AUTH_REQUEST_TIMEOUT_S = 20.0


def _jwt_seconds_left(token: Optional[str]) -> float:
    """Seconds until JWT expiry, or +inf for non-JWT (long-lived) tokens.

    Mirrors iqm.station_control.client.authentication.TokenManager.time_left_seconds
    without importing the private helper.
    """
    if not token or token.count(".") != 2:
        return float("inf")            # opaque long-lived token — no expiry info
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)          # fix base64 padding
        data = json.loads(base64.urlsafe_b64decode(payload))
        exp = float(data.get("exp", 0))
        return exp - time.time() if exp else float("inf")
    except Exception:
        return float("inf")            # cannot parse — assume it stays valid


class IQMProvider(QuantumProvider):
    name = "iqm"
    label = "IQM Quantum — real QPU hardware"
    is_simulator = False

    NOT_CONFIGURED_REASON = "IQM_SERVER_URL / IQM_ACCESS_TOKEN are not set on the server"
    SETUP_HINT = IQM_CREDENTIALS_HINT
    SETUP_STEPS = [
        "Create an IQM Resonance account at resonance.meetiqm.com (or use your "
        "on-prem IQM server) and obtain an access token — from the dashboard, or "
        "from `cortex auth login` if you have a Cortex tokens file",
        "Copy your server URL (e.g. https://cocos.resonance.meetiqm.com/<qpu>) "
        "and the access token",
        "Put them in app/backend/.env: IQM_SERVER_URL=… and IQM_ACCESS_TOKEN=… "
        "(optionally IQM_REFRESH_TOKEN=… to enable automatic refresh). "
        "The server picks them up on the next submission — no restart needed",
    ]

    def __init__(self, config_loader: Callable[[], IQMConfig] = load_iqm_config,
                 client_factory: Optional[Callable[..., Any]] = None,
                 refresh_client: Optional[Any] = None) -> None:
        """``client_factory`` / ``refresh_client`` are injection points for
        tests (no network in unit tests). Production uses iqm-client."""
        self._config_loader = config_loader
        self._client_factory = client_factory          # tests: fake IQMClient
        self._refresh_client = refresh_client          # tests: fake requests-like
        self._client: Any = None
        self._client_key: Optional[tuple] = None       # (url, token id, qc) the client was built for
        self._lock = threading.RLock()
        # in-memory token state (never logged, never returned)
        self._access_token: Optional[str] = None
        self._refresh_token: Optional[str] = None
        self._token_source: Optional[str] = None       # config access token the state came from
        self._trackers: dict[str, Any] = {}            # provider_job_id -> CircuitJobTracker
        self._submit_meta: dict[str, dict[str, Any]] = {}
        self._arch_cache: Optional[tuple[float, Any, Optional[str]]] = None  # (ts, arch, qc)

    # ------------------------------------------------------------------ config

    def configured(self) -> bool:
        """Re-read config each call so tokens added to .env later are detected."""
        return self._config_loader().configured

    def _require_config(self) -> IQMConfig:
        cfg = self._config_loader()
        if not cfg.configured:
            raise ProviderNotConfigured(
                "IQM Quantum credentials are not configured on this server.",
                IQM_CREDENTIALS_HINT,
            )
        return cfg

    # ------------------------------------------------------------------ client

    def _get_client(self, cfg: Optional[IQMConfig] = None) -> Any:
        """Build (or reuse) an IQMClient for the CURRENT in-memory token state.

        The client is rebuilt whenever the config's token changes (operator
        edited .env) or whenever we refreshed the access token ourselves.
        """
        cfg = cfg or self._require_config()
        with self._lock:
            self._sync_tokens(cfg)
            key = (cfg.server_url, self._access_token, cfg.quantum_computer)
            if self._client is not None and self._client_key == key:
                return self._client
            try:
                if self._client_factory is not None:
                    client = self._client_factory(
                        url=cfg.server_url,
                        quantum_computer=cfg.quantum_computer,
                        token=self._access_token,
                    )
                else:
                    from iqm.iqm_client import IQMClient

                    client = IQMClient.from_url(
                        cfg.server_url,
                        quantum_computer=cfg.quantum_computer,
                        token=self._access_token,
                    )
            except Exception as exc:
                raise self._translate(exc, "connecting to the IQM server") from exc
            self._client = client
            self._client_key = key
            return client

    def _sync_tokens(self, cfg: IQMConfig) -> None:
        """Adopt config tokens when the config identity changes (keeps our
        refreshed tokens otherwise)."""
        if self._token_source != cfg.access_token:
            self._access_token = cfg.access_token
            self._refresh_token = cfg.refresh_token
            self._token_source = cfg.access_token
            self._client = None                # force rebuild for the new token
            self._client_key = None

    # ------------------------------------------------------------------ refresh

    def _refresh_endpoint(self, cfg: IQMConfig) -> Optional[tuple[str, dict[str, str], Optional[tuple[str, str]]]]:
        """(url, form_data, basic_auth) for the configured refresh flow, or None."""
        if cfg.auth_token_url:
            url = cfg.auth_token_url
        elif cfg.auth_server_url:
            url = (
                f"{cfg.auth_server_url.rstrip('/')}/realms/{cfg.auth_realm}"
                "/protocol/openid-connect/token"
            )
        else:
            return None
        data = {
            "client_id": cfg.auth_client_id,
            "grant_type": "refresh_token",
            "refresh_token": self._refresh_token or "",
        }
        basic = (
            (cfg.auth_client_id, cfg.auth_client_secret)
            if cfg.auth_token_url and cfg.auth_client_secret
            else None
        )
        return url, data, basic

    def _maybe_refresh(self, cfg: IQMConfig, *, force: bool = False) -> bool:
        """Refresh the access token when it is about to expire.

        Returns True when a refresh was attempted and succeeded, False when
        no refresh was needed. Raises ProviderError when a refresh is
        REQUIRED but fails — before any quantum job is created (so retries
        never duplicate jobs).
        """
        with self._lock:
            self._sync_tokens(cfg)
            if not cfg.refresh_token:
                return False                  # long-lived token — nothing to do
            if not force and _jwt_seconds_left(self._access_token) > _REFRESH_MARGIN_S:
                return False
            endpoint = self._refresh_endpoint(cfg)
            if endpoint is None:
                raise ProviderError(
                    "PROVIDER_AUTH_REFRESH_FAILED",
                    "The IQM access token has expired and no refresh endpoint is configured.",
                    "Set IQM_AUTH_SERVER_URL (Cortex CLI flow) or IQM_AUTH_TOKEN_URL "
                    "(api.iqm.com OAuth flow) in app/backend/.env to enable automatic "
                    "refresh, or update IQM_ACCESS_TOKEN with a fresh token.",
                )
            url, data, basic = endpoint
            try:
                if self._refresh_client is not None:
                    response = self._refresh_client.post(url, data=data, auth=basic,
                                                         timeout=_AUTH_REQUEST_TIMEOUT_S)
                else:
                    import requests

                    response = requests.post(
                        url, data=data, auth=basic, timeout=_AUTH_REQUEST_TIMEOUT_S
                    )
            except Exception as exc:
                raise ProviderError(
                    "PROVIDER_AUTH_REFRESH_FAILED",
                    f"Could not reach the IQM authentication server while refreshing the "
                    f"access token ({redact(type(exc).__name__)}).",
                    "Check IQM_AUTH_SERVER_URL / IQM_AUTH_TOKEN_URL and network access. "
                    "No quantum job was submitted.",
                ) from exc
            if response.status_code != 200:
                raise ProviderError(
                    "PROVIDER_AUTH_REFRESH_FAILED",
                    "IQM refused to refresh the access token "
                    f"(HTTP {response.status_code}). The refresh token may be expired or revoked.",
                    "Re-authenticate (e.g. `cortex auth login`) and update IQM_ACCESS_TOKEN / "
                    "IQM_REFRESH_TOKEN in app/backend/.env. No quantum job was submitted.",
                )
            try:
                payload = response.json()
                new_access = payload.get("access_token")
                if not new_access:
                    raise ValueError("no access_token in response")
            except Exception as exc:
                raise ProviderError(
                    "PROVIDER_AUTH_REFRESH_FAILED",
                    "The IQM authentication server returned an unexpected refresh response.",
                    "No quantum job was submitted.",
                ) from exc
            self._access_token = new_access
            if payload.get("refresh_token"):
                self._refresh_token = payload["refresh_token"]
            self._client = None                # rebuild client with the new token
            self._client_key = None
            return True

    def _is_auth_error(self, exc: Exception) -> bool:
        """401/403-class failures: the request was REJECTED, never executed."""
        status = getattr(exc, "status_code", None)
        if status in (401, 403):
            return True
        name = type(exc).__name__.lower()
        return "auth" in name and "error" in name

    def _call(self, action: str, fn: Callable[[Any], Any],
              *, allow_refresh_retry: bool = True) -> Any:
        """Run ``fn(client)`` with proactive + reactive token refresh.

        A 401-class rejection means the request was NOT executed (no job
        created), so one retry after a forced refresh is safe. Network
        timeouts / connection errors are never retried here — the caller
        decides what is safe to repeat.
        """
        cfg = self._require_config()
        self._maybe_refresh(cfg)
        try:
            return fn(self._get_client(cfg))
        except Exception as exc:
            if allow_refresh_retry and cfg.refresh_token and self._is_auth_error(exc):
                refreshed = self._maybe_refresh(cfg, force=True)
                if refreshed:
                    try:
                        return fn(self._get_client(cfg))
                    except Exception as exc2:
                        raise self._translate(exc2, action) from exc2
            raise self._translate(exc, action) from exc

    # ------------------------------------------------------------------ circuit

    def create_qrng_circuit(self) -> Any:
        """Build the fixed QRNG circuit in IQM native form.

        The qubit name is taken from the LIVE dynamic quantum architecture
        (cached briefly) — never invented. Returns an ``iqm.pulse.Circuit``.
        """
        qubit, _arch = self._select_qubit()
        return self._build_circuit(qubit)

    @staticmethod
    def _build_circuit(qubit: str) -> Any:
        from iqm.pulse.circuit_operations import Circuit, CircuitOperation

        return Circuit(
            name="qrng_h_measure",
            instructions=(
                # prx(π/2, π/2) = R_y(π/2): exactly H·Z on |0⟩ ⇒ prepares |+⟩ = H|0⟩
                CircuitOperation(
                    "prx", locus=(qubit,),
                    args={"angle": math.pi / 2, "phase": math.pi / 2},
                ),
                CircuitOperation(
                    "measure", locus=(qubit,),
                    args={"key": IQM_REGISTER_KEY, "feedback_key": IQM_REGISTER_KEY},
                ),
            ),
        )

    def validate_circuit(self, circuit: Any) -> None:
        """Validate the fixed QRNG circuit against the LIVE architecture
        (client-side, no job submitted) + enforce the exact QRNG shape."""
        from iqm.iqm_client.validation import CircuitValidationError, validate_circuit_instructions

        instructions = list(getattr(circuit, "instructions", ()) or ())
        problems: list[str] = []
        if len(instructions) != 2:
            problems.append(f"expected exactly 2 instructions (prx, measure), found {len(instructions)}")
        else:
            prx, measure = instructions
            if prx.name != "prx" or measure.name != "measure":
                problems.append(
                    f"expected (prx, measure), found ({prx.name}, {measure.name})"
                )
            if prx.name == "prx":
                angle = float(prx.args.get("angle", 0.0))
                phase = float(prx.args.get("phase", 0.0))
                if abs(angle - math.pi / 2) > 1e-9 or abs(phase - math.pi / 2) > 1e-9:
                    problems.append("prx must be exactly (angle=π/2, phase=π/2)")
            if measure.name == "measure" and measure.args.get("key") != IQM_REGISTER_KEY:
                problems.append(f"measure key must be '{IQM_REGISTER_KEY}'")
        if problems:
            raise ProviderError(
                "CIRCUIT_REJECTED",
                "circuit rejected by fixed QRNG spec: " + "; ".join(problems),
                "Every hardware run uses the approved |0⟩ → H → measure circuit only.",
            )

        _ts, arch, _qc = self._architecture()
        try:
            validate_circuit_instructions(arch, [circuit])
        except CircuitValidationError as exc:
            raise ProviderError(
                "CIRCUIT_REJECTED",
                f"IQM rejected the QRNG circuit against the live architecture: {redact(str(exc))}",
                "The QPU calibration may have changed — retrying re-reads the architecture.",
            ) from exc

    # ------------------------------------------------------------------ architecture / backends

    def _architecture(self) -> tuple[float, Any, Optional[str]]:
        """Live dynamic quantum architecture (qubit names + native ops), cached."""
        cfg = self._require_config()
        now = time.monotonic()
        with self._lock:
            if (
                self._arch_cache is not None
                and now - self._arch_cache[0] < _ARCH_CACHE_TTL
                and self._arch_cache[2] == cfg.quantum_computer
            ):
                return self._arch_cache
        arch = self._call(
            "fetching the IQM quantum architecture",
            lambda client: client.get_dynamic_quantum_architecture(),
        )
        with self._lock:
            self._arch_cache = (now, arch, cfg.quantum_computer)
        return self._arch_cache

    def _select_qubit(self) -> tuple[str, Any]:
        """Deterministic qubit choice: configured qubit if it exists live,
        else the FIRST qubit of the live architecture (server order)."""
        cfg = self._require_config()
        _ts, arch, _qc = self._architecture()
        qubits = list(getattr(arch, "qubits", ()) or [])
        if not qubits:
            raise ProviderError(
                "PROVIDER_UNAVAILABLE",
                "The IQM server reported a quantum architecture with no qubits.",
                "The QPU may be under maintenance — check IQM Resonance status.",
            )
        if cfg.qubit:
            if cfg.qubit not in qubits:
                raise ProviderError(
                    "INVALID_BACKEND",
                    f"Configured IQM_QUBIT '{cfg.qubit}' does not exist on this QPU "
                    f"(live qubits: {', '.join(qubits[:8])}…).",
                    "Remove IQM_QUBIT from .env to use automatic selection, or set a "
                    "real qubit name from the live architecture.",
                )
            return cfg.qubit, arch
        return qubits[0], arch

    def get_backend_metadata(self, name: Optional[str] = None) -> list[BackendInfo]:
        """The ACTUAL quantum computer this server URL + config addresses.

        iqm-client v36 has no 'list all quantum computers' call, so we report
        the one real QC we can verify live: its qubit count and health come
        from the server. Names are never invented.
        """
        cfg = self._require_config()
        _ts, arch, _qc = self._architecture()
        qc_name = self._backend_name(cfg)
        qubits = len(getattr(arch, "qubits", ()) or [])
        healthy = True
        status_message = "IQM quantum computer (live architecture verified)"
        try:
            health = self._call("checking IQM server health", lambda client: client.get_health())
            if health:
                status_message = f"IQM server health: {redact(json.dumps(health)[:160])}"
        except ProviderError as exc:
            healthy = False
            status_message = redact(exc.message)
        return [
            BackendInfo(
                name=qc_name,
                simulator=False,
                operational=healthy,
                pending_jobs=None,            # IQM does not expose queue depth — never fabricated
                qubits=qubits,
                status_message=status_message,
            )
        ]

    @staticmethod
    def _backend_name(cfg: IQMConfig) -> str:
        if cfg.quantum_computer:
            return cfg.quantum_computer
        # derive an honest display name from the server URL tail
        # e.g. https://cocos.resonance.meetiqm.com/garnet → cocos.resonance…/garnet
        tail = (cfg.server_url or "").rstrip("/").rsplit("/", 1)[-1] or (cfg.server_url or "iqm-server")
        return tail

    # ------------------------------------------------------------------ submit

    def submit_job(
        self,
        circuit: Any,
        shots: int,
        backend: Optional[str] = None,
        seed: Optional[str] = None,
    ) -> ProviderSubmission:
        if seed is not None:
            raise ProviderError(
                "INVALID_REQUEST",
                "Seeding is not supported in hardware mode — hardware outcomes cannot be seeded.",
                "Use simulator mode if you need reproducible runs for development.",
            )
        self.validate_circuit(circuit)
        cfg = self._require_config()

        # a different backend name = a different quantum computer on this server
        if backend and backend not in ("auto", self._backend_name(cfg)):
            if cfg.quantum_computer:
                raise ProviderError(
                    "INVALID_BACKEND",
                    f"Backend '{backend}' does not match this IQM configuration.",
                    f"This server is pinned to '{self._backend_name(cfg)}' via "
                    "IQM_QUANTUM_COMPUTER / IQM_SERVER_URL. Adjust .env to change QPU.",
                )
            cfg = self._with_quantum_computer(backend)

        # refresh BEFORE submitting: a rejected submission never creates a job,
        # so this proactive refresh also guarantees the retry below is safe
        self._maybe_refresh(cfg)

        def _do_submit(client: Any) -> Any:
            return client.submit_circuits([circuit], shots=shots)

        try:
            tracker = self._call(f"submitting to IQM quantum computer '{self._backend_name(cfg)}'", _do_submit)
            provider_job_id = str(tracker.job_id)
        except ProviderRateLimited:
            raise
        except ProviderError:
            raise                          # already translated (incl. auth retry inside _call)

        with self._lock:
            self._trackers[provider_job_id] = tracker
            self._submit_meta[provider_job_id] = {
                "backend": self._backend_name(cfg),
                "shots": shots,
                "submitted_at": time.time(),
            }
        return ProviderSubmission(
            provider_job_id=provider_job_id,
            backend=self._backend_name(cfg),
            submitted_at=str(tracker.job_id),
            transpiled_ops=[
                f"prx(π/2, π/2) @ {circuit.instructions[0].locus[0]}",
                f"measure → '{IQM_REGISTER_KEY}' @ {circuit.instructions[0].locus[0]}",
            ],
            raw={"provider": "iqm"},
        )

    def _with_quantum_computer(self, name: str) -> IQMConfig:
        """Reconfigured config selecting a specific quantum computer."""
        base = self._require_config()
        return IQMConfig(
            server_url=base.server_url,
            access_token=base.access_token,
            refresh_token=base.refresh_token,
            quantum_computer=name,
            qubit=base.qubit,
            auth_token_url=base.auth_token_url,
            auth_server_url=base.auth_server_url,
            auth_realm=base.auth_realm,
            auth_client_id=base.auth_client_id,
            auth_client_secret=base.auth_client_secret,
        )

    # ------------------------------------------------------------------ status

    def _tracker(self, provider_job_id: str) -> Any:
        with self._lock:
            tracker = self._trackers.get(provider_job_id)
        if tracker is not None:
            return tracker
        # re-attach after a restart: ask the server for the job
        def _fetch(client: Any) -> Any:
            return client.get_job(uuid_mod.UUID(provider_job_id))

        tracker = self._call(f"fetching IQM job '{provider_job_id}'", _fetch)
        with self._lock:
            self._trackers[provider_job_id] = tracker
        return tracker

    _IQM_STATUS_MAP = {
        "WAITING": (JobState.QUEUED, "job is waiting in the IQM queue"),
        "PROCESSING": (JobState.RUNNING, "circuit is executing on the IQM QPU"),
        "COMPLETED": (JobState.COMPLETED, "measurements returned by the IQM QPU"),
        "FAILED": (JobState.FAILED, None),
        "CANCELLED": (JobState.CANCELLED, "job was cancelled"),
    }

    def get_job_status(self, provider_job_id: str) -> ProviderStatusInfo:
        tracker = self._tracker(provider_job_id)

        def _update(client: Any) -> Any:
            tracker.update()
            return tracker.status

        raw = self._call(f"updating IQM job status '{provider_job_id}'", _update)
        name = str(getattr(raw, "name", raw)).upper()
        mapped = self._IQM_STATUS_MAP.get(name)
        if mapped is None:
            return ProviderStatusInfo(
                JobState.RUNNING,
                detail=f"unrecognized IQM job status reported: {redact(str(raw))}",
            )
        state, detail = mapped
        if state is JobState.FAILED:
            errors = getattr(tracker, "errors", None)
            detail = redact(str(errors)) if errors else "IQM reported a job failure"
        return ProviderStatusInfo(state, detail)

    # ------------------------------------------------------------------ result

    def get_job_result(self, provider_job_id: str, shots: int) -> ProviderResult:
        """PER-SHOT measurement retrieval — the number is never derived
        from aggregate counts."""
        def _measurements(client: Any) -> Any:
            return client.get_job_measurements(uuid_mod.UUID(provider_job_id))

        results = self._call(f"retrieving IQM measurements for job '{provider_job_id}'", _measurements)
        bits, counts = self._extract_bits(results, shots)

        meta = self._submit_meta.get(provider_job_id, {})
        cfg = self._config_loader()
        metadata: dict[str, Any] = {
            "job_id": provider_job_id,
            "register": IQM_REGISTER_KEY,
            "measurement_retrieval": "per-shot (get_job_measurements)",
            "bit_order": "shot order, first shot = first bit",
        }
        if self._arch_cache is not None:
            calibration = getattr(self._arch_cache[1], "calibration_set_id", None)
            if calibration:
                metadata["calibration_set_id"] = str(calibration)
        backend_name = meta.get("backend") or self._backend_name(cfg)
        return ProviderResult(
            provider_job_id=provider_job_id,
            backend=backend_name,
            bits=bits,
            counts=counts,
            metadata=metadata,
        )

    @staticmethod
    def _extract_bits(results: Any, shots: int) -> tuple[str, dict[str, int]]:
        """Strict extraction from CircuitMeasurementResults.

        Shape: list (per circuit) of {register_key: [shot][bit]}.
        We submitted ONE circuit with ONE single-qubit register, so we expect
        exactly one result dict and one register; every shot must carry
        exactly one 0/1 outcome. Anything else is an honest error.
        """
        try:
            if not isinstance(results, list) or len(results) != 1:
                raise ProviderResultError(
                    f"IQM returned {len(results) if isinstance(results, list) else 'non-list'} "
                    f"circuit result(s), expected exactly 1.",
                    "The job payload does not match the single-circuit QRNG submission.",
                )
            registers = dict(results[0] or {})
            if IQM_REGISTER_KEY in registers:
                rows = registers[IQM_REGISTER_KEY]
            elif len(registers) == 1:
                rows = next(iter(registers.values()))  # defensive: server renamed the register
            else:
                raise ProviderResultError(
                    f"IQM result registers {sorted(registers)} do not contain "
                    f"'{IQM_REGISTER_KEY}'.",
                    "Unexpected measurement register layout.",
                )
            bits = ""
            for row in rows:
                if not isinstance(row, (list, tuple)) or len(row) != 1:
                    raise ProviderResultError(
                        "IQM returned a multi-bit measurement row for a single-qubit circuit.",
                        "Expected exactly one measured bit per shot.",
                    )
                value = row[0]
                if value not in (0, 1):
                    raise ProviderResultError(
                        f"IQM returned a measurement outcome outside {{0, 1}}: {value!r}.",
                        "Refusing to use unexpected qubit outcomes.",
                    )
                bits += str(int(value))
        except ProviderResultError:
            raise
        except Exception as exc:
            raise ProviderResultError(
                f"Could not read per-shot measurement data from the IQM result: {redact(str(exc))}",
                "The job may not have produced a usable payload.",
            ) from exc
        if len(bits) != shots:
            raise ProviderResultError(
                f"IQM returned {len(bits)} measurement outcomes, expected {shots}.",
                "Refusing to display bits that do not match the requested shot count.",
            )
        counts = {"0": bits.count("0"), "1": bits.count("1")}
        return bits, counts

    # ------------------------------------------------------------------ errors

    def _redact_tokens(self, text: str) -> str:
        """Defense in depth: strip the provider's CURRENT in-memory tokens
        (including refreshed ones that env-based redact() cannot know)."""
        for token in (self._access_token, self._refresh_token):
            if token and len(token) >= 4 and token in text:
                text = text.replace(token, "[REDACTED]")
        return text

    def _translate(self, exc: Exception, action: str) -> ProviderError:
        """Normalize iqm-client / network exceptions into ProviderError, redacted."""
        status_code = getattr(exc, "status_code", None)
        name = type(exc).__name__
        raw = f"{name}: {exc}" if str(exc) else name
        message = self._redact_tokens(redact(raw))

        if status_code == 429 or "429" in str(status_code or ""):
            return ProviderRateLimited(
                f"IQM rate limit hit while {action}.",
                retry_after=60.0,
                hint="IQM Resonance limits submission frequency. Wait for the cooldown and retry.",
            )
        if status_code in (401, 403) or "auth" in name.lower():
            return ProviderError(
                "PROVIDER_AUTH_FAILED",
                f"IQM rejected the credentials while {action} ({message}).",
                "Check IQM_ACCESS_TOKEN (and IQM_REFRESH_TOKEN) in app/backend/.env — "
                "the token may be expired or revoked.",
            )
        if "CircuitValidation" in name:
            return ProviderError(
                "CIRCUIT_REJECTED",
                f"IQM rejected the circuit while {action} ({message}).",
                "The QPU calibration may not support this circuit right now.",
            )
        if status_code == 404 or "NotFound" in name:
            return ProviderError(
                "PROVIDER_NOT_FOUND",
                f"IQM returned 'not found' while {action} ({message}).",
                "The job, quantum computer, or server URL may be wrong.",
            )
        if "GatewayTimeout" in name or "OperationTimeout" in name or "Timeout" in name:
            return ProviderError(
                "PROVIDER_TIMEOUT",
                f"IQM timed out while {action} ({message}).",
                "The QPU may be busy. The job status is retained — refresh before "
                "resubmitting to avoid duplicate quantum jobs.",
            )
        if status_code and int(status_code) >= 500:
            return ProviderError(
                "PROVIDER_UNAVAILABLE",
                f"IQM service error while {action} ({message}).",
                "This is on IQM's side — retry in a moment.",
            )
        if "Connection" in name or "requests.exceptions" in str(type(exc)):
            return ProviderError(
                "PROVIDER_UNAVAILABLE",
                f"Could not reach the IQM server while {action} ({message}).",
                "Check IQM_SERVER_URL and network access.",
            )
        return ProviderError(
            "PROVIDER_ERROR",
            f"IQM failure while {action} ({message}).",
            "Check the backend log for details, then retry. No bits were fabricated.",
        )
