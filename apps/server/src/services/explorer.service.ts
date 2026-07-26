import { Interface, JsonRpcProvider, formatEther } from "ethers";
import { env } from "../config/env";
import { LAND_REGISTRY_ABI } from "../constants/contract";
import { MerkleRootModel } from "../models/MerkleRoot.model";
import { TransactionModel } from "../models/Transaction.model";

/**
 * Block explorer data source.
 *
 * Chain mode  — when RPC_URL is configured and reachable: the API's ledger
 *               entries are resolved against the chain by transaction hash,
 *               showing real block data, receipts, decoded LandRegistry
 *               calls/events, and derived state changes. Entries recorded
 *               while no chain was reachable stay visible as LOCAL rows.
 *               (Ledger-driven on purpose: scanning head blocks works on a
 *               private hardhat node but is useless on a public network like
 *               Sepolia, where blocks are full of unrelated transactions.)
 * Local mode  — offline fallback: the API's own ledger is presented in the
 *               same shape (one pseudo-block per recorded action) so the page
 *               works without a node.
 */

export type StateChange = { label: string; before?: string; after?: string };
export type DecodedEvent = { name: string; args: Record<string, string> };
export type ExplorerTx = {
  hash: string;
  from?: string;
  to?: string;
  nonce?: number;
  valueEth?: string;
  gasUsed?: string;
  status?: "SUCCESS" | "REVERTED" | "LOCAL";
  method?: { name: string; args: Record<string, string> };
  events: DecodedEvent[];
  stateChanges: StateChange[];
  ledger?: {
    transactionType: string;
    landId?: string;
    fromOwner?: string;
    toOwner?: string;
    status: string;
    detail?: string;
    createdAt?: string;
  };
  raw?: unknown;
};
export type ExplorerBlock = {
  number: number;
  hash: string;
  parentHash?: string;
  timestamp: number;
  miner?: string;
  gasUsed?: string;
  gasLimit?: string;
  txCount: number;
  transactions: ExplorerTx[];
};
export type ExplorerResponse = {
  source: "chain" | "local";
  note?: string;
  network?: { chainId: number; latestBlock: number; registryAddress?: string };
  latestRoot?: string;
  blocks: ExplorerBlock[];
  nextCursor: number | null;
};

const iface = new Interface(LAND_REGISTRY_ABI);

