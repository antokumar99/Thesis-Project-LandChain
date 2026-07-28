# LandChain — Security Model and Analysis

This document states the system's threat model, its security properties, and
for each property the exact mechanism that enforces it and the assumption it
reduces to. It replaces the earlier informal design reasoning.

## 1. Actors and trust assumptions

| Actor | Capabilities | Trusted for |
|---|---|---|
| **Owner / Buyer (users)** | Browser client; holds an *owner secret* that never leaves the device | Their own secret's confidentiality |
| **Authority** | Fixed account; approves/rejects registrations; owns the on-chain registry | Deciding *which* commitments enter the registry (legal gatekeeping) — **not** trusted for root integrity, secrets, or transfer authorization |
| **Server operator** | Runs the API + database; sees all API traffic | Availability and metadata only — **not** trusted with secrets or proof soundness |
| **Ethereum network** | Executes `LandRegistry`, `Verifier`, `RootVerifier` | Integrity/availability of anchored state (standard L1 assumptions) |
| **Adversary** | Any of: malicious user, compromised server/operator, network observer of the public chain | — |

Cryptographic assumptions: collision resistance of Poseidon over BN254,
soundness + zero-knowledge of Groth16 (per-circuit trusted setup), collision
resistance of keccak256, and standard JWT/TLS transport security for the
web tier.

## 2. Security properties

### P1 — End-to-end secret confidentiality
**Claim.** No party other than the owner — including the server operator and
database — ever observes an owner secret or any value from which it can be
recovered.

**Mechanism.** The secret exists only in the owner's browser:

- Registration (`apps/client/src/app/lands/request/page.tsx`) derives
  `secretField = keccak(landId ‖ secret) mod p` and submits only
  `Poseidon(landIdField, secretField)` — the API (`POST /api/lands/request`)
  accepts commitments, never secrets (`land.validator.ts`).
- All four proof types are generated **in the browser** with the snarkjs wasm
  prover (`apps/client/src/lib/zk.ts`); the API (`POST /api/proofs/submit`,
  `POST /api/challenges/:id/respond`) accepts only `{proof, publicSignals}`.
- Purchases submit the buyer's fresh commitments (`POST /api/transfers/buy`),
  derived locally.

Secrets are **256-bit CSPRNG values**, never user-chosen passphrases
(`generateOwnerSecret()` in `apps/client/src/lib/zk.ts`; `isValidOwnerSecret()`
rejects anything that is not 32 random bytes). This is load-bearing: a
commitment is `Poseidon(landIdField, secretField)` and commitments are
visible to the operator, so a low-entropy secret would be recoverable by
offline dictionary search and the reduction below would not hold.

**Reduction.** Recovering a secret from what the server sees requires
inverting Poseidon or breaking Groth16 zero-knowledge. Compromise of the
server/database therefore yields commitments and proofs but no secrets: the
"privacy-preserving" claim holds against the operator, not just the public
ledger.

Deed documents are encrypted with AES-256-GCM before they reach disk or IPFS
(`apps/server/src/utils/deedCrypto.util.ts`). Without this, the on-chain deed
CID would let any observer fetch a plaintext deed from a public gateway and
read the owner's identity off the document, bypassing the commitment scheme
entirely.

*Residual:* the server still learns **metadata** (which authenticated account
owns which land record); the authority requires this by design for legal
gatekeeping. Anonymity against the *public* is provided by P5. The on-chain
record is identity-free — no owner address is stored or emitted — but a
transfer transaction necessarily carries the buyer's address in calldata so
the contract can re-derive the challenge; that is a one-time disclosure at
transfer time, not a persistent association.

### P2 — Proof-gated ownership transfer (soundness)
**Claim.** A land record can only be transferred with the cooperation of the
current secret-holder, and each proof authorizes at most one transfer for one
specific buyer.

**Mechanism.** `LandRegistry.verifyAndTransfer` enforces, in order:
1. `publicSignals[1] == land.landIdField` — proof binds to *this* land;
2. `publicSignals[2] == roots.latestRoot` — proof binds to the *current* tree;
3. `publicSignals[3] == keccak(buyer, challengeSalt) mod p` — proof answers a
   challenge derived from *this* buyer (no redirection);
4. `!usedNullifiers[publicSignals[0]]` — single use (no replay);
5. `verifier.verifyProof(...)` — Groth16 verification of
   `challengeProof.circom`, whose witness requires the owner secret *and* a
   Merkle path from `Poseidon(landIdField, secretField)` to `merkleRoot`
   verified **inside the circuit**.

The server re-checks the same five conditions at purchase time
(`transfer.service.ts`) so offline mode is no weaker.

