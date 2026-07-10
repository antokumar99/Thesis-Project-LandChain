#!/usr/bin/env bash
# Compile one circuit (arg) or all four (no arg) into build/.
# Usage: scripts/compileCircuit.sh [commitmentProof|landOwnership|challengeProof|areaRange]
set -euo pipefail

mkdir -p build
CIRCUITS=("${1:-commitmentProof}" )
if [ $# -eq 0 ]; then
  CIRCUITS=(commitmentProof landOwnership challengeProof areaRange)
fi
for name in "${CIRCUITS[@]}"; do
  circom "circuits/${name}.circom" --r1cs --wasm --sym -o build
done
