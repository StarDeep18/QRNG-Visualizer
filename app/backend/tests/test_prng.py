"""PRNG unit tests: reproducibility, length, bit counting, golden vectors,
invalid input handling (Slice 1 / M1 acceptance)."""

from __future__ import annotations

import pytest

from qlab.services import prng_service


# ---------------------------------------------------------------- golden vectors

def test_splitmix64_reference_vector():
    """Independent verification against the canonical SplitMix64 outputs
    for state 0 (Steele & Lea / Vigna reference implementation)."""
    state = 0
    outputs = []
    for _ in range(3):
        state, out = prng_service.splitmix64_output(state)
        outputs.append(out)
    assert [f"{o:016x}" for o in outputs] == [
        "e220a8397b1dcdaf",
        "6e789e6aa1b965f4",
        "06c45d188009454f",
    ]


def test_golden_bit_sequence_pinned():
    """Pinned golden sequence — any accidental algorithm change breaks this."""
    run = prng_service.generate("42", 64)
    assert run.bits == "1000010101001110000110110011111111100010100110001100000111100110"


# ---------------------------------------------------------------- determinism

def test_same_seed_same_sequence():
    a = prng_service.generate("demo-seed", 512)
    b = prng_service.generate("demo-seed", 512)
    assert a.bits == b.bits


def test_different_seeds_differ():
    a = prng_service.generate("seed-a", 256)
    b = prng_service.generate("seed-b", 256)
    assert a.bits != b.bits


def test_numeric_and_string_seed_paths():
    int_run = prng_service.generate("12345", 128)
    str_run = prng_service.generate("12345", 128)
    assert int_run.bits == str_run.bits          # "12345" parses as an integer
    assert "integer seed" in int_run.derivation
    other = prng_service.generate("hello world", 128)
    assert "SHA-256" in other.derivation


def test_negative_integer_seed_is_deterministic():
    a = prng_service.generate("-7", 64)
    b = prng_service.generate("-7", 64)
    assert a.bits == b.bits


# ---------------------------------------------------------------- shape

@pytest.mark.parametrize("n", [1, 8, 256, 4096])
def test_output_length_matches_request(n):
    run = prng_service.generate("len", n)
    assert len(run.bits) == n
    assert set(run.bits) <= {"0", "1"}


def test_counts_consistent():
    run = prng_service.generate("counts", 1000)
    zeros = run.bits.count("0")
    ones = run.bits.count("1")
    assert zeros + ones == 1000
    assert abs(zeros - ones) < 150          # sanity: roughly balanced, NOT required to be equal


def test_bit_is_msb_of_output():
    """Each bit must be the MSB of successive SplitMix64 outputs."""
    state, _ = prng_service.derive_seed_state("msb-check")
    expected = []
    for _ in range(16):
        state, out = prng_service.splitmix64_output(state)
        expected.append("1" if out >> 63 else "0")
    assert prng_service.generate("msb-check", 16).bits == "".join(expected)


# ---------------------------------------------------------------- invalid input

@pytest.mark.parametrize("bits", [0, -1])
def test_invalid_bit_count(bits):
    with pytest.raises(ValueError):
        prng_service.generate("x", bits)


def test_result_dict_shape():
    run = prng_service.generate("shape", 128)
    payload = prng_service.result_dict(run)
    assert payload["algorithm"] == "splitmix64"
    assert payload["seed"] == "shape"
    assert payload["zero_count"] + payload["one_count"] == 128
    assert payload["theoretical_zero_pct"] == 50.0
    assert abs(payload["observed_zero_pct"] + payload["observed_one_pct"] - 100.0) < 1e-9
