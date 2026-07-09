#!/usr/bin/env bash
set -euo pipefail

node build/landOwnershipProof_js/generate_witness.js build/landOwnershipProof_js/landOwnershipProof.wasm input/landOwnership.input.json build/witness.wtns
