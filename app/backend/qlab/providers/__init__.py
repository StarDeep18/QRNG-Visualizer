"""Provider registry — the only place providers are constructed."""

from __future__ import annotations

from ..models import Mode
from .base import (
    BackendInfo,
    ProviderError,
    ProviderJobFailed,
    ProviderNotConfigured,
    ProviderRateLimited,
    ProviderResult,
    ProviderResultError,
    ProviderStatusInfo,
    ProviderSubmission,
    QuantumProvider,
    normalize_status,
)
from .ibm_provider import CREDENTIALS_HINT, IBMQuantumProvider
from .simulator_provider import SIMULATOR_BACKEND_NAME, SimulatorProvider


def build_default_providers() -> dict[str, QuantumProvider]:
    return {
        "ibm_quantum": IBMQuantumProvider(),
        "local_statevector": SimulatorProvider(),
    }


def provider_for_mode(providers: dict[str, QuantumProvider], mode: Mode) -> QuantumProvider:
    if mode is Mode.HARDWARE:
        return providers["ibm_quantum"]
    return providers["local_statevector"]


__all__ = [
    "BackendInfo",
    "ProviderError",
    "ProviderJobFailed",
    "ProviderNotConfigured",
    "ProviderRateLimited",
    "ProviderResult",
    "ProviderResultError",
    "ProviderStatusInfo",
    "ProviderSubmission",
    "QuantumProvider",
    "normalize_status",
    "IBMQuantumProvider",
    "SimulatorProvider",
    "SIMULATOR_BACKEND_NAME",
    "CREDENTIALS_HINT",
    "build_default_providers",
    "provider_for_mode",
]
