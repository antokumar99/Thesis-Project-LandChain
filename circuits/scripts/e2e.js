/**
 * End-to-end check for all four LandChain circuits:
 * builds a Poseidon Merkle tree, generates a Groth16 proof per circuit with
 * snarkjs, verifies it against the exported verification key, and prints the
 * labeled public signals.
 *
 * Run from the circuits workspace:  node scripts/e2e.js
 */
const path = require("path");
const fs = require("fs");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");

const DEPTH = 10;
const ROOT = path.resolve(__dirname, "..");

function artifact(circuit) {
  return {
    wasm: path.join(ROOT, "build", `${circuit}_js`, `${circuit}.wasm`),
    zkey: path.join(ROOT, "keys", `${circuit}_final.zkey`),
    vkey: path.join(ROOT, "keys", `${circuit}_vkey.json`)
  };
}

async function proveAndVerify(circuit, input, labels) {
  const { wasm, zkey, vkey } = artifact(circuit);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const verificationKey = JSON.parse(fs.readFileSync(vkey, "utf8"));
  const ok = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
  console.log(`\n=== ${circuit} ===`);
  publicSignals.forEach((signal, i) => console.log(`  publicSignals[${i}] (${labels[i] ?? "?"}) = ${signal}`));
  console.log(`  verified: ${ok}`);
  if (!ok) throw new Error(`${circuit} proof failed verification`);
  return { proof, publicSignals };
}

async function main() {
  const poseidon = await buildPoseidon();
  const H = (a, b) => poseidon.F.toString(poseidon([BigInt(a), BigInt(b)]));

  const landIdField = "12345678901234567890";
  const ownerSecret = "98765432109876543210";
  const commitment = H(landIdField, ownerSecret);

  // Sparse tree with our commitment at leaf 3.
  const zeros = ["0"];
  for (let i = 0; i < DEPTH; i++) zeros.push(H(zeros[i], zeros[i]));
  const leafIndex = 3;
  const pathElements = [];
  const pathIndices = [];
  let index = leafIndex;
  let node = commitment;
  for (let level = 0; level < DEPTH; level++) {
    pathElements.push(zeros[level]);
    pathIndices.push(index % 2);
    node = index % 2 === 0 ? H(node, zeros[level]) : H(zeros[level], node);
    index = Math.floor(index / 2);
  }
  const merkleRoot = node;

  await proveAndVerify(
    "commitmentProof",
    { ownerSecret, landIdField, commitment },
    ["landIdField", "commitment"]
  );

  await proveAndVerify(
    "landOwnership",
    { landIdField, ownerSecret, pathElements, pathIndices, merkleRoot },
    ["nullifier", "merkleRoot"]
  );

  const challenge = "424242424242424242424242";
  const expectedResponse = H(H(ownerSecret, landIdField), challenge);
  const { publicSignals } = await proveAndVerify(
    "challengeProof",
    { ownerSecret, pathElements, pathIndices, landIdField, merkleRoot, challenge },
    ["responseNullifier", "landIdField", "merkleRoot", "challenge"]
  );
  if (publicSignals[0] !== expectedResponse) throw new Error("challengeProof responseNullifier mismatch");
  if (publicSignals[1] !== landIdField || publicSignals[2] !== merkleRoot || publicSignals[3] !== challenge) {
    throw new Error("challengeProof public signal order differs from expected");
  }

  const areaValue = "4500";
  const areaSalt = "31415926535897932384";
  const areaCommitment = H(areaValue, areaSalt);
  await proveAndVerify(
    "areaRange",
    { areaValue, areaSalt, areaCommitment, minArea: "1000" },
    ["areaCommitment", "minArea"]
  );

  console.log("\nAll four circuits proved and verified successfully.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
