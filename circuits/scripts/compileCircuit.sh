#!/usr/bin/env bash
set -euo pipefail

mkdir -p build
circom circuits/landOwnershipProof.circom --r1cs --wasm --sym -o build
