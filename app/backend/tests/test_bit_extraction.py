"""Bit extraction from provider result payloads (strict, shot-ordered).

Uses REAL qiskit BitArray/DataBin/PubResult containers so the parsing
path is exercised exactly as SamplerV2 returns it."""

from __future__ import annotations

import pytest
from qiskit.primitives.containers import BitArray, DataBin, PubResult

from qlab.providers.base import ProviderResultError
from qlab.providers.ibm_provider import IBMQuantumProvider


def _payload(bitstrings):
    ba = BitArray.from_samples(list(bitstrings))
    return [PubResult(DataBin(c=ba))]


def test_extract_shot_ordered_bits():
    bits, counts = IBMQuantumProvider._extract_bits(_payload(["0", "1", "1", "0"]), 4)
    assert bits == "0110"                       # shot order preserved
    assert counts == {"0": 2, "1": 2}


def test_extract_all_ones():
    bits, counts = IBMQuantumProvider._extract_bits(_payload(["1"] * 8), 8)
    assert bits == "11111111"
    assert counts == {"0": 0, "1": 8}


def test_wrong_shot_count_is_rejected():
    from qlab.providers.base import ProviderResultError

    with pytest.raises(ProviderResultError):
        IBMQuantumProvider._extract_bits(_payload(["0", "1"]), 4)


def test_missing_creg_is_rejected():
    from qlab.providers.base import ProviderResultError

    ba = BitArray.from_samples(["0", "1"])
    pub = PubResult(DataBin(wrong_name=ba))
    with pytest.raises(ProviderResultError):
        IBMQuantumProvider._extract_bits([pub], 2)


def test_bits_are_never_fabricated_on_garbage():
    from qlab.providers.base import ProviderResultError

    with pytest.raises(ProviderResultError):
        IBMQuantumProvider._extract_bits([{"not": "a result"}], 2)
