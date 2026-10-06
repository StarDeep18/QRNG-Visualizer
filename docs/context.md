# Quantum Randomness Lab — Project Context

## 1. Project Identity

**Project name:** Quantum Randomness Lab  
**Problem Statement:** Design a Basic QRNG using a quantum circuit that utilizes superposition and measurement to generate random bits. There is no website that shows how the random number is actually generated. Build a website that helps people visualize Quantum Random Number Generation.  
**Theme:** Quantum Random Number Generator  
**Category:** Hardware / Software  
**PS Number:** AQVH910

## 2. Project Vision

Quantum Randomness Lab is an interactive web product that makes the source of randomness visible.

The product compares:

1. **PRNG — Pseudorandom Number Generation**
   - Classical, algorithmic, deterministic.
   - Starts from a seed.
   - Same initial seed and algorithm can reproduce the same sequence.

2. **QRNG — Quantum Random Number Generation**
   - Uses a simple quantum circuit based on superposition and measurement.
   - The intended production path uses **real quantum hardware**, not a hidden simulator.
   - For the core circuit:
     `|0⟩ → H → measurement → 0 or 1`
   - Repeated hardware measurements become a bit stream.

The central product idea is:

> **Don't just see the random number — see where the randomness comes from.**

## 3. What Review 1 Established

The project presentation was reviewed by the professor and was judged positively. The implementation phase must now turn the concept into a working prototype.

The prototype should therefore prioritize:
- technical credibility
- real QRNG hardware execution
- clear visual explanation
- PRNG vs QRNG comparison
- polished interaction design

Do not regress into a generic random-number dashboard.

## 4. Source-of-Truth Product Narrative

The approved presentation defines this narrative:

### QRNG concept
A qubit starts in `|0⟩`.
A Hadamard gate produces:
`(|0⟩ + |1⟩) / √2`
Measurement yields `0` or `1`.
Repeated measurements produce random bits.

### Existing gaps
The project targets these user-facing gaps:
- black-box generation
- limited visualization
- lack of direct PRNG vs QRNG comparison
- inability to clearly distinguish simulation from real quantum hardware

### Solution
Quantum Randomness Lab connects:
`real quantum hardware → quantum process → measurement → observable random output`

### Core modes

**PRNG**
`Seed → Classical Algorithm → Deterministic Computation → Bit Stream`

**QRNG**
`|0⟩ → H → Superposition → Measurement → Bit → Bit Stream`

### Core output
The user should be able to see:
- the circuit
- execution status
- hardware/backend identity
- measurement events/results
- generated bit stream
- 0/1 distribution
- PRNG vs QRNG comparison

## 5. Product Principles

### Principle 1 — Truthful provenance
Every QRNG bit shown as hardware-generated must originate from returned measurement data from the configured real QPU path.

Do not use:
- `Math.random()`
- browser randomness
- a classical PRNG
- hidden simulator output
- fabricated API responses

inside the real QRNG hardware mode.

### Principle 2 — Hardware first
The intended QRNG experience is real quantum hardware.

A simulator may exist only as:
- development fallback
- local demo mode
- explicitly labelled simulator mode

Never silently substitute it for hardware mode.

### Principle 3 — Visualization is the product
The site is not simply an API wrapper.

The user must understand:
`what was submitted → what state the job is in → what quantum circuit ran → what was measured → what bits were produced`.

### Principle 4 — PRNG is the baseline
PRNG exists to make the QRNG concept easier to understand.

Do not imply that a statistical 50/50 result by itself proves quantum randomness.

### Principle 5 — Scientific honesty
For the one-qubit Hadamard circuit:
- theoretical probability is 50% for `0`
- theoretical probability is 50% for `1`
- finite-shot observed frequencies fluctuate around the theoretical probabilities

The UI should distinguish:
- **Theoretical**
- **Observed**

### Principle 6 — No fake status
Job stages shown in the UI must map to real backend state or explicitly labelled local UI transitions.

Never show “QPU running” when no QPU job exists.

## 6. Visual Direction

The product should inherit the approved presentation direction:

