// One-off helper: pre-generates and caches the challenge proof used by the
// test suite (see zkHelpers.generateChallengeProof disk cache).
// Run with: npx tsx scripts/seedProofCache.mts
import { ethers } from "ethers";
import { generateChallengeProof } from "../test/zkHelpers.js";

const buyer = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // hardhat default signer #2
const zk = await generateChallengeProof(buyer, ethers.id("landchain-test-salt"));
console.log("cached; signals:", zk.publicSignals.length);
process.exit(0);
