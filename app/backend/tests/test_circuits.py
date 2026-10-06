"""Fixed QRNG circuit: construction, validation, spec."""

from __future__ import annotations

import pytest
from qiskit import QuantumCircuit

from qlab.circuits import (
    build_qrng_circuit,
    circuit_spec,
    transpiled_ops,
    validate_qrng_circuit,
)


def test_circuit_structure():
    qc = build_qrng_circuit()
    assert qc.num_qubits == 1
    assert qc.num_clbits == 1
    ops = dict(qc.count_ops())
    assert ops == {"h": 1, "measure": 1}


def test_validate_accepts_the_fixed_circuit():
    validate_qrng_circuit(build_qrng_circuit())


def test_validate_rejects_tampered_circuits():
    with pytest.raises(ValueError):
        validate_qrng_circuit(QuantumCircuit(2, 1))          # wrong qubit count
    with pytest.raises(ValueError):
        validate_qrng_circuit(QuantumCircuit(1, 2))          # wrong clbit count
    bad = QuantumCircuit(1, 1); bad.x(0); bad.measure(0, 0)  # wrong gate
    with pytest.raises(ValueError):
        validate_qrng_circuit(bad)
    bad2 = QuantumCircuit(1, 1); bad2.h(0)                   # no measurement
    with pytest.raises(ValueError):
        validate_qrng_circuit(bad2)
    bad3 = QuantumCircuit(1, 1); bad3.h(0); bad3.h(0); bad3.measure(0, 0)  # two H
    with pytest.raises(ValueError):
        validate_qrng_circuit(bad3)


def test_circuit_spec_shape():
    spec = circuit_spec()
    assert spec["qubits"] == 1
    assert spec["classical_bits"] == 1
    assert [g["type"] for g in spec["gates"]] == ["h", "measure"]
    assert spec["state_sequence"][1]["state"] == "(|0⟩ + |1⟩)/√2"
    assert "OPENQASM" in spec["qasm2"]


def test_transpiled_ops_format():
    ops = transpiled_ops(build_qrng_circuit())
    assert ops == ["h", "measure"]
