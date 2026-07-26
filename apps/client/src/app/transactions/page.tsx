"use client";

import { useEffect, useState } from "react";
import { Navbar } from "../../components/common/Navbar";
import { ProtectedRoute } from "../../components/common/ProtectedRoute";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { api } from "../../lib/api";
import type { TransactionRecord } from "../../types/transaction.types";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<TransactionRecord[]>("/transactions")
      .then(setTransactions)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load transactions."));
  }, []);

  return (
    <ProtectedRoute>
      <Navbar />
      <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-6">
        <h1 className="text-2xl font-bold">Transaction Ledger</h1>
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
        <div className="overflow-x-auto rounded-lg border border-[#d8dfda] bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#d8dfda] bg-[#f0f4f0] text-[#65766b]">
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Land</th>
                <th className="px-4 py-2">From</th>
                <th className="px-4 py-2">To</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Detail / Tx</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx._id} className="border-b border-[#eef2ed] align-top">
                  <td className="px-4 py-2 font-semibold">{tx.transactionType.replaceAll("_", " ")}</td>
                  <td className="px-4 py-2">{tx.landId ?? "—"}</td>
                  <td className="break-all px-4 py-2 text-xs">{tx.fromOwner ?? "—"}</td>
                  <td className="break-all px-4 py-2 text-xs">{tx.toOwner ?? "—"}</td>
                  <td className="px-4 py-2"><StatusBadge status={tx.status} /></td>
                  <td className="max-w-xs break-all px-4 py-2 text-xs text-[#65766b]">
                    {tx.detail ?? tx.blockchainTxHash}
                  </td>
                  <td className="px-4 py-2 text-xs text-[#65766b]">{new Date(tx.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </ProtectedRoute>
  );
}
