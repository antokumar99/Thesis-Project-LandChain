#!/usr/bin/env bash
# Generate a Groth16 proof from a previously generated witness.
# Usage: scripts/generateProof.sh <circuit>
set -euo pipefail

CIRCUIT="${1:?usage: generateProof.sh <circuit>}"

mkdir -p proofs
npx snarkjs groth16 prove "keys/${CIRCUIT}_final.zkey" "build/${CIRCUIT}.witness.wtns" "proofs/${CIRCUIT}.proof.json" "proofs/${CIRCUIT}.public.json"
