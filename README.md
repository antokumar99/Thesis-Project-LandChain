# LandChain

A hybrid smart-contract land registry with privacy-preserving ownership. Land ownership lives as **Poseidon commitments** in a Merkle tree; the tree root is anchored on an Ethereum smart contract; and every ownership claim is settled with **Groth16 zero-knowledge proofs** generated and verified with circom + snarkjs.

## The four ways zero-knowledge proofs are applied

| # | Proof | Circuit | Statement proved (without revealing the secret) |
|---|-------|---------|--------------------------------------------------|
| 1 | Commitment Opening | `commitmentProof.circom` | "I know the owner secret behind land X's registry commitment." |
| 2 | Registry Membership | `landOwnership.circom` | "I own *some* land in the official registry" — which land stays private; a nullifier is emitted instead of an identity. |
| 3 | Challenge–Response | `challengeProof.circom` | "I am the current owner of land X **and** I am answering *your* one-time nonce" — replay-proof buyer↔seller authenticity handshake. |
| 4 | Area Range | `areaRange.circom` | "The committed area of this land is ≥ N m²" — exact area stays private (selective disclosure). |

Only the owner can produce any of these proofs: proving requires the owner secret whose Poseidon hash matches the on-registry commitment. The secret is used solely to build the witness and is never stored or transmitted onward.

## Application flow

1. **Account registration** — users sign up with identity details (name, email, wallet, NID → stored only as a hash, phone, address). Every public signup is a `USER`. The **authority is fixed**, seeded from `.env` at API startup.
2. **Land registration request** — a user submits land details, an optional deed (IPFS), and a private owner secret. The server derives `Poseidon(landIdField, secretField)` and an area commitment, then stores the request as `PENDING_APPROVAL`.
3. **Authority approval** — the authority reviews the request *with the applicant's identity info*, then approves (commitment inserted into the depth-10 Poseidon Merkle tree, new root anchored on-chain) or rejects.
4. **Sell** — the owner lists the land with a price.
5. **Buyer challenge** — an interested buyer sends the seller a message: *"prove you are the authentic owner."* A one-time field-element nonce is attached.
6. **Seller proof** — the seller answers with a challenge-response Groth16 proof binding that exact nonce, the land, and the current registry root.
7. **Buyer verification** — the buyer verifies the proof cryptographically (snarkjs) and semantically (right land, right nonce, current root, seller still the registered owner).
8. **Buy** — purchase is only allowed after a verified challenge. The land is instantly **re-committed to the buyer's fresh secret**, so the previous owner can no longer prove ownership.

Every proof's raw Groth16 JSON, labeled public signals, and verification result are shown in the **ZK Outputs** tab of the dashboard.

## Project layout

- `apps/client` — Next.js 16 UI: role-based dashboards (authority / user), marketplace, challenge threads, proof generation/verification with output tabs.
- `apps/server` — Express + MongoDB API: fixed-authority seeding, approval workflow, Poseidon Merkle service (circomlibjs), snarkjs proof generation/verification, challenge messaging.
- `circuits` — circom circuits, trusted-setup scripts, and an end-to-end prove/verify test.
- `contracts` — Hardhat: `LandRegistry.sol` (roots + proof-gated transfers) and a **real** snarkjs-generated Groth16 verifier for the challenge circuit.
- `shared`, `docs`, `tests` — shared types, notes, e2e scaffolding.

## Run locally

```bash
# 0. One-time: circuits are pre-built; to rebuild them:
cd circuits && npm run compile && npm run setup && npm run e2e

# 1. Configure
cp .env.example apps/server/.env

# 2. MongoDB (docker) — or point MONGODB_URI at any instance
docker compose up -d mongo

# 3. API (seeds the fixed authority on first start)
npm run dev:server

# 4. Client
npm run dev:client
```

Log in as the authority with `AUTHORITY_EMAIL` / `AUTHORITY_PASSWORD` from your `.env` (defaults: `authority@landchain.gov` / `authority-dev-password`).

If `RPC_URL` / `PRIVATE_KEY` / `LAND_REGISTRY_ADDRESS` are unset, the API records deterministic local transaction hashes instead of on-chain calls, so the whole flow works offline.

## Tests

- `cd circuits && npm run e2e` — proves + verifies all four circuits.
- `cd apps/server && npm run smoke` — full business flow against an in-memory MongoDB, including all four proof types and negative cases (wrong secret, non-owner prover, false area statement, buying without a verified challenge, stale owner after transfer).
- `cd contracts && npx hardhat test` — on-chain verification of a real snarkjs proof, root gating, and transfer controls.
- `npm run build:client` / `npm run build:server` — type-checked builds.

## Key API endpoints

| Area | Endpoint |
|------|----------|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Lands | `POST /api/lands/request`, `GET /api/lands/requests` (authority), `POST /api/lands/:id/approve\|reject`, `GET /api/lands?scope=mine\|market\|all`, `PATCH /api/lands/:id/sell\|cancel-sale`, `GET /api/lands/stats` |
| Challenges | `POST /api/challenges`, `GET /api/challenges`, `POST /api/challenges/:id/messages\|respond\|verify\|decline` |
| Proofs | `POST /api/proofs/generate`, `POST /api/proofs/verify`, `GET /api/proofs`, `GET /api/proofs/status` |
| Market | `POST /api/transfers/buy` |
