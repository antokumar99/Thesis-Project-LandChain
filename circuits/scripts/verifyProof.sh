#!/usr/bin/env bash
# Verify a previously generated Groth16 proof.
# Usage: scripts/verifyProof.sh <circuit>
set -euo pipefail

CIRCUIT="${1:?usage: verifyProof.sh <circuit>}"

npx snarkjs groth16 verify "keys/${CIRCUIT}_vkey.json" "proofs/${CIRCUIT}.public.json" "proofs/${CIRCUIT}.proof.json"
