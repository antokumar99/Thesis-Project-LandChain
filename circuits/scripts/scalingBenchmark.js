/**
 * Depth-scaling study for the paper's evaluation section.
 *
 * Compiles the two Merkle-heavy circuits (challengeProof — the heaviest
 * user-facing proof — and rootTransition — the per-anchor consistency proof)
 * at tree depths 10..30, runs a Groth16 setup against the pot15 ceremony,
 * and measures constraints, proving time, verification time, and proving-key
 * size at each depth. Depth d gives a registry capacity of 2^d parcels
 * (depth 20 = 1,048,576; depth 30 = ~1.07 billion).
 *
 * Run from the circuits workspace:  node scripts/scalingBenchmark.js [runs]
 * Requires: circom on PATH, keys/pot15_final.ptau (npm run setup).
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "build-scaling");
const PTAU = path.join(ROOT, "keys", "pot15_final.ptau");
const DEPTHS = [10, 15, 20, 25, 30];
const RUNS = Math.max(1, Number(process.argv[2] ?? 3));
const CIRCUITS = ["challengeProof", "rootTransition"];

function run(command) {
  execSync(command, { cwd: ROOT, stdio: "pipe" });
}

/** Write a depth-d variant of a circuit (same template, different main). */
function writeVariant(name, depth) {
  const source = fs.readFileSync(path.join(ROOT, "circuits", `${name}.circom`), "utf8");
  if (!/= (ChallengeProof|RootTransition)\(\d+\);/.test(source)) {
    throw new Error(`${name}: could not find main component depth to patch`);
  }
  const patched = source.replace(/= (ChallengeProof|RootTransition)\(\d+\);/, `= $1(${depth});`);
  const variant = `__scaling_${name}_d${depth}`;
  fs.writeFileSync(path.join(ROOT, "circuits", `${variant}.circom`), patched);
  return variant;
}

function treeInputs(H, depth) {
  const landIdField = "12345678901234567890";
  const ownerSecret = "98765432109876543210";
  const commitment = H(landIdField, ownerSecret);
  const zeros = ["0"];
  for (let i = 0; i < depth; i++) zeros.push(H(zeros[i], zeros[i]));
  const pathElements = zeros.slice(0, depth);
  const pathIndices = Array(depth).fill(0);
  let node = commitment;
  let oldNode = "0";
  for (let level = 0; level < depth; level++) {
    node = H(node, pathElements[level]);
    oldNode = H(oldNode, pathElements[level]);
  }
  return { landIdField, ownerSecret, commitment, pathElements, pathIndices, merkleRoot: node, oldRoot: oldNode };
}

async function benchVariant(name, depth, H) {
  const variant = writeVariant(name, depth);
  const variantPath = path.join(ROOT, "circuits", `${variant}.circom`);
  try {
    run(`circom circuits/${variant}.circom --r1cs --wasm --O2 -o build-scaling`);
    run(`npx snarkjs groth16 setup build-scaling/${variant}.r1cs "${PTAU}" build-scaling/${variant}.zkey`);
    run(`npx snarkjs zkey export verificationkey build-scaling/${variant}.zkey build-scaling/${variant}_vkey.json`);

    const r1cs = await snarkjs.r1cs.info(path.join(OUT, `${variant}.r1cs`));
    const wasm = path.join(OUT, `${variant}_js`, `${variant}.wasm`);
    const zkey = path.join(OUT, `${variant}.zkey`);
    const vkey = JSON.parse(fs.readFileSync(path.join(OUT, `${variant}_vkey.json`), "utf8"));

    const t = treeInputs(H, depth);
    const input =
      name === "challengeProof"
        ? {
            ownerSecret: t.ownerSecret,
            pathElements: t.pathElements,
            pathIndices: t.pathIndices,
            landIdField: t.landIdField,
            merkleRoot: t.merkleRoot,
            challenge: "424242424242424242424242"
          }
        : {
            pathElements: t.pathElements,
            pathIndices: t.pathIndices,
            leafBefore: "0",
            leafAfter: t.commitment,
            oldRoot: t.oldRoot,
            newRoot: t.merkleRoot
          };

    const proveTimes = [];
    const verifyTimes = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
      const t1 = performance.now();
      const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      const t2 = performance.now();
      if (!ok) throw new Error(`${variant}: proof failed verification`);
      proveTimes.push(t1 - t0);
      verifyTimes.push(t2 - t1);
    }
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

    return {
      circuit: name,
      depth,
      capacity: 2 ** depth,
      constraints: Number(r1cs.nConstraints),
      proveAvgMs: Math.round(avg(proveTimes)),
      verifyAvgMs: Number(avg(verifyTimes).toFixed(1)),
      zkeyMb: Number((fs.statSync(zkey).size / 1024 / 1024).toFixed(2))
    };
  } finally {
    fs.rmSync(variantPath, { force: true });
  }
}

async function main() {
  if (!fs.existsSync(PTAU)) throw new Error("keys/pot15_final.ptau missing — run `npm run setup` first.");
  fs.mkdirSync(OUT, { recursive: true });
  const poseidon = await buildPoseidon();
  const H = (a, b) => poseidon.F.toString(poseidon([BigInt(a), BigInt(b)]));

  console.log(`Depth-scaling benchmark — ${RUNS} run(s) per point\n`);
  const results = [];
  for (const name of CIRCUITS) {
    for (const depth of DEPTHS) {
      const row = await benchVariant(name, depth, H);
      results.push(row);
      console.log(
        `${name.padEnd(15)} depth=${String(depth).padEnd(3)} capacity=2^${depth} ` +
          `constraints=${String(row.constraints).padEnd(6)} prove=${row.proveAvgMs}ms ` +
          `verify=${row.verifyAvgMs}ms zkey=${row.zkeyMb}MB`
      );
    }
  }

  console.log("\n| Circuit | Depth | Capacity (parcels) | Constraints | Prove (ms) | Verify (ms) | zkey (MB) |");
  console.log("|---|---|---|---|---|---|---|");
  for (const r of results) {
    console.log(
      `| ${r.circuit} | ${r.depth} | ${r.capacity.toLocaleString("en-US")} | ${r.constraints.toLocaleString("en-US")} | ${r.proveAvgMs} | ${r.verifyAvgMs} | ${r.zkeyMb} |`
    );
  }

  const out = path.join(ROOT, "scaling-results.json");
  fs.writeFileSync(out, JSON.stringify({ runs: RUNS, generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nResults written to ${out}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
