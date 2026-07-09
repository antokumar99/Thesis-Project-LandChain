#!/usr/bin/env bash
set -euo pipefail

snarkjs groth16 verify keys/verification_key.json proofs/public.json proofs/proof.json
