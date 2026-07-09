# LandChain Circuits

Four circom circuits — four distinct applications of zero-knowledge proofs. All use Poseidon (cheap in-circuit) and Groth16 via snarkjs. The backend stores Poseidon commitments too, so circuits and registry state agree end to end.

| Circuit | Private inputs | Public signals (snarkjs order) | Proves |
|---------|----------------|--------------------------------|--------|
| `commitmentProof` | ownerSecret | landIdField, commitment | Knowledge of the secret behind a land's commitment. |
| `landOwnership` | landIdField, ownerSecret, Merkle path | nullifier, merkleRoot | Ownership of *some* registry land (anonymous membership, depth-10 tree). |
| `challengeProof` | ownerSecret, Merkle path | responseNullifier, landIdField, merkleRoot, challenge | Current ownership of a specific land bound to a buyer's one-time nonce (replay-proof). |
| `areaRange` | areaValue, areaSalt | areaCommitment, minArea | Committed area ≥ minArea, exact area private. |

Field encodings (must match `apps/server/src/utils/field.util.ts`):

- `landIdField = keccak("landchain:land:" + landId) mod p`
- `secretField = keccak("landchain:secret:" + landId + ":" + secret) mod p`
- commitment = `Poseidon(landIdField, secretField)`; tree is fixed depth 10, zero leaf `0`.

## Commands

```bash
npm run compile   # circom → build/*.r1cs + build/*_js/*.wasm (needs circom on PATH)
npm run setup     # powers-of-tau (2^13) + groth16 zkeys + verification keys → keys/
npm run e2e       # prove + verify all four circuits, prints labeled public signals
```

The on-chain verifier (`contracts/contracts/ChallengeVerifier.sol`) is exported from the challenge circuit:

```bash
npx snarkjs zkey export solidityverifier keys/challengeProof_final.zkey ../contracts/contracts/ChallengeVerifier.sol
```

> The local powers-of-tau ceremony is single-contributor — fine for development and thesis demos, not for production value.
