#!/usr/bin/env bash
set -euo pipefail

mkdir -p keys
snarkjs powersoftau new bn128 12 keys/pot12_0000.ptau -v
snarkjs powersoftau contribute keys/pot12_0000.ptau keys/pot12_final.ptau --name="LandChain dev contribution" -v -e="landchain"
snarkjs groth16 setup build/landOwnershipProof.r1cs keys/pot12_final.ptau keys/landOwnership_0000.zkey
snarkjs zkey contribute keys/landOwnership_0000.zkey keys/landOwnership_final.zkey --name="LandChain dev zkey" -v -e="landchain"
snarkjs zkey export verificationkey keys/landOwnership_final.zkey keys/verification_key.json
