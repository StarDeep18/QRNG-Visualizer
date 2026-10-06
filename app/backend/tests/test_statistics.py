"""Statistics service: counts, percentages, sigma band, z-score."""

from __future__ import annotations

import pytest

from qlab.services.statistics_service import binomial_sigma_pct, count_bits, distribution


def test_count_bits():
    assert count_bits("0101") == (2, 2)
    assert count_bits("111") == (0, 3)
    with pytest.raises(ValueError):
        count_bits("012")
    with pytest.raises(ValueError):
        count_bits("")


def test_distribution_basic():
    d = distribution("0100")
    assert d["zero_count"] == 3
    assert d["one_count"] == 1
    assert d["observed_zero_pct"] == 75.0
    assert d["observed_one_pct"] == 25.0
    assert d["theoretical_zero_pct"] == 50.0
    assert d["theoretical_one_pct"] == 50.0


def test_sigma_shrinks_with_shots():
    assert binomial_sigma_pct(100) == pytest.approx(5.0)
    assert binomial_sigma_pct(400) == pytest.approx(2.5)
    assert binomial_sigma_pct(10000) == pytest.approx(0.5)


def test_z_score_within_band_for_typical_run():
    # 256 shots, 130 ones → 50.78% vs 50% → z = 0.78/3.125 = 0.25
    bits = "1" * 130 + "0" * 126
    d = distribution(bits)
    assert d["sigma_pct"] == pytest.approx(3.125, abs=0.01)   # API rounds to 2 decimals
    assert d["z_score"] == pytest.approx(0.25, abs=0.02)


def test_z_score_flags_larger_deviation():
    bits = "1" * 200 + "0" * 100          # 66.7% ones over 300 shots
    d = distribution(bits)
    assert d["z_score"] > 5


def test_distribution_rejects_empty():
    with pytest.raises(ValueError):
        distribution("")
