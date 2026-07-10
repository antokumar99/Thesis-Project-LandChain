#!/usr/bin/env bash
# Export the on-chain Groth16 verifier for the challenge-response circuit.
# LandRegistry verifies challengeProof proofs (4 public signals), and the
# generated contract (named Groth16Verifier) lives in ChallengeVerifier.sol,
# which the handwritten adapter contracts/Verifier.sol wraps. Do NOT export
# over Verifier.sol — that would destroy the adapter.
set -euo pipefail

npx snarkjs zkey export solidityverifier keys/challengeProof_final.zkey ../contracts/contracts/ChallengeVerifier.sol
echo "Wrote ../contracts/contracts/ChallengeVerifier.sol (Groth16Verifier for challengeProof)."
