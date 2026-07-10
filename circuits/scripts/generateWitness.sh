#!/usr/bin/env bash
# Generate a witness for a circuit from a JSON input file.
# Usage: scripts/generateWitness.sh <circuit> <input.json>
# Example: scripts/generateWitness.sh landOwnership input/landOwnership.input.json
set -euo pipefail

CIRCUIT="${1:?usage: generateWitness.sh <circuit> <input.json>}"
INPUT="${2:?usage: generateWitness.sh <circuit> <input.json>}"

node "build/${CIRCUIT}_js/generate_witness.js" "build/${CIRCUIT}_js/${CIRCUIT}.wasm" "$INPUT" "build/${CIRCUIT}.witness.wtns"
