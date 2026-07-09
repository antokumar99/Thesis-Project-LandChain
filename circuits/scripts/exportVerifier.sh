#!/usr/bin/env bash
set -euo pipefail

snarkjs zkey export solidityverifier keys/landOwnership_final.zkey ../contracts/contracts/Verifier.sol
