# LandChain

A hybrid smart-contract land registry with **end-to-end privacy-preserving ownership**. Land ownership lives as **Poseidon commitments** in a Merkle tree; the tree root is anchored on an Ethereum smart contract **with a zero-knowledge consistency proof for every root update**; and every ownership claim is settled with **Groth16 zero-knowledge proofs generated in the owner's browser** (circom + snarkjs). Owner secrets never leave the owner's device — not even the server operator can link owners to plots via secrets.

## The five ways zero-knowledge proofs are applied

| # | Proof | Circuit | Statement proved (without revealing the secret) |
|---|-------|---------|--------------------------------------------------|
| 1 | Commitment Opening | `commitmentProof.circom` | "I know the owner secret behind land X's registry commitment." |
| 2 | Registry Membership | `landOwnership.circom` | "I own *some* land in the official registry" — which land stays private; a nullifier is emitted instead of an identity. |
| 3 | Challenge–Response | `challengeProof.circom` | "I am the current owner of land X **and** I am answering *your* one-time nonce" — replay-proof buyer↔seller authenticity handshake. |
| 4 | Area Range | `areaRange.circom` | "The committed area of this land is ≥ N m²" — exact area stays private (selective disclosure). |
| 5 | Root Transition | `rootTransition.circom` | "The new registry root equals the previous anchored root with exactly ONE leaf changed" — the on-chain contract verifies this for every root update, so it never trusts the backend's tree computation. |

Only the owner can produce proofs 1–4: proving requires the owner secret whose Poseidon hash matches the on-registry commitment. **Proving runs in the browser** (snarkjs wasm, artifacts served from `/api/zk/artifacts/...`); the server receives only `{proof, publicSignals}` and re-verifies them cryptographically and semantically before recording anything. Buyers likewise verify sellers' proofs locally in their own browser against the published verification key.

## Application flow

1. **Account registration** — users sign up with identity details (name, email, wallet, NID → stored only as a hash, phone, address). Every public signup is a `USER`. The **authority is fixed**, seeded from `.env` at API startup.
2. **Land registration request** — the browser derives `Poseidon(landIdField, secretField)` and the area commitment from the user's secret **locally** and submits only the commitments (plus land details and an optional IPFS deed). Stored as `PENDING_APPROVAL`.
3. **Authority approval** — the authority reviews the request *with the applicant's identity info*, then approves or rejects. Approval inserts the commitment into the depth-20 Poseidon Merkle tree (capacity 2^20 = 1,048,576 parcels) and anchors the new root on-chain **together with a Groth16 root-transition proof** the contract verifies.
4. **Sell** — the owner lists the land with a price.
5. **Buyer challenge** — an interested buyer sends the seller a message: *"prove you are the authentic owner."* A one-time buyer-bound nonce is attached.
6. **Seller proof** — the seller's browser generates a challenge-response Groth16 proof binding that exact nonce, the land, and the current registry root. The secret never leaves the seller's device.
7. **Buyer verification** — the buyer's browser verifies the proof cryptographically (snarkjs + published vkey) and semantically (right land, right nonce, current root); the server independently re-checks and records the verdict.
8. **Buy** — purchase is only allowed after a verified challenge. The buyer's browser derives fresh commitments from *their* new secret; the land is re-committed to them, removed from the active tree (again with an on-chain-verified root transition), and routed to the authority for re-registration.

Every proof's raw Groth16 JSON, labeled public signals, and verification result are shown in the **ZK Outputs** tab of the dashboard.

See **[SECURITY.md](SECURITY.md)** for the threat model, the enforced security properties (P1–P6), what each reduces to, and explicit non-goals. **[PAPER.md](PAPER.md)** collects paper-ready material: positioning against Tornado Cash/Semaphore/Zerocash and land-registry systems, a comparison table, scoped privacy and trusted-setup limitation paragraphs, throughput analysis, and all measured evaluation numbers (Sepolia gas with live tx hashes, proving benchmarks, depth-scaling curve).

## Project layout

- `apps/client` — Next.js 16 UI: role-based dashboards (authority / user), marketplace, challenge threads, **in-browser proof generation and verification** (`src/lib/zk.ts`).
- `apps/server` — Express + MongoDB API: fixed-authority seeding, approval workflow, Poseidon Merkle service, **proof verification** (never generation on behalf of users), root-transition proving for on-chain anchoring, challenge messaging, public circuit-artifact serving.
- `circuits` — five circom circuits, trusted-setup scripts, an end-to-end prove/verify test, and a proving benchmark.
- `contracts` — Hardhat: `LandRegistry.sol` (proof-verified root anchoring + proof-gated transfers) with **two** real snarkjs-generated Groth16 verifiers (challenge circuit + root-transition circuit).

## Run locally

```bash
# 0. One-time: circuits are pre-built; to rebuild them:
cd circuits && npm run compile && npm run setup && npm run e2e

# 1. Configure — create the two config files (see "Environment variables" below)
#    apps/server/.env        API config
#    apps/client/.env.local  client config

# 2. MongoDB — point MONGODB_URI at any instance (docker compose up -d mongo works too)

# 3. API (seeds the fixed authority on first start)
npm run dev:server

# 4. Client
npm run dev:client
```

