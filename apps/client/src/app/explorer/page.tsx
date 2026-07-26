"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Blocks, ChevronDown, Database, Link2 } from "lucide-react";
import { Navbar } from "../../components/common/Navbar";
import { ProtectedRoute } from "../../components/common/ProtectedRoute";
import { JsonViewer } from "../../components/ui/JsonViewer";
import { api } from "../../lib/api";
import type { ExplorerBlock, ExplorerResponse, ExplorerTx } from "../../types/explorer.types";

function shorten(value?: string, head = 10, tail = 8): string {
  if (!value) return "—";
  return value.length > head + tail + 3 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

function Mono({ value, full = false }: { value?: string; full?: boolean }) {
  return (
    <span className="break-all font-mono text-xs text-[#34433b]" title={value}>
      {full ? (value ?? "—") : shorten(value)}
    </span>
  );
}

function StatusPill({ status }: { status?: string }) {
  const styles: Record<string, string> = {
    SUCCESS: "bg-green-100 text-green-800",
    REVERTED: "bg-red-100 text-red-700",
    LOCAL: "bg-amber-100 text-amber-800"
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${styles[status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
      {status ?? "UNKNOWN"}
    </span>
  );
}

function StateChanges({ tx }: { tx: ExplorerTx }) {
  if (!tx.stateChanges.length) return null;
  return (
    <div className="grid gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-[#65766b]">What changed</p>
      {tx.stateChanges.map((change, i) => (
        <div key={i} className="rounded-md border border-[#e3e9e4] bg-[#f7faf7] p-3">
          <p className="mb-1 text-xs font-semibold text-[#34433b]">{change.label}</p>
          <div className="flex flex-wrap items-center gap-2">
            {change.before !== undefined ? (
              <>
                <span className="break-all rounded bg-red-50 px-2 py-1 font-mono text-[11px] text-red-700 line-through decoration-red-300">
                  {shorten(change.before, 14, 10)}
                </span>
                <ArrowRight size={14} className="shrink-0 text-[#65766b]" />
              </>
            ) : (
              <span className="rounded bg-green-50 px-2 py-1 text-[11px] font-bold text-green-700">NEW</span>
            )}
            <span className="break-all rounded bg-green-50 px-2 py-1 font-mono text-[11px] text-green-800" title={change.after}>
              {shorten(change.after, 20, 12)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TxCard({ tx }: { tx: ExplorerTx }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="grid gap-3 rounded-lg border border-[#d8dfda] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={tx.status} />
        {tx.ledger ? (
          <span className="rounded-full bg-[#244b36] px-2 py-0.5 text-[11px] font-bold text-white">
            {tx.ledger.transactionType.replaceAll("_", " ")}
          </span>
        ) : null}
        {tx.method ? (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-800">
            {tx.method.name}()
          </span>
        ) : null}
        {tx.ledger?.landId ? (
          <span className="rounded-full bg-[#eef2ed] px-2 py-0.5 text-[11px] font-bold text-[#34433b]">{tx.ledger.landId}</span>
        ) : null}
      </div>

      <div className="grid gap-1 text-xs text-[#65766b] sm:grid-cols-2">
        <p>Tx hash: <Mono value={tx.hash} /></p>
        {tx.gasUsed ? <p>Gas used: <Mono value={tx.gasUsed} full /></p> : null}
        <p>From: <Mono value={tx.from} /></p>
        <p>To: <Mono value={tx.to} /></p>
      </div>

      {tx.method && Object.keys(tx.method.args).length ? (
        <div className="grid gap-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[#65766b]">Stored on-chain (call arguments)</p>
          <div className="overflow-x-auto rounded-md border border-[#e3e9e4]">
            <table className="w-full text-left text-xs">
              <tbody>
                {Object.entries(tx.method.args).map(([key, value]) => (
                  <tr key={key} className="border-b border-[#eef2ed] last:border-0">
                    <td className="w-36 px-3 py-1.5 font-semibold text-[#34433b]">{key}</td>
                    <td className="break-all px-3 py-1.5 font-mono text-[#65766b]">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tx.events.length ? (
        <div className="grid gap-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[#65766b]">Emitted events</p>
          {tx.events.map((event, i) => (
            <div key={i} className="rounded-md border border-[#e3e9e4] p-2">
              <p className="mb-1 font-mono text-xs font-bold text-[#244b36]">{event.name}</p>
              <div className="grid gap-0.5">
                {Object.entries(event.args).map(([key, value]) => (
                  <p key={key} className="break-all text-[11px] text-[#65766b]">
                    <span className="font-semibold text-[#34433b]">{key}:</span> <span className="font-mono">{value}</span>
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <StateChanges tx={tx} />

      {tx.ledger?.detail ? (
        <p className="rounded-md bg-[#f0f4f0] px-3 py-2 text-xs text-[#34433b]">{tx.ledger.detail}</p>
      ) : null}

      {tx.raw ? (
        <div>
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="text-xs font-semibold text-[#244b36] underline"
          >
            {showRaw ? "Hide raw transaction data" : "Show raw transaction data"}
          </button>
          {showRaw ? <div className="mt-2"><JsonViewer value={tx.raw} maxHeight="16rem" /></div> : null}
        </div>
      ) : null}
    </div>
  );
}

function BlockCard({ block, source }: { block: ExplorerBlock; source: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-[#d8dfda] bg-[#f7faf7]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-[#244b36]">
          <Blocks size={16} />
          {source === "chain" ? `Block #${block.number}` : `Entry #${block.number}`}
        </span>
        <Mono value={block.hash} />
        <span className="text-xs text-[#65766b]">{new Date(block.timestamp * 1000).toLocaleString()}</span>
        <span className="text-xs text-[#65766b]">{block.txCount} tx</span>
        {block.gasUsed ? <span className="text-xs text-[#65766b]">gas {block.gasUsed}</span> : null}
        <ChevronDown size={16} className={`ml-auto shrink-0 text-[#65766b] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="grid gap-3 border-t border-[#e3e9e4] p-4">
          {block.parentHash ? (
            <p className="text-xs text-[#65766b]">Parent: <Mono value={block.parentHash} /> {block.miner ? <>· Miner: <Mono value={block.miner} /></> : null}</p>
          ) : null}
          {block.transactions.length ? (
            block.transactions.map((tx) => <TxCard key={tx.hash} tx={tx} />)
          ) : (
            <p className="text-xs text-[#65766b]">No transactions in this block.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function ExplorerPage() {
  const [data, setData] = useState<ExplorerResponse | null>(null);
  const [blocks, setBlocks] = useState<ExplorerBlock[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (cursor: number | null) => {
    const query = cursor !== null ? `?limit=10&cursor=${cursor}` : "?limit=10";
    return api<ExplorerResponse>(`/explorer${query}`);
  }, []);

  useEffect(() => {
    load(null)
      .then((res) => { setData(res); setBlocks(res.blocks); })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load explorer data."));
  }, [load]);

  async function loadMore() {
    if (!data || data.nextCursor === null) return;
    setLoadingMore(true);
    try {
      const res = await load(data.nextCursor);
      setData(res);
      setBlocks((prev) => [...prev, ...res.blocks]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more blocks.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <ProtectedRoute>
      <Navbar />
      <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Block Explorer</h1>
          {data ? (
            <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${data.source === "chain" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
              {data.source === "chain" ? <Link2 size={13} /> : <Database size={13} />}
              {data.source === "chain" ? "Live on-chain data" : "Local ledger (no node connected)"}
            </span>
          ) : null}
        </div>

        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
        {data?.note ? <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{data.note}</p> : null}

        {data ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {data.network ? (
              <>
                <div className="rounded-lg border border-[#d8dfda] bg-white p-3">
                  <p className="text-xs font-bold uppercase text-[#65766b]">Latest block</p>
                  <p className="text-lg font-bold text-[#244b36]">#{data.network.latestBlock}</p>
                  <p className="text-xs text-[#65766b]">chain id {data.network.chainId}</p>
                </div>
                <div className="rounded-lg border border-[#d8dfda] bg-white p-3">
                  <p className="text-xs font-bold uppercase text-[#65766b]">LandRegistry contract</p>
                  <Mono value={data.network.registryAddress} />
                </div>
              </>
            ) : null}
            <div className="rounded-lg border border-[#d8dfda] bg-white p-3">
              <p className="text-xs font-bold uppercase text-[#65766b]">Current Merkle root</p>
              <Mono value={data.latestRoot} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#65766b]">Loading blocks…</p>
        )}

        <div className="grid gap-3">
          {blocks.map((block) => (
            <BlockCard key={`${block.number}-${block.hash}`} block={block} source={data?.source ?? "local"} />
          ))}
        </div>

        {data?.nextCursor !== null && data !== null ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="justify-self-center rounded-md bg-[#244b36] px-4 py-2 text-sm font-bold text-white hover:bg-[#1b3a29] disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load older blocks"}
          </button>
        ) : null}
      </main>
    </ProtectedRoute>
  );
}