**Reduction.** Forging a transfer requires forging a Groth16 proof or finding
a Poseidon collision.

### P3 — Verified root transitions (shielded-registry consistency)
**Claim.** The contract never accepts an off-chain root computation: every
anchored root is provably the previous anchored root with **exactly one leaf
changed**, starting from the provably empty tree.

**Mechanism.** `rootTransition.circom` proves
`fold(path, leafBefore) = oldRoot ∧ fold(path, leafAfter) = newRoot` for one
shared path (so all sibling subtrees are unchanged).
`LandRegistry.updateMerkleRoot(newRoot, transition)` requires:
- `transition.signals[oldRoot] == roots.latestRoot` (or the hard-coded
  `EMPTY_TREE_ROOT` for the first anchor),
- `transition.signals[newRoot] == newRoot`,
- `RootVerifier.verifyProof(...)` passes.

The backend generates this proof on every approval (insertion,
`leafBefore = 0`) and every sale (removal, `leafAfter = 0`).

**Reduction.** An operator/authority that anchors a root *not* reachable by a
chain of verified single-leaf updates must forge a Groth16 proof. Every
membership/challenge proof any user verifies is therefore grounded in an
on-chain root whose entire history is consistency-proven.

*Residual:* `bootstrapRoot` is a one-time migration escape hatch, callable
only while no root has ever been anchored; it emits a distinct event so
explorers can flag registries that did not start from the empty tree. The
authority also still *chooses* which commitments enter (censorship remains
possible — it is the registry's legal function); P3 removes silent
*substitution*, not gatekeeping.

### P4 — Replay and context-binding resistance
**Claim.** No proof can be reused outside the exact context it was produced
for.

**Mechanism.** Challenge proofs bind a buyer-derived one-time nonce (P2.3)
and a nullifier consumed on-chain (P2.4) and server-side
(`usedForTransferAt`). Commitment-opening and area proofs are bound to a
specific `landIdField`/commitment checked at submission
(`proof.service.submitProof`), and membership proofs to the current root.
Server-side, submission requires the authenticated owner of the land record,
so even a *valid* stolen proof cannot be attached by another account (tested
in the smoke suite).

### P5 — Registry-membership anonymity
**Claim.** A membership proof reveals only "some registered land" plus a
nullifier unlinkable to the challenge-response nullifier space.

**Mechanism.** `landOwnership.circom` publishes only
`nullifier = Poseidon(Poseidon(secretField, landIdField), D)` with a fixed
domain tag `D = keccak("landchain:membership-nullifier") mod p`, preventing
the cross-protocol linkage attack described in the circuit header. The buyer
learns *which* land only in challenge-response proofs, where that is the
point.

### P6 — Area privacy (selective disclosure)
**Claim.** An area-range proof reveals only `area ≥ minArea`.

**Mechanism.** `areaRange.circom` range-checks both operands to 64 bits
(`Num2Bits`) before `GreaterEqThan`, preventing field-overflow tricks, and
opens `Poseidon(area, salt)` inside the circuit.

## 3. What the ZK layer does NOT protect (explicit non-goals)

1. **Authority gatekeeping** — the fixed authority decides admissions;
   a corrupt authority can refuse to register or can dispute lands. This is
   the intended legal model, mitigated by the on-chain audit trail (P3 events).
2. **Server metadata** — account↔land linkage inside the operator database.
3. **Secret loss/theft at the endpoint** — a user who loses the secret loses
   the ability to prove; malware in the owner's browser is out of scope.
4. **Web-tier hardening** — JWT/session management follows standard practice
   but has not undergone independent audit.
5. **Trusted setup** — each circuit's zkey came from a development ceremony;
   a production deployment must re-run a multi-party ceremony.

## 4. Verification of the analysis

Every property above is exercised by an automated test:

| Property | Test |
|---|---|
| P1 | `apps/server npm run smoke` — services accept only commitments/proofs; secret never passed |
| P2 | `contracts npx hardhat test` — real proof accepted; tampered proof, wrong land, wrong buyer, replay, stale root all revert |
| P3 | `contracts npx hardhat test` — valid transition accepted; wrong `newRoot`, non-chaining `oldRoot`, tampered proof revert; bootstrap single-use |
| P4 | smoke: stolen-proof submission, tampered signals, buy-before-verify all rejected |
| P5/P6 | `circuits npm run e2e` — signal layouts asserted; false statements unprovable |

Performance/evaluation numbers are produced by `circuits npm run benchmark`
(proving/verification latency, artifact sizes) and
`contracts npm run benchmark` (gas per operation, incl. both on-chain Groth16
verifications), and the contracts deploy unchanged to Sepolia via
`npm run deploy:sepolia`.
