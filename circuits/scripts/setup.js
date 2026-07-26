/**
 * One-shot trusted setup for all LandChain circuits (depth-20 tree).
 * Requires compiled r1cs files in build/ (run `npm run compile` first).
 *
 * Uses a 2^15 powers-of-tau ceremony (large enough for the depth-20
 * challenge/membership/root-transition circuits). NOTE: this is a
 * DEVELOPMENT ceremony — a production deployment must re-run phase 1 and
 * phase 2 as a multi-party ceremony.
 *
 * Usage: node scripts/setup.js
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const KEYS = path.join(ROOT, "keys");
const CIRCUITS = ["commitmentProof", "landOwnership", "challengeProof", "areaRange", "rootTransition"];
const POT = "pot15";

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { cwd: ROOT, stdio: "inherit" });
}

const finalPtau = path.join(KEYS, `${POT}_final.ptau`);
if (!fs.existsSync(finalPtau)) {
  run(`npx snarkjs powersoftau new bn128 15 keys/${POT}_0000.ptau`);
  run(`npx snarkjs powersoftau contribute keys/${POT}_0000.ptau keys/${POT}_0001.ptau --name="landchain-first" -e="landchain entropy"`);
  run(`npx snarkjs powersoftau prepare phase2 keys/${POT}_0001.ptau keys/${POT}_final.ptau`);
  for (const intermediate of [`${POT}_0000.ptau`, `${POT}_0001.ptau`]) {
    fs.rmSync(path.join(KEYS, intermediate), { force: true });
  }
}

for (const circuit of CIRCUITS) {
  run(`npx snarkjs groth16 setup build/${circuit}.r1cs keys/${POT}_final.ptau keys/${circuit}_0000.zkey`);
  run(`npx snarkjs zkey contribute keys/${circuit}_0000.zkey keys/${circuit}_final.zkey --name="landchain" -e="zkey entropy ${circuit}"`);
  run(`npx snarkjs zkey export verificationkey keys/${circuit}_final.zkey keys/${circuit}_vkey.json`);
  fs.rmSync(path.join(KEYS, `${circuit}_0000.zkey`), { force: true });
}

console.log("Trusted setup complete.");