Log in as the authority with `AUTHORITY_EMAIL` / `AUTHORITY_PASSWORD` from your `.env` (defaults: `authority@landchain.gov` / `authority-dev-password`).

If `RPC_URL` / `PRIVATE_KEY` / `LAND_REGISTRY_ADDRESS` are unset, the API records deterministic local transaction hashes instead of on-chain calls, so the whole flow works offline.

## Deploy to Sepolia

```bash
cd contracts                # create contracts/.env (see "Environment variables" below)
npm run deploy:sepolia      # deploys Verifier, RootVerifier, LandRegistry
npm run verify:sepolia -- <LAND_REGISTRY_ADDRESS> <OWNER> <VERIFIER> <ROOT_VERIFIER>
```

Then point `apps/server/.env` at Sepolia: `RPC_URL=<sepolia rpc>`, `CHAIN_ID=11155111`, `PRIVATE_KEY=<authority key>`, `LAND_REGISTRY_ADDRESS=<deployed address>`. The API will anchor every root update on Sepolia with its transition proof.

## Environment variables

Exactly three config files exist, all gitignored — never commit them:

**`apps/server/.env`** (API)
```
NODE_ENV=development
PORT=5000
CLIENT_ORIGIN=http://localhost:3000
MONGODB_URI=mongodb://127.0.0.1:27017/landchain     # or an Atlas URI
JWT_SECRET=replace-with-a-long-random-secret

# Fixed authority login (seeded at API startup; cannot be self-registered)
AUTHORITY_NAME=Land Registry Authority
AUTHORITY_EMAIL=authority@landchain.gov
AUTHORITY_PASSWORD=authority-dev-password
AUTHORITY_WALLET=0x000000000000000000000000000000000000a001

CIRCUITS_DIR=                                       # blank = <repo>/circuits
PINATA_JWT=                                         # blank = local CID mode
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
# 32-byte hex key encrypting deed documents at rest and before IPFS pinning.
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Blank = deeds stored unencrypted (development only — never in production).
DEED_ENCRYPTION_KEY=

# Blockchain — leave RPC_URL/PRIVATE_KEY/LAND_REGISTRY_ADDRESS blank for offline mode.
# Local:   RPC_URL=http://127.0.0.1:8545, CHAIN_ID=31337, a hardhat key + deploy:local address
# Sepolia: RPC_URL=<infura/alchemy url>, CHAIN_ID=11155111, the DEPLOYER's key
#          (contract owner = authority) + deploy:sepolia address
RPC_URL=
CHAIN_ID=31337
PRIVATE_KEY=
LAND_REGISTRY_ADDRESS=
VERIFIER_ADDRESS=
```

**`apps/client/.env.local`** (UI)
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_CHAIN_ID=31337                          # 11155111 for Sepolia; match the server
NEXT_PUBLIC_LAND_REGISTRY_ADDRESS=0x...             # same address as the server, WITH 0x prefix
```

**`contracts/.env`** (deployment only)
```
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<project-id>
SEPOLIA_PRIVATE_KEY=0x<funded key — the deployer becomes the registry owner/authority>
```

## Tests & evaluation

- `cd circuits && npm run e2e` — proves + verifies all five circuits.
- `cd circuits && npm run benchmark` — proving/verification latency, proof and artifact sizes per circuit (written to `benchmark-results.json`).
- `cd circuits && npm run benchmark:scaling` — depth-scaling curve (tree depths 10→30, capacity 1K→1B parcels) for the two Merkle-heavy circuits (written to `scaling-results.json`).
- `cd apps/server && npm run smoke` — full business flow against an in-memory MongoDB with **browser-emulated proving** (secrets never passed to services), all proof types, and negative cases (wrong secret, stolen proof, tampered signals, false area statement, buying without a verified challenge, stale owner after transfer).
- `cd contracts && npx hardhat test` — on-chain verification of real snarkjs proofs: ownership transfer gating **and** root-transition gating (wrong root, non-chaining transition, tampered proof, replay, redirection all revert).
- `cd contracts && npm run benchmark` — gas per operation (deployments, `registerLand`, `updateMerkleRoot` incl. Groth16 verify, `verifyAndTransfer` incl. Groth16 verify); run with `--network sepolia` for live-network numbers.
- `npm run build:client` / `npm run build:server` — type-checked builds.

## Key API endpoints

| Area | Endpoint |
|------|----------|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Lands | `POST /api/lands/request` (commitments only), `GET /api/lands/requests` (authority), `POST /api/lands/:id/approve\|reject`, `GET /api/lands?scope=mine\|market\|all`, `PATCH /api/lands/:id/sell\|cancel-sale`, `GET /api/lands/stats` |
| Challenges | `POST /api/challenges`, `GET /api/challenges`, `POST /api/challenges/:id/messages\|respond\|verify\|decline` |
| Proofs | `POST /api/proofs/submit` (client-generated proofs), `POST /api/proofs/verify`, `GET /api/proofs`, `GET /api/proofs/status` |
| ZK artifacts | `GET /api/zk/artifacts/:circuit/wasm\|zkey\|vkey` (public proving/verification parameters) |
| Market | `POST /api/transfers/buy` (fresh commitments only) |
