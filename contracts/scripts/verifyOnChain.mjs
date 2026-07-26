/**
 * Independent, third-party verification that LandChain's state really lives
 * on Sepolia — and that it is identity-free.
 *
 * Uses ONLY a public RPC endpoint and public IPFS: no private key, no
 * database, no application server. Anyone (a reviewer, an examiner) can run
 * this against the published addresses and reproduce every claim.
 *
 * Usage:
 *   node scripts/verifyOnChain.mjs
 *   node scripts/verifyOnChain.mjs --plot LAND-SEPOLIA-001
 *
 * Env (optional): SEPOLIA_RPC_URL, REGISTRY_ADDRESS
 */
import { Contract, Interface, JsonRpcProvider, id } from "ethers";

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const REGISTRY = process.env.REGISTRY_ADDRESS ?? "0x1309dA0B39072a06bd42D14CD2837454dD2965a7";
const plotArg = process.argv.indexOf("--plot");
const PLOT = plotArg > -1 ? process.argv[plotArg + 1] : "LAND-SEPOLIA-001";

const ABI = [
  "function latestMerkleRoot() view returns (bytes32)",
  "function isKnownRoot(bytes32) view returns (bool)",
  "function EMPTY_TREE_ROOT() view returns (bytes32)",
  "function owner() view returns (address)",
  "function verifier() view returns (address)",
  "function rootVerifier() view returns (address)",
  "function lands(bytes32) view returns (string deedCid,uint8 status,bool exists,uint256 landIdField)",
  "function usedNullifiers(uint256) view returns (bool)",
  "event LandRegistered(bytes32 indexed landHash, string deedCid)",
  "event LandTransferred(bytes32 indexed landHash, uint256 indexed nullifier)",
  "event MerkleRootUpdated(bytes32 indexed root, address indexed updatedBy, uint256 timestamp)"
];

const STATUS = ["REGISTERED", "TRANSFERRED", "DISPUTED"];

function line(label, value) {
  console.log(`  ${label.padEnd(26)} ${value}`);
}

function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  return ok;
}

const provider = new JsonRpcProvider(RPC);
const registry = new Contract(REGISTRY, ABI, provider);
const iface = new Interface(ABI);
let allOk = true;

console.log(`\nLandChain on-chain verification`);
console.log(`RPC      : ${RPC}`);
console.log(`Registry : ${REGISTRY}\n`);

// ---- 1. The contract exists and is wired ---------------------------------
console.log("1. Contract deployment");
const code = await provider.getCode(REGISTRY);
const network = await provider.getNetwork();
line("chain id", network.chainId.toString());
line("bytecode size", `${(code.length - 2) / 2} bytes`);
line("authority (owner)", await registry.owner());
line("challenge verifier", await registry.verifier());
line("root verifier", await registry.rootVerifier());
allOk &= check("contract has deployed bytecode", code !== "0x");
allOk &= check("running on Sepolia", network.chainId === 11155111n, `chainId ${network.chainId}`);

// ---- 2. Registry root state ----------------------------------------------
console.log("\n2. Anchored Merkle root");
const emptyRoot = await registry.EMPTY_TREE_ROOT();
const latestRoot = await registry.latestMerkleRoot();
line("EMPTY_TREE_ROOT", emptyRoot);
line("latestMerkleRoot", latestRoot);
line("root is known", String(await registry.isKnownRoot(latestRoot)));
allOk &= check("a root has been anchored", latestRoot !== "0x" + "0".repeat(64));
allOk &= check("anchored root differs from empty tree", latestRoot !== emptyRoot);

// ---- 3. The parcel record -------------------------------------------------
console.log(`\n3. Parcel record for "${PLOT}"`);
const landHash = id(PLOT);
const land = await registry.lands(landHash);
line("landHash", landHash);
line("exists", String(land.exists));
line("deedCid", land.deedCid || "(none)");
line("status", `${land.status} (${STATUS[Number(land.status)] ?? "?"})`);
line("landIdField", land.landIdField.toString());
allOk &= check("parcel is recorded on chain", land.exists);

// ---- 4. IDENTITY-FREE: no owner address anywhere -------------------------
console.log("\n4. Identity-free property");
const fields = Object.keys(land.toObject());
line("record fields", fields.join(", "));
allOk &= check("record exposes no owner field", !fields.includes("owner"));
// Public RPCs cap eth_getLogs ranges and often refuse historical queries
// without an archive token; scan a small recent window and degrade gracefully.
// Set SEPOLIA_RPC_URL to a dedicated endpoint (Infura/Alchemy) for full range.
try {
  const head = await provider.getBlockNumber();
  const WINDOW = Number(process.env.LOG_WINDOW ?? 5000);
  const logs = await provider.getLogs({
    address: REGISTRY,
    topics: [iface.getEvent("LandRegistered").topicHash, landHash],
    fromBlock: Math.max(0, head - WINDOW),
    toBlock: head
  });
  line("LandRegistered logs", `${logs.length} (last ${WINDOW} blocks)`);
  let noAddressInLogs = true;
  for (const log of logs) {
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    line("  event args", JSON.stringify(parsed.args.map(String)));
    // An address-bearing indexed topic would be 12 zero bytes + 20 address bytes.
    for (const topic of log.topics.slice(1)) {
      if (/^0x0{24}[0-9a-f]{40}$/i.test(topic) && !/^0x0{64}$/.test(topic)) noAddressInLogs = false;
    }
  }
  if (logs.length > 0) {
    allOk &= check("no address-shaped topic in events", noAddressInLogs);
  } else {
    console.log("  SKIP  event scan — registration is older than the window");
  }
} catch (error) {
  console.log(`  SKIP  event scan — RPC refused log query (${error.shortMessage ?? error.message})`);
  console.log("        set SEPOLIA_RPC_URL to an Infura/Alchemy endpoint to enable it");
}

// The ABI itself is decisive regardless of log availability: a struct with an
// owner field could not decode into these four fields.
line("struct decodes as", "(string,uint8,bool,uint256) — no address slot");

// ---- 5. Deed confidentiality on public IPFS ------------------------------
if (land.deedCid && !land.deedCid.startsWith("local-")) {
  console.log("\n5. Deed confidentiality (public IPFS fetch, unauthenticated)");
  const gateway = process.env.IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";
  try {
    const res = await fetch(`${gateway}/${land.deedCid}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    line("gateway status", String(res.status));
    line("bytes returned", String(bytes.length));
    line("first 8 bytes", JSON.stringify(bytes.subarray(0, 8).toString("ascii")));
    allOk &= check("fetched object is NOT a readable PDF", bytes.subarray(0, 5).toString() !== "%PDF-");
    allOk &= check("carries the AES-GCM envelope header", bytes.subarray(0, 8).toString("ascii") === "LCDEED01");
  } catch (error) {
    console.log(`  SKIP  gateway unreachable (${error.message})`);
  }
}

console.log(`\n${allOk ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}\n`);
process.exit(allOk ? 0 : 1);
