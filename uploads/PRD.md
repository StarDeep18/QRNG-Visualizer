# Quantum Randomness Lab — Product Requirements Document

## 1. Product Summary

Quantum Randomness Lab is an interactive visualization website that compares classical pseudorandom number generation (PRNG) with quantum random number generation (QRNG).

The QRNG mode is designed to use a **real quantum processor** through a cloud quantum provider, initially IBM Quantum.

The core value proposition:

> **Don't just see the random number — see where the randomness comes from.**

## 2. Problem

Users can easily obtain random numbers, but the generation mechanism is usually invisible.

For QRNG specifically, a user may see a sequence of bits without understanding:
- what quantum state was prepared
- what gate was applied
- how measurement occurred
- where the returned bit came from
- whether the result came from actual hardware or a simulation

There is also no central experience in the project that directly compares PRNG and QRNG while visualizing their generation processes.

## 3. Goals

### Primary goals
- Build a high-quality interactive QRNG/PRNG visualization website.
- Make the quantum generation process understandable without oversimplifying it.
- Execute the QRNG circuit on real quantum hardware in hardware mode.
- Visually connect circuit → execution → measurement → bit stream.
- Let users compare PRNG reproducibility with QRNG measurement output.
- Make the product credible enough for a live academic/hackathon demonstration.

### Secondary goals
- Provide transparent experiment metadata.
- Provide a replayable measurement visualization.
- Provide observed vs theoretical distribution.
- Make the design itself feel like a preview of a high-quality visualization product.

## 4. Non-Goals

- Building a full quantum programming IDE.
- Supporting many quantum providers in MVP.
- Proving cryptographic security through a single demo.
- Claiming statistical tests alone prove quantum origin.
- Replacing all quantum simulators or classical RNGs.
- Building a general-purpose cloud job manager.

## 5. Target Users

### Primary
**Students / educators**  
Need an intuitive way to understand what a QRNG circuit is doing.

**Hackathon judges / professors**  
Need evidence that the prototype is technically real and visually strong.

**Curious technical users**  
Want to inspect the circuit, measurements, and resulting stream.

## 6. Core User Stories

### PRNG
- As a user, I can choose PRNG mode.
- As a user, I can enter a seed.
- As a user, I can choose how many bits to generate.
- As a user, I can generate a sequence.
- As a user, I can regenerate with the same seed and see the same sequence.
- As a user, I can inspect 0/1 counts and distribution.

### QRNG
- As a user, I can choose QRNG mode.
- As a user, I can select hardware mode.
- As a user, I can choose a shot count within permitted limits.
- As a user, I can submit the quantum circuit.
- As a user, I can see job progress.
- As a user, I can see the actual backend/device name.
- As a user, I can see the quantum circuit.
- As a user, I can see measurement-derived bits.
- As a user, I can see cumulative 0/1 distribution.
- As a user, I can replay the generation process.

### Comparison
- As a user, I can compare PRNG and QRNG side by side.
- As a user, I can understand the difference in source and reproducibility.
- As a user, I can see comparable output sizes.

## 7. Information Architecture

Primary navigation:

- Home / Lab
- PRNG
- QRNG
- Compare
- Experiments / History (optional for MVP)

The central “Lab” view can also act as the single-screen experience for the demo.

## 8. Required Screens / States

### 8.1 Landing / Lab
Purpose:
- explain the product in one sentence
- let users choose PRNG or QRNG
- visually establish the quantum identity

### 8.2 PRNG Mode
Required:
- seed input
- bit count
- generate button
- deterministic output stream
- reproducibility action
- distribution
- metadata

### 8.3 QRNG Mode
Required:
- shot count
- hardware mode
- backend/device selector or display
- circuit visualization
- job lifecycle
- measurement results
- bit stream
- observed/theoretical distribution

### 8.4 Compare Mode
Required:
- PRNG path
- QRNG path
- same output length
- source labels
- reproducibility contrast
- distribution comparison

### 8.5 Error / Failure State
Must explain:
- authentication failure
- unavailable backend
- queue delay
- provider rate limit
- job failure
- timeout
- invalid user parameters

The user must never see a generic “Something went wrong” without useful recovery information.

## 9. QRNG Circuit Scope

MVP circuit:

`|0⟩ → H → Measure`

Equivalent state transition:

`|0⟩ → (|0⟩ + |1⟩)/√2 → measurement`

Use a single qubit and classical measurement bit for the baseline QRNG experiment.

## 10. Visualization Requirements

### Circuit
Show:
- initial qubit state
- Hadamard gate
- measurement
- classical output

### State transition
Visually indicate:
- definite state
- superposition
- measurement
- collapsed classical result

### Measurement
Show:
- current shot index
- measured value
- total shots
- completed shots

### Bit stream
Show:
- recent stream
- complete stream view
- optional copy/download

### Distribution
Show:
- theoretical probabilities
- observed counts
- observed percentages
- shot count

### Experiment metadata
Show:
- provider
- mode
- backend
- shots
- circuit
- timestamp
- job ID where appropriate

## 11. Signature Feature — Quantum Replay

The user can replay a completed QRNG experiment.

Replay stages:
1. initialize qubit
2. apply H
3. show superposition
4. measure
5. reveal result
6. append bit
7. repeat

Controls:
- Play
- Pause
- Step
- Speed
- Reset

Replay data must come from the completed experiment result.

## 12. Interaction Principles

- Every action gets immediate feedback.
- Long-running QPU work must show its current state.
- The UI should never fake real-time hardware progress.
- The user should understand whether they are in PRNG, QRNG hardware, or QRNG simulator mode.
- Hardware mode should be visually privileged.

## 13. Success Criteria

A demo is successful when a reviewer can:

1. Run PRNG in under a minute.
2. Re-run with the same seed and observe identical output.
3. Run QRNG hardware mode and see the actual provider/backend.
4. See the circuit and measurement result.
5. Understand how the bit stream is produced.
6. Compare PRNG and QRNG.
7. Explain the difference after using the interface without needing a long verbal explanation.

## 14. Acceptance Criteria

### PRNG
- Same seed + same configuration produces identical sequence.
- Output length matches requested length.
- Counts and percentages are mathematically consistent.

### QRNG
- Hardware mode calls real quantum provider.
- Returned bits are derived from provider measurement output.
- Backend name is displayed.
- Job ID is stored/displayed where appropriate.
- Simulator mode is explicitly labeled and cannot masquerade as hardware.
- UI handles queued/running/completed/error states.

### Comparison
- Both modes can produce comparable-length output.
- The interface clearly separates deterministic seed-based generation from hardware measurement.

## 15. MVP Priority

### P0 — Must have
- PRNG
- QRNG hardware execution
- circuit visualization
- job status
- bit stream
- 0/1 distribution
- comparison
- error states

### P1 — High value
- Quantum Replay
- experiment history
- copy/download output
- backend information panel

### P2 — Optional
- basic randomness diagnostics
- saved experiments
- additional quantum providers
- richer circuit exploration
