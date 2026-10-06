"""Experiment store: persistence round-trip + restart recovery."""

from __future__ import annotations

from qlab.config import Limits
from qlab.models import JobState, Mode
from qlab.providers.simulator_provider import SimulatorProvider
from qlab.services.experiment_service import ExperimentStore
from qlab.services.job_manager import JobManager
from qlab.services.qrng_service import QrngService


def _stack(tmp_path, limits=None):
    limits = limits or Limits(min_shots=8, max_shots=4096, default_shots=256,
                              max_bits=8192, default_bits=256, job_timeout_s=30,
                              submit_cooldown_s=0, poll_initial_s=0.02, poll_max_s=0.05)
    store = ExperimentStore(tmp_path / "data")
    providers = {"ibm_quantum": SimulatorProvider(), "local_statevector": SimulatorProvider()}
    jobs = JobManager(store, limits)
    qrng = QrngService(store, jobs, providers, limits)
    return store, jobs, qrng


def test_completed_experiment_survives_restart(tmp_path):
    import time
    store, jobs, qrng = _stack(tmp_path)
    exp = qrng.create_job(shots=64, mode=Mode.SIMULATOR)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if store.get(exp.id).status is JobState.COMPLETED:
            break
        time.sleep(0.02)
    assert store.get(exp.id).status is JobState.COMPLETED
    bits = store.get(exp.id).bits

    # "restart": a brand-new store over the same data dir
    store2, _, _ = _stack(tmp_path)
    recovered = store2.get(exp.id)
    assert recovered is not None
    assert recovered.status is JobState.COMPLETED
    assert recovered.bits == bits
    assert recovered.source == "quantum_simulator"
    assert recovered.provider == "local_statevector"


def test_list_and_latest_completed(tmp_path):
    store, jobs, qrng = _stack(tmp_path)
    import time
    a = qrng.create_job(shots=16, mode=Mode.SIMULATOR)
    time.sleep(0.3)
    b = qrng.create_job(shots=16, mode=Mode.SIMULATOR)
    for eid in (a.id, b.id):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and store.get(eid).status is not JobState.COMPLETED:
            time.sleep(0.02)
    latest = store.latest_completed(kind="qrng")
    assert latest.id == b.id
    assert len(store.list()) == 2
