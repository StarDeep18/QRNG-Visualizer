"""Simulator provider: labelled, instant, correct — and can never
masquerade as hardware."""

from __future__ import annotations

import pytest

from qlab.models import JobState
from qlab.providers.simulator_provider import SIMULATOR_BACKEND_NAME, SimulatorProvider


@pytest.fixture
def provider():
    return SimulatorProvider()


def test_provider_is_labelled_simulator(provider):
    assert provider.is_simulator is True
    assert provider.name == "local_statevector"
    describe = provider.describe()
    assert describe["simulator"] is True


def test_full_lifecycle(provider):
    circuit = provider.create_qrng_circuit()
    submission = provider.submit_job(circuit, shots=100)
    assert submission.backend == SIMULATOR_BACKEND_NAME
    status = provider.get_job_status(submission.provider_job_id)
    assert status.status is JobState.COMPLETED
    result = provider.get_job_result(submission.provider_job_id, shots=100)
    assert len(result.bits) == 100
    assert set(result.bits) <= {"0", "1"}
    assert sum(result.counts.values()) == 100
    assert result.metadata["simulator"] is True


def test_unseeded_runs_differ(provider):
    circuit = provider.create_qrng_circuit()
    a = provider.submit_job(circuit, shots=200)
    b = provider.submit_job(circuit, shots=200)
    bits_a = provider.get_job_result(a.provider_job_id, 200).bits
    bits_b = provider.get_job_result(b.provider_job_id, 200).bits
    assert bits_a != bits_b


def test_seeded_runs_are_reproducible(provider):
    circuit = provider.create_qrng_circuit()
    a = provider.submit_job(circuit, shots=200, seed="dev-seed")
    b = provider.submit_job(circuit, shots=200, seed="dev-seed")
    bits_a = provider.get_job_result(a.provider_job_id, 200).bits
    bits_b = provider.get_job_result(b.provider_job_id, 200).bits
    assert bits_a == bits_b


def test_simulator_distribution_is_near_5050(provider):
    circuit = provider.create_qrng_circuit()
    submission = provider.submit_job(circuit, shots=4096)
    result = provider.get_job_result(submission.provider_job_id, 4096)
    ones = result.bits.count("1")
    assert abs(ones - 2048) < 4 * 64             # within 4σ


def test_unknown_job_errors(provider):
    from qlab.providers.base import ProviderError

    with pytest.raises(ProviderError):
        provider.get_job_status("sim-doesnotexist")
    with pytest.raises(ProviderError):
        provider.get_job_result("sim-doesnotexist", 10)


def test_rejects_unknown_backend(provider):
    from qlab.providers.base import ProviderError

    with pytest.raises(ProviderError):
        provider.submit_job(provider.create_qrng_circuit(), shots=10, backend="ibm_brisbane")
