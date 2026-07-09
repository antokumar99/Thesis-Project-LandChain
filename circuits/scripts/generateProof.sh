#!/usr/bin/env bash
set -euo pipefail

mkdir -p proofs
snarkjs groth16 prove keys/landOwnership_final.zkey build/witness.wtns proofs/proof.json proofs/public.json
