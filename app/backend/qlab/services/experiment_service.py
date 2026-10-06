"""Experiment store — in-memory + JSONL persistence.

MVP state per TRD §2: in-memory with a small append-only JSONL log so
experiments survive server restarts (TRD §17: "Persist internal job IDs
for resumability where feasible" / "Allow the user to reload an
experiment result after submission"). No database for the MVP.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Callable, Optional

from ..models import Experiment, JobState, TERMINAL_STATES


class ExperimentStore:
    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir
        self._file = data_dir / "experiments.jsonl"
        self._experiments: dict[str, Experiment] = {}
        self._lock = threading.RLock()
        self._seq = 0
        self._load()

    # ------------------------------------------------------------ persistence

    def _load(self) -> None:
        if not self._file.exists():
            return
        try:
            with self._file.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        record = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    exp = Experiment.from_record(record)
                    if exp is not None:
                        self._experiments[exp.id] = exp
                        self._seq = max(self._seq, self._seq_of(exp.id))
        except OSError:
            pass  # unreadable persistence → start empty rather than crash

    @staticmethod
    def _seq_of(experiment_id: str) -> int:
        try:
            return int(experiment_id.split("-")[1])
        except (IndexError, ValueError):
            return 0

    def _append(self, exp: Experiment) -> None:
        try:
            self._data_dir.mkdir(parents=True, exist_ok=True)
            with self._file.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(exp.to_persist_dict(), separators=(",", ":")) + "\n")
        except OSError:
            pass  # persistence is best-effort; the in-memory record still works

    # ------------------------------------------------------------ operations

    def create(self, **kwargs: Any) -> Experiment:
        with self._lock:
            self._seq += 1
            exp = Experiment(id=f"EXP-{self._seq:05d}", **kwargs)
            self._experiments[exp.id] = exp
            return exp

    def get(self, experiment_id: str) -> Optional[Experiment]:
        with self._lock:
            return self._experiments.get(experiment_id)

    def list(self, limit: int = 100, kind: Optional[str] = None) -> list[Experiment]:
        with self._lock:
            exps = list(self._experiments.values())
        if kind:
            exps = [e for e in exps if e.kind == kind]
        exps.sort(key=lambda e: e.created_at, reverse=True)
        return exps[:limit]

    def mutate(self, experiment_id: str, fn: Callable[[Experiment], None]) -> Optional[Experiment]:
        """Apply fn to the experiment under the store lock; persist on terminal."""
        with self._lock:
            exp = self._experiments.get(experiment_id)
            if exp is None:
                return None
            fn(exp)
            if exp.status in TERMINAL_STATES:
                self._append(exp)      # terminal states are always persisted
            return exp

    def persist(self, experiment_id: str) -> None:
        """Persist a terminal experiment created outside the job manager."""
        with self._lock:
            exp = self._experiments.get(experiment_id)
            if exp is not None and exp.status in TERMINAL_STATES:
                self._append(exp)

    def latest_completed(self, kind: Optional[str] = None, source: Optional[str] = None) -> Optional[Experiment]:
        with self._lock:
            exps = [e for e in self._experiments.values() if e.status is JobState.COMPLETED and e.bits]
        if kind:
            exps = [e for e in exps if e.kind == kind]
        if source:
            exps = [e for e in exps if e.source == source]
        if not exps:
            return None
        exps.sort(key=lambda e: e.completed_at or e.created_at, reverse=True)
        return exps[0]
