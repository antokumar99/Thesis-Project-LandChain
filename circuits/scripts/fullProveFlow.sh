#!/usr/bin/env bash
# Full flow for one circuit: compile -> setup -> witness -> prove -> verify.
# Usage: scripts/fullProveFlow.sh <circuit> <input.json>
# Example: scripts/fullProveFlow.sh landOwnership input/landOwnership.input.json
set -euo pipefail

CIRCUIT="${1:?usage: fullProveFlow.sh <circuit> <input.json>}"
INPUT="${2:?usage: fullProveFlow.sh <circuit> <input.json>}"

scripts/compileCircuit.sh "$CIRCUIT"
scripts/setupTrustedSetup.sh
scripts/generateWitness.sh "$CIRCUIT" "$INPUT"
scripts/generateProof.sh "$CIRCUIT"
scripts/verifyProof.sh "$CIRCUIT"
npx snarkjs generatecall "proofs/${CIRCUIT}.public.json" "proofs/${CIRCUIT}.proof.json" > "proofs/${CIRCUIT}.solidityCalldata.txt"
