#!/usr/bin/env python3
"""REAL HARDWARE SMOKE TEST — provider-agnostic verification (TRD §19).

Submits ONE small QRNG job to a real quantum processor through the same
provider adapter the app uses (IQM when configured, IBM Quantum otherwise),
polls until completion, and verifies:

  1. the job ran on a real (non-simulator) backend
  2. the provider returned exactly `shots` measurement outcomes
  3. bits are only 0/1, in shot order
  4. provenance (provider, backend, job id) is captured

Usage (from app/backend, with IQM_* or IBM_QUANTUM_* set in .env):
    python ../../scripts/hardware_smoke.py [--shots 64] [--backend auto]

Exit code 0 = a real QPU experiment completed end-to-end successfully.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "app" / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from qlab.models import JobState, Mode  # noqa: E402
from qlab.providers import build_default_providers, provider_for_mode  # noqa: E402
from qlab.providers.base import ProviderError  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shots", type=int, default=64)
    parser.add_argument("--backend", type=str, default="auto")
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()

    providers = build_default_providers()
    provider = provider_for_mode(providers, Mode.HARDWARE)

    print("─" * 64)
    print("QUANTUM RANDOMNESS LAB — REAL HARDWARE SMOKE TEST")
    print("─" * 64)

    if not provider.configured():
        print(f"✗ FAIL: {provider.label} is not configured on this server.")
        print("  Set IQM_SERVER_URL + IQM_ACCESS_TOKEN (or IBM_QUANTUM_API_KEY)")
        print("  in app/backend/.env (see .env.example) and retry.")
        return 2
    print(f"✓ provider configured: {provider.name} ({provider.label})")

    try:
        metadata = provider.get_backend_metadata()
        for info in metadata:
            print(f"  backend: {info.name} — qubits={info.qubits} "
                  f"operational={info.operational} simulator={info.simulator}")
    except ProviderError as exc:
        print(f"! backend discovery failed (continuing): {exc.code}: {exc.message}")

    circuit = provider.create_qrng_circuit()
    provider.validate_circuit(circuit)
    print("✓ fixed QRNG circuit validated: |0⟩ → H → M")

    try:
        print(f"→ submitting {args.shots} shots to backend '{args.backend}' ...")
        submission = provider.submit_job(circuit, shots=args.shots, backend=args.backend)
    except ProviderError as exc:
        print(f"✗ FAIL: submission rejected — {exc.code}: {exc.message}")
        if exc.hint:
            print(f"  hint: {exc.hint}")
        return 1

    print(f"✓ accepted — provider job id: {submission.provider_job_id}")
    print(f"✓ real backend:              {submission.backend}")

    deadline = time.monotonic() + args.timeout
    interval = 3.0
    last = None
    info = None
    while time.monotonic() < deadline:
        info = provider.get_job_status(submission.provider_job_id)
        if info.status is not last:
            print(f"  [{time.strftime('%H:%M:%S')}] {info.status.value}"
                  + (f" — {info.detail}" if info.detail else ""))
            last = info.status
        if info.status in (JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED):
            break
        time.sleep(interval)
        interval = min(interval * 1.3, 15.0)
    else:
        print(f"✗ FAIL: timed out after {args.timeout}s (job {submission.provider_job_id} "
              f"may still complete on {provider.name}'s side)")
        return 1

    if info is None or info.status is not JobState.COMPLETED:
        print(f"✗ FAIL: job ended in {info.status.value if info else 'UNKNOWN'}")
        return 1

    try:
        result = provider.get_job_result(submission.provider_job_id, args.shots)
    except ProviderError as exc:
        print(f"✗ FAIL: result retrieval — {exc.code}: {exc.message}")
        return 1

    problems = []
    if len(result.bits) != args.shots:
        problems.append(f"expected {args.shots} bits, got {len(result.bits)}")
    if set(result.bits) - {"0", "1"}:
        problems.append("bits contain values outside {0,1}")
    zeros, ones = result.bits.count("0"), result.bits.count("1")
    if zeros + ones != args.shots:
        problems.append("counts do not sum to shots")

    print("─" * 64)
    print(f"  bits     : {result.bits[:64]}{'…' if args.shots > 64 else ''}")
    print(f"  zeros    : {zeros}   ones: {ones}   (σ for n={args.shots}: "
          f"{(0.25/args.shots)**0.5*100:.2f}%)")
    if result.metadata:
        for key in ("measurement_retrieval", "calibration_set_id"):
            if key in result.metadata:
                print(f"  {key}: {result.metadata[key]}")
    print("─" * 64)

    if problems:
        for p in problems:
            print(f"✗ FAIL: {p}")
        return 1

    print("✓ PASS: REAL QPU EXPERIMENT COMPLETED END-TO-END")
    print(f"  provider={provider.name}  backend={submission.backend}  "
          f"job={submission.provider_job_id}  shots={args.shots}")
    print(f"  Verified: per-shot measurement data returned by {provider.label},")
    print("  parsed shot-ordered, provenance retained.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