function short(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function argsToObject(fragmentInputs: readonly { name: string }[], args: readonly unknown[]): Record<string, string> {
  const out: Record<string, string> = {};
  fragmentInputs.forEach((input, i) => {
    const value = args[i];
    out[input.name || `arg${i}`] = typeof value === "bigint" ? value.toString() : String(value);
  });
  return out;
}

async function rootHistory() {
  const roots = await MerkleRootModel.find().sort({ createdAt: 1 });
  const prevByRoot = new Map<string, string>();
  const byTxHash = new Map<string, (typeof roots)[number]>();
  roots.forEach((doc, i) => {
    if (i > 0) prevByRoot.set(doc.root, roots[i - 1].root);
    if (doc.transactionHash) byTxHash.set(doc.transactionHash, doc);
  });
  const latestRoot = roots.length ? roots[roots.length - 1].root : undefined;
  return { roots, prevByRoot, byTxHash, latestRoot };
}

function toBytes32Root(decimal: string): string {
  try {
    return `0x${BigInt(decimal).toString(16).padStart(64, "0")}`;
  } catch {
    return decimal;
  }
}

/** Derive human-readable state changes from decoded registry events. */
function changesFromEvents(events: DecodedEvent[], prevByRoot: Map<string, string>): StateChange[] {
  const changes: StateChange[] = [];
  for (const event of events) {
    if (event.name === "MerkleRootUpdated") {
      const decimalPrev = [...prevByRoot.entries()].find(([root]) => toBytes32Root(root) === event.args.root)?.[1];
      changes.push({
        label: "Registry Merkle root (anchors every ownership commitment)",
        before: decimalPrev ? toBytes32Root(decimalPrev) : undefined,
        after: event.args.root
      });
    }
    if (event.name === "MerkleRootBootstrapped") {
      changes.push({
        label: "Registry Merkle root bootstrapped (one-time migration anchor)",
        after: event.args.root
      });
    }
    if (event.name === "LandRegistered") {
      changes.push({
        label: `Land record created on-chain (landHash ${short(event.args.landHash)})`,
        after: `deedCid=${event.args.deedCid || "(none)"} — identity-free: no owner is written on chain`
      });
    }
    if (event.name === "LandTransferred") {
      changes.push({
        label: `Land transferred (landHash ${short(event.args.landHash)})`,
        after: `ownership proof consumed (nullifier ${short(event.args.nullifier)}); new owner exists only as a tree commitment`
      });
    }
  }
  return changes;
}

type LedgerDoc = InstanceType<typeof TransactionModel> extends infer T ? T : never;
type RootContext = Awaited<ReturnType<typeof rootHistory>>;

function ledgerInfo(doc: LedgerDoc): ExplorerTx["ledger"] {
  return {
    transactionType: doc.transactionType,
    landId: doc.landId ?? undefined,
    fromOwner: doc.fromOwner ?? undefined,
    toOwner: doc.toOwner ?? undefined,
    status: doc.status,
    detail: doc.detail ?? undefined,
    createdAt: doc.createdAt?.toISOString()
  };
}

/** State changes derived from the API ledger entry itself (used when no on-chain receipt exists). */
function ledgerStateChanges(doc: LedgerDoc, ctx: RootContext): StateChange[] {
  const stateChanges: StateChange[] = [];

  const rootDoc = ctx.byTxHash.get(doc.blockchainTxHash);
  if (rootDoc) {
    stateChanges.push({
      label: "Registry Merkle root (anchors every ownership commitment)",
      before: ctx.prevByRoot.get(rootDoc.root),
      after: rootDoc.root
    });
    stateChanges.push({
      label: "Registry tree contents",
      after: `${rootDoc.leafCount} leaves — lands: ${rootDoc.landIds.join(", ") || "(none)"}`
    });
  }
  if (doc.transactionType === "BUY") {
    stateChanges.push({
      label: `Land ${doc.landId} owner`,
      before: doc.fromOwner ?? undefined,
      after: doc.toOwner ?? undefined
    });
    const after = ctx.roots.find((r) => r.createdAt && doc.createdAt && r.createdAt >= doc.createdAt);
    if (after) {
      stateChanges.push({
        label: "Registry Merkle root (land removed pending re-registration; old owner can no longer prove)",
        before: ctx.prevByRoot.get(after.root),
        after: after.root
      });
    }
  }
  if (doc.transactionType === "LAND_REQUESTED") {
    stateChanges.push({
      label: `Land ${doc.landId}`,
      after: "Poseidon(landIdField, secretField) commitment + area commitment stored; status PENDING_APPROVAL"
    });
  }

  return stateChanges;
}

/** Pseudo-block for a ledger entry with no on-chain transaction. */
function localBlock(doc: LedgerDoc, entryNumber: number, ctx: RootContext): ExplorerBlock {
  return {
    number: entryNumber,
    hash: doc.blockchainTxHash,
    timestamp: doc.createdAt ? Math.floor(doc.createdAt.getTime() / 1000) : 0,
    txCount: 1,
    transactions: [
      {
        hash: doc.blockchainTxHash,
        from: doc.fromOwner ?? undefined,
        to: doc.toOwner ?? undefined,
        status: "LOCAL",
        events: [],
        stateChanges: ledgerStateChanges(doc, ctx),
        ledger: ledgerInfo(doc)
      }
    ]
  };
}

/**
 * Resolve one ledger entry against the chain: real block + receipt + decoded
 * registry calls/events when the transaction exists on-chain, LOCAL pseudo-
 * block otherwise (entry predates the chain config or was recorded offline).
 */
async function resolveLedgerEntry(
  provider: JsonRpcProvider,
  doc: LedgerDoc,
  entryNumber: number,
  ctx: RootContext
): Promise<ExplorerBlock> {
  const receipt = await provider.getTransactionReceipt(doc.blockchainTxHash).catch(() => null);
  if (!receipt) return localBlock(doc, entryNumber, ctx);

  const [tx, block] = await Promise.all([
    provider.getTransaction(doc.blockchainTxHash).catch(() => null),
    provider.getBlock(receipt.blockNumber).catch(() => null)
  ]);

  let method: ExplorerTx["method"];
  if (tx) {
    try {
      const parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
      if (parsed) method = { name: parsed.name, args: argsToObject(parsed.fragment.inputs, parsed.args) };
    } catch {
      /* not a registry call */
    }
  }

  const events: DecodedEvent[] = [];
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed) events.push({ name: parsed.name, args: argsToObject(parsed.fragment.inputs, parsed.args) });
    } catch {
      /* foreign contract log */
    }
  }

  const stateChanges = changesFromEvents(events, ctx.prevByRoot);
  return {
    number: receipt.blockNumber,
    hash: block?.hash ?? "",
    parentHash: block?.parentHash,
    timestamp: block?.timestamp ?? (doc.createdAt ? Math.floor(doc.createdAt.getTime() / 1000) : 0),
    miner: block?.miner,
    gasUsed: block?.gasUsed?.toString(),
    gasLimit: block?.gasLimit?.toString(),
    txCount: 1,
    transactions: [
      {
        hash: receipt.hash,
        from: tx?.from ?? receipt.from,
        to: tx?.to ?? receipt.to ?? undefined,
        nonce: tx?.nonce,
        valueEth: tx ? formatEther(tx.value) : undefined,
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 1 ? "SUCCESS" : "REVERTED",
        method,
        events,
        stateChanges: stateChanges.length ? stateChanges : ledgerStateChanges(doc, ctx),
        ledger: ledgerInfo(doc),
        raw: tx
          ? {
              data: tx.data,
              gasPrice: tx.gasPrice?.toString(),
              logs: receipt.logs.map((log) => ({ address: log.address, topics: [...log.topics], data: log.data }))
            }
          : undefined
      }
    ]
  };
}