**Neo-Memphis × Swiss International × Quantum Computing**

### Swiss
- strong grid
- alignment
- typography hierarchy
- whitespace
- precise information structure

### Neo-Memphis
- geometric shapes
- circles
- dots
- diagonal forms
- asymmetric compositions
- controlled visual tension

### Quantum
- qubit notation
- circuit traces
- state transitions
- measurement nodes
- probability indicators
- binary streams

Avoid:
- generic dark-navy quantum themes
- glowing purple balls
- stock quantum-computer photography
- glassmorphism dashboards
- generic 3-card layouts
- excessive gradients
- random futuristic decoration
- AI-template-looking interfaces

The website should feel like a **visual laboratory**, not a generic SaaS dashboard.

## 7. Core User Experience

Primary path:

`Landing → Choose PRNG/QRNG → Generate → Watch Process → Inspect Results → Compare`

### PRNG
User:
1. enters seed
2. selects bit count
3. generates sequence
4. can repeat generation with the same seed
5. sees reproducibility

### QRNG
User:
1. enters shot count
2. chooses real QPU/hardware mode
3. submits the circuit
4. watches job state
5. sees circuit visualization
6. sees measurement results
7. sees bit stream grow
8. sees observed vs theoretical distribution
9. can inspect job/backend metadata

## 8. Signature Experience — Quantum Replay

A primary differentiator should be a “Quantum Replay” experience.

After a QRNG run, users can replay the measurement sequence visually:

`SHOT 001 → circuit → measured bit`

`SHOT 002 → circuit → measured bit`

`SHOT 003 → circuit → measured bit`

and so on.

The stream progressively becomes:

`1 → 10 → 101 → 1011 → 10110 → ...`

The replay must be driven by actual returned result data.

## 9. Current Intended Quantum Provider

The first provider is IBM Quantum / IBM Quantum Compute.

Current IBM documentation describes:
- `QiskitRuntimeService` as the client for IBM Quantum Compute.
- `SamplerV2` for sampled circuit execution.
- real operational backends can be selected with `simulator=False`.
- IBM's REST API can submit Runtime primitive jobs and return a job ID for status/result retrieval.
- the current REST documentation states a limit of 5 jobs per minute per user for job submission.

Source references:
- https://quantum.cloud.ibm.com/docs/en/api/qiskit-ibm-runtime/qiskit-runtime-service
- https://quantum.cloud.ibm.com/docs/en/api/qiskit-ibm-runtime/sampler-v2
- https://quantum.cloud.ibm.com/docs/en/api/qiskit-runtime-rest/tags/jobs

These are implementation references, not UI copy.

## 10. Credentials

IBM credentials must never be exposed to the browser.

Store them server-side through environment/configuration or an equivalent secret mechanism.

Never commit API keys.

Never place keys in frontend bundles.

## 11. Non-Goals

Do not expand the MVP into:
- a general quantum computing educational platform
- a quantum circuit composer
- a full cloud quantum job manager
- a large authentication platform
- a generic random-number API marketplace
- advanced quantum algorithms unrelated to QRNG
- a claims-heavy “quantum is always more random than PRNG” marketing page

## 12. MVP Definition

A successful MVP can:

1. Generate deterministic PRNG bits.
2. Submit the QRNG circuit to a real QPU.
3. Retrieve measurement results.
4. Display the actual backend/device name.
5. Visualize the circuit.
6. Visualize measurement and bit-stream creation.
7. Show observed 0/1 distribution.
8. Compare PRNG and QRNG.
9. Clearly distinguish hardware mode from simulator mode.
10. Handle failures and queued/running states honestly.

## 13. Working Style for Coding Agents

Agents must:
- read all project docs before coding
- preserve these product principles
- prefer small, testable vertical slices
- verify hardware integration early
- never replace the real QRNG path with a mock without clearly marking it
- keep code modular enough to swap IBM for another provider later
- document setup and environment variables
- leave the repository in a runnable state after each milestone

When ambiguity exists, prefer:
**truthfulness > convenience > visual trickery**.
