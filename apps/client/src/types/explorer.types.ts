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
