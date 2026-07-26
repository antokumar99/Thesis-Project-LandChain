#!/usr/bin/env bash
# Compile one circuit (arg) or all five (no arg) into build/.
# Usage: scripts/compileCircuit.sh [commitmentProof|landOwnership|challengeProof|areaRange|rootTransition]
set -euo pipefail

mkdir -p build
CIRCUITS=("${1:-commitmentProof}" )
if [ $# -eq 0 ]; then
  CIRCUITS=(commitmentProof landOwnership challengeProof areaRange rootTransition)
fi
for name in "${CIRCUITS[@]}"; do
  # --O2 (full constraint simplification) keeps the depth-20 circuits inside
  # the pot15 ceremony.
  circom "circuits/${name}.circom" --r1cs --wasm --sym --O2 -o build
done
