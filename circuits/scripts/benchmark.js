/**
 * Prover-side benchmark for all five LandChain circuits.
 * Measures witness+proof generation time (what a browser/server pays per
 * proof), verification time, and artifact sizes over N runs.
 *
 * Run from the circuits workspace:  node scripts/benchmark.js [runs]
 */
const path = require("path");
const fs = require("fs");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");

const DEPTH = 20;
const ROOT = path.resolve(__dirname, "..");
const RUNS = Math.max(1, Number(process.argv[2] ?? 5));

function artifact(circuit) {
  return {
    r1cs: path.join(ROOT, "build", `${circuit}.r1cs`),
    wasm: path.join(ROOT, "build", `${circuit}_js`, `${circuit}.wasm`),
    zkey: path.join(ROOT, "keys", `${circuit}_final.zkey`),
    vkey: path.join(ROOT, "keys", `${circuit}_vkey.json`)
  };
}

function kb(file) {
  return (fs.statSync(file).size / 1024).toFixed(1);
}

async function bench(circuit, input) {
  const { r1cs, wasm, zkey, vkey } = artifact(circuit);
  const verificationKey = JSON.parse(fs.readFileSync(vkey, "utf8"));

  let constraints = "?";
  try {
    const info = await snarkjs.r1cs.info(r1cs);
    constraints = String(info.nConstraints);
  } catch {
    // snarkjs API variations: constraint count is informative only.
  }

  const proveTimes = [];
  const verifyTimes = [];
  let proofBytes = 0;
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
    const t1 = performance.now();
    const ok = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
    const t2 = performance.now();
    if (!ok) throw new Error(`${circuit}: proof failed verification`);
    proveTimes.push(t1 - t0);
    verifyTimes.push(t2 - t1);
    proofBytes = Buffer.byteLength(JSON.stringify(proof));
  }

  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const stats = {
    circuit,
    constraints,
    proveAvgMs: avg(proveTimes).toFixed(0),
    proveMinMs: Math.min(...proveTimes).toFixed(0),
    proveMaxMs: Math.max(...proveTimes).toFixed(0),
    verifyAvgMs: avg(verifyTimes).toFixed(1),
    proofBytes,
    wasmKb: kb(wasm),
    zkeyKb: kb(zkey)
  };
  console.log(
    `${circuit.padEnd(17)} constraints=${String(stats.constraints).padEnd(6)} ` +
      `prove avg=${stats.proveAvgMs}ms [${stats.proveMinMs}-${stats.proveMaxMs}] ` +
      `verify avg=${stats.verifyAvgMs}ms proof=${stats.proofBytes}B wasm=${stats.wasmKb}KB zkey=${stats.zkeyKb}KB`
  );
  return stats;
}

async function main() {
  const poseidon = await buildPoseidon();
  const H = (a, b) => poseidon.F.toString(poseidon([BigInt(a), BigInt(b)]));

  const landIdField = "12345678901234567890";
  const ownerSecret = "98765432109876543210";
  const commitment = H(landIdField, ownerSecret);

  const zeros = ["0"];
  for (let i = 0; i < DEPTH; i++) zeros.push(H(zeros[i], zeros[i]));
  const pathElements = zeros.slice(0, DEPTH);
  const pathIndices = Array(DEPTH).fill(0);
  let node = commitment;
  let oldNode = "0";
  for (let level = 0; level < DEPTH; level++) {
    node = H(node, zeros[level]);
    oldNode = H(oldNode, zeros[level]);
  }
  const merkleRoot = node;
  const oldRoot = oldNode;

  console.log(`LandChain circuit benchmark — ${RUNS} run(s) per circuit\n`);
  const results = [];
  results.push(await bench("commitmentProof", { ownerSecret, landIdField, commitment }));
  results.push(await bench("landOwnership", { landIdField, ownerSecret, pathElements, pathIndices, merkleRoot }));
  results.push(
    await bench("challengeProof", {
      ownerSecret,
      pathElements,
      pathIndices,
      landIdField,
      merkleRoot,
      challenge: "424242424242424242424242"
    })
  );
  const areaSalt = "31415926535897932384";
  results.push(
    await bench("areaRange", { areaValue: "4500", areaSalt, areaCommitment: H("4500", areaSalt), minArea: "1000" })
  );
  results.push(
    await bench("rootTransition", {
      pathElements,
      pathIndices,
      leafBefore: "0",
      leafAfter: commitment,
      oldRoot,
      newRoot: merkleRoot
    })
  );

  const out = path.join(ROOT, "benchmark-results.json");
  fs.writeFileSync(out, JSON.stringify({ runs: RUNS, generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nResults written to ${out}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
