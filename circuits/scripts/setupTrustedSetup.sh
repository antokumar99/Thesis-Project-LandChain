#!/usr/bin/env bash
# Trusted setup for all four circuits (pot13 + per-circuit zkeys/vkeys).
# Delegates to scripts/setup.js, the single source of truth.
# NOTE: dev-only single-contributor ceremony with fixed entropy — do not use
# these keys in production.
set -euo pipefail

node scripts/setup.js
