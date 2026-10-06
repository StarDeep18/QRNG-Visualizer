"""Job-state normalization: provider statuses → TRD lifecycle (TRD §8)."""

from __future__ import annotations

from qlab.models import JobState
from qlab.providers.base import normalize_status


class _FakeStatus:
    def __init__(self, name: str):
        self.name = name


def test_enum_like_status_objects():
    assert normalize_status(_FakeStatus("INITIALIZING")) is JobState.VALIDATING
    assert normalize_status(_FakeStatus("VALIDATING")) is JobState.VALIDATING
    assert normalize_status(_FakeStatus("QUEUED")) is JobState.QUEUED
    assert normalize_status(_FakeStatus("RUNNING")) is JobState.RUNNING
    assert normalize_status(_FakeStatus("DONE")) is JobState.COMPLETED
    assert normalize_status(_FakeStatus("ERROR")) is JobState.FAILED
    assert normalize_status(_FakeStatus("CANCELLED")) is JobState.CANCELLED


def test_string_statuses():
    assert normalize_status("QUEUED") is JobState.QUEUED
    assert normalize_status("running") is JobState.RUNNING
    assert normalize_status("completed") is JobState.COMPLETED
    assert normalize_status("failed") is JobState.FAILED
    assert normalize_status("cancelled") is JobState.CANCELLED
    assert normalize_status("ratelimited") is JobState.RATE_LIMITED
    assert normalize_status("JobStatus.QUEUED") is JobState.QUEUED


def test_unknown_status_returns_none_not_a_guess():
    """Unrecognized provider states must never be guessed as a fake state."""
    assert normalize_status("SOMETHING_NEW") is None
    assert normalize_status(None) is None
    assert normalize_status("") is None


def test_no_provider_state_maps_to_completed_by_accident():
    for raw in ("INITIALIZING", "VALIDATING", "QUEUED", "RUNNING", "PENDING"):
        assert normalize_status(raw) is not JobState.COMPLETED
