/**
 * One-shot trusted setup for all LandChain circuits.
 * Requires compiled r1cs files in build/ (run `npm run compile` first).
 *
 * Usage: node scripts/setup.js
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const KEYS = path.join(ROOT, "keys");
const CIRCUITS = ["commitmentProof", "landOwnership", "challengeProof", "areaRange"];

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { cwd: ROOT, stdio: "inherit" });
}

const finalPtau = path.join(KEYS, "pot13_final.ptau");
if (!fs.existsSync(finalPtau)) {
  run("npx snarkjs powersoftau new bn128 13 keys/pot13_0000.ptau");
  run('npx snarkjs powersoftau contribute keys/pot13_0000.ptau keys/pot13_0001.ptau --name="landchain-first" -e="landchain entropy"');
  run("npx snarkjs powersoftau prepare phase2 keys/pot13_0001.ptau keys/pot13_final.ptau");
}

for (const circuit of CIRCUITS) {
  run(`npx snarkjs groth16 setup build/${circuit}.r1cs keys/pot13_final.ptau keys/${circuit}_0000.zkey`);
  run(`npx snarkjs zkey contribute keys/${circuit}_0000.zkey keys/${circuit}_final.zkey --name="landchain" -e="zkey entropy ${circuit}"`);
  run(`npx snarkjs zkey export verificationkey keys/${circuit}_final.zkey keys/${circuit}_vkey.json`);
}

console.log("Trusted setup complete.");
