#!/usr/bin/env bash
set -euo pipefail

scripts/compileCircuit.sh
scripts/setupTrustedSetup.sh
scripts/generateWitness.sh
scripts/generateProof.sh
scripts/verifyProof.sh
snarkjs generatecall proofs/public.json proofs/proof.json > proofs/solidityCalldata.txt
