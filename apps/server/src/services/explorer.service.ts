import { Interface, JsonRpcProvider, formatEther } from "ethers";
import { env } from "../config/env";
import { LAND_REGISTRY_ABI } from "../constants/contract";
import { MerkleRootModel } from "../models/MerkleRoot.model";
import { TransactionModel } from "../models/Transaction.model";

/**
 * Block explorer data source.
 *
 * Chain mode  — when RPC_URL is configured and reachable: real blocks, full
 *               transaction data, receipts, decoded LandRegistry calls/events,
 *               and derived state changes, enriched with the API ledger entry
 *               that produced each transaction.
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
    if (event.name === "LandRegistered") {
      changes.push({
        label: `Land record created on-chain (landHash ${short(event.args.landHash)})`,
        after: `owner=${event.args.owner}, deedCid=${event.args.deedCid || "(none)"}, root=${short(event.args.merkleRoot)}`
      });
    }
    if (event.name === "LandTransferred") {
      changes.push({
        label: `Land owner (landHash ${short(event.args.landHash)})`,
        before: event.args.fromOwner,
        after: event.args.toOwner
      });
    }
  }
  return changes;
}

async function chainExplorer(limit: number, cursor: number | null): Promise<ExplorerResponse | null> {
  if (!env.rpcUrl) return null;
  const provider = new JsonRpcProvider(env.rpcUrl, env.chainId);
  try {
    const latestBlock = (await Promise.race([
      provider.getBlockNumber(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("RPC timeout")), 3000))
    ])) as number;

    const { prevByRoot, latestRoot } = await rootHistory();
    const start = cursor ?? latestBlock;
    const end = Math.max(0, start - limit + 1);

    const blocks: ExplorerBlock[] = [];
    const allHashes: string[] = [];

    for (let n = start; n >= end; n--) {
      const block = await provider.getBlock(n, true);
      if (!block) continue;
      const transactions: ExplorerTx[] = [];

      for (const tx of block.prefetchedTransactions) {
        allHashes.push(tx.hash);
        const receipt = await provider.getTransactionReceipt(tx.hash);

        let method: ExplorerTx["method"];
        try {
          const parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
          if (parsed) method = { name: parsed.name, args: argsToObject(parsed.fragment.inputs, parsed.args) };
        } catch {
          /* not a registry call */
        }

        const events: DecodedEvent[] = [];
        for (const log of receipt?.logs ?? []) {
          try {
            const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
            if (parsed) events.push({ name: parsed.name, args: argsToObject(parsed.fragment.inputs, parsed.args) });
          } catch {
            /* foreign contract log */
          }
        }

        transactions.push({
          hash: tx.hash,
          from: tx.from,
          to: tx.to ?? undefined,
          nonce: tx.nonce,
          valueEth: formatEther(tx.value),
          gasUsed: receipt ? receipt.gasUsed.toString() : undefined,
          status: receipt ? (receipt.status === 1 ? "SUCCESS" : "REVERTED") : undefined,
          method,
          events,
          stateChanges: changesFromEvents(events, prevByRoot),
          raw: {
            data: tx.data,
            gasPrice: tx.gasPrice?.toString(),
            logs: receipt?.logs.map((log) => ({ address: log.address, topics: [...log.topics], data: log.data }))
          }
        });
      }

      blocks.push({
        number: block.number,
        hash: block.hash ?? "",
        parentHash: block.parentHash,
        timestamp: block.timestamp,
        miner: block.miner,
        gasUsed: block.gasUsed.toString(),
        gasLimit: block.gasLimit.toString(),
        txCount: block.transactions.length,
        transactions
      });
    }

    // Attach the API ledger entry that produced each transaction.
    if (allHashes.length) {
      const ledgerDocs = await TransactionModel.find({ blockchainTxHash: { $in: allHashes } });
      const byHash = new Map(ledgerDocs.map((doc) => [doc.blockchainTxHash, doc]));
      for (const block of blocks) {
        for (const tx of block.transactions) {
          const doc = byHash.get(tx.hash);
          if (doc) {
            tx.ledger = {
              transactionType: doc.transactionType,
              landId: doc.landId ?? undefined,
              fromOwner: doc.fromOwner ?? undefined,
              toOwner: doc.toOwner ?? undefined,
              status: doc.status,
              detail: doc.detail ?? undefined,
              createdAt: doc.createdAt?.toISOString()
            };
          }
        }
      }
    }

    return {
      source: "chain",
      network: { chainId: env.chainId, latestBlock, registryAddress: env.landRegistryAddress },
      latestRoot,
      blocks,
      nextCursor: end > 0 ? end - 1 : null
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
  const { byTxHash, prevByRoot, latestRoot, roots } = await rootHistory();

  const blocks: ExplorerBlock[] = docs.map((doc, idx) => {
    const stateChanges: StateChange[] = [];

    const rootDoc = byTxHash.get(doc.blockchainTxHash);
    if (rootDoc) {
      stateChanges.push({
        label: "Registry Merkle root (anchors every ownership commitment)",
        before: prevByRoot.get(rootDoc.root),
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
      const after = roots.find((r) => r.createdAt && doc.createdAt && r.createdAt >= doc.createdAt);
      if (after) {
        stateChanges.push({
          label: "Registry Merkle root (land removed pending re-registration; old owner can no longer prove)",
          before: prevByRoot.get(after.root),
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

    return {
      number: total - skip - idx,
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
          stateChanges,
          ledger: {
            transactionType: doc.transactionType,
            landId: doc.landId ?? undefined,
            fromOwner: doc.fromOwner ?? undefined,
            toOwner: doc.toOwner ?? undefined,
            status: doc.status,
            detail: doc.detail ?? undefined,
            createdAt: doc.createdAt?.toISOString()
          }
        }
      ]
    };
  });

  return {
    source: "local",
    note:
      "No blockchain node is reachable, so these are the API's locally recorded ledger entries (one pseudo-block each). Configure RPC_URL / LAND_REGISTRY_ADDRESS to see real on-chain blocks.",
    latestRoot,
    blocks,
    nextCursor: skip + docs.length < total ? skip + docs.length : null
  };
}

export async function getExplorerBlocks(input: { limit?: number; cursor?: number | null }): Promise<ExplorerResponse> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const cursor = input.cursor ?? null;
  const onChain = await chainExplorer(limit, cursor);
  return onChain ?? localExplorer(limit, cursor);
}