async function chainExplorer(limit: number, cursor: number | null): Promise<ExplorerResponse | null> {
  if (!env.rpcUrl) return null;
  const provider = new JsonRpcProvider(env.rpcUrl, env.chainId);
  try {
    // Connectivity probe; also feeds the network header on the page.
    const latestBlock = (await Promise.race([
      provider.getBlockNumber(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("RPC timeout")), 5000))
    ])) as number;

    // Ledger-driven: page through the API's own transactions and resolve each
    // hash on-chain. Works identically on hardhat and public networks.
    const total = await TransactionModel.countDocuments({});
    const skip = cursor ?? 0;
    const docs = await TransactionModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit);
    const ctx = await rootHistory();

    const blocks = await Promise.all(
      docs.map((doc, idx) => resolveLedgerEntry(provider, doc, total - skip - idx, ctx))
    );
    const localCount = blocks.filter((b) => b.transactions[0]?.status === "LOCAL").length;

    return {
      source: "chain",
      note: localCount
        ? `${localCount} of ${blocks.length} entries on this page have no on-chain transaction (recorded before the chain was configured or while it was unreachable) and are shown as LOCAL.`
        : undefined,
      network: { chainId: env.chainId, latestBlock, registryAddress: env.landRegistryAddress },
      latestRoot: ctx.latestRoot,
      blocks,
      nextCursor: skip + docs.length < total ? skip + docs.length : null
    };
  } catch {
    return null; // RPC unreachable -> caller falls back to local mode.
  } finally {
    provider.destroy();
  }
}

async function localExplorer(limit: number, cursor: number | null): Promise<ExplorerResponse> {
  const total = await TransactionModel.countDocuments({});
  const skip = cursor ?? 0;
  const docs = await TransactionModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit);
  const ctx = await rootHistory();

  return {
    source: "local",
    note:
      "No blockchain node is reachable, so these are the API's locally recorded ledger entries (one pseudo-block each). Configure RPC_URL / LAND_REGISTRY_ADDRESS to see real on-chain blocks.",
    latestRoot: ctx.latestRoot,
    blocks: docs.map((doc, idx) => localBlock(doc, total - skip - idx, ctx)),
    nextCursor: skip + docs.length < total ? skip + docs.length : null
  };
}

export async function getExplorerBlocks(input: { limit?: number; cursor?: number | null }): Promise<ExplorerResponse> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const cursor = input.cursor ?? null;
  const onChain = await chainExplorer(limit, cursor);
  return onChain ?? localExplorer(limit, cursor);
}
