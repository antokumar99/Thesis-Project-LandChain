"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Tabs } from "../ui/Tabs";
import { StatusBadge } from "../ui/StatusBadge";
import { api, EMPTY_DEED_CID, openDeed } from "../../lib/api";
import type { Land, LandOwnerRef, RegistryStats } from "../../types/land.types";
import type { TransactionRecord } from "../../types/transaction.types";

function ownerRef(land: Land): LandOwnerRef {
  return typeof land.ownerId === "object" && land.ownerId ? land.ownerId : {};
}

export function AuthorityDashboard() {
  const [pending, setPending] = useState<Land[]>([]);
  const [lands, setLands] = useState<Land[]>([]);
  const [stats, setStats] = useState<RegistryStats | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [pendingData, landData, statsData, txData] = await Promise.all([
        api<Land[]>("/lands/requests"),
        api<Land[]>("/lands?scope=all"),
        api<RegistryStats>("/lands/stats"),
        api<TransactionRecord[]>("/transactions")
      ]);
      setPending(pendingData);
      setLands(landData);
      setStats(statsData);
      setTransactions(txData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function viewDeed(cid: string) {
    setError("");
    try {
      await openDeed(cid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deed not available.");
    }
  }

  async function decide(landId: string, action: "approve" | "reject") {
    setBusy(landId);
    setError("");
    try {
      await api(`/lands/${landId}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "reject" ? { reason: "Rejected by authority review." } : {})
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}.`);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="grid gap-5">
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Pending Requests", value: stats?.pending ?? "—" },
          { label: "Registered Lands", value: stats?.registered ?? "—" },
          { label: "Listed For Sale", value: stats?.listed ?? "—" },
          { label: "Users", value: stats?.users ?? "—" }
        ].map((metric) => (
          <Card key={metric.label}>
            <p className="text-sm font-semibold text-[#65766b]">{metric.label}</p>
            <p className="mt-2 text-2xl font-bold text-[#17201b]">{metric.value}</p>
          </Card>
        ))}
      </section>

      <Tabs
        tabs={[
          {
            id: "requests",
            label: `Pending Requests (${pending.length})`,
            content: (
              <div className="grid gap-4">
                {pending.length === 0 ? <p className="text-sm text-[#65766b]">No pending registration requests.</p> : null}
                {pending.map((land) => {
                  const applicant = ownerRef(land);
                  return (
                    <Card key={land._id}>
                      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                        <div className="grid gap-1 text-sm">
                          <p className="text-base font-bold text-[#17201b]">
                            {land.landId} · Plot {land.plotNumber}
                          </p>
                          <p className="text-[#34433b]">
                            {land.location} · {land.areaSqm} m²
                          </p>
                          <div className="mt-2 rounded-md bg-[#f0f4f0] p-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-[#65766b]">Applicant identity</p>
                            <p className="mt-1 text-[#17201b]">{applicant.name}</p>
                            <p className="text-[#34433b]">{applicant.email} · {applicant.phone ?? "no phone"}</p>
                            <p className="break-all text-xs text-[#65766b]">Wallet: {applicant.walletAddress}</p>
                            <p className="break-all text-xs text-[#65766b]">NID hash: {applicant.nidHash}</p>
                            {applicant.address ? <p className="text-xs text-[#65766b]">{applicant.address}</p> : null}
                          </div>
                          <p className="mt-2 break-all text-xs text-[#65766b]">Deed hash: {land.deedHash}</p>
                          <p className="break-all text-xs text-[#65766b]">Commitment: {land.landCommitment}</p>
                          {land.requestNote ? <p className="text-xs text-[#34433b]">Note: {land.requestNote}</p> : null}
                        </div>
                        <div className="flex gap-2 md:flex-col">
                          {land.ipfsCID && land.ipfsCID !== EMPTY_DEED_CID ? (
                            <Button variant="secondary" onClick={() => viewDeed(land.ipfsCID)}>
                              View Deed
                            </Button>
                          ) : (
                            <p className="rounded-md bg-amber-50 px-2 py-1 text-center text-xs font-semibold text-amber-700">
                              No deed uploaded
                            </p>
                          )}
                          <Button disabled={busy === land.landId} onClick={() => decide(land.landId, "approve")}>
                            {busy === land.landId ? "Working..." : "Approve"}
                          </Button>
                          <Button
                            disabled={busy === land.landId}
                            onClick={() => decide(land.landId, "reject")}
                            variant="secondary"
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )
          },
          {
            id: "registry",
            label: `Registry (${lands.length})`,
            content: (
              <div className="grid gap-3">
                <p className="break-all rounded-md bg-[#f0f4f0] p-3 text-xs text-[#34433b]">
                  Latest Merkle root: {stats?.latestRoot ?? "none yet"}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#d8dfda] text-[#65766b]">
                        <th className="py-2 pr-3">Land</th>
                        <th className="py-2 pr-3">Owner</th>
                        <th className="py-2 pr-3">Leaf</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lands.map((land) => (
                        <tr key={land._id} className="border-b border-[#eef2ed]">
                          <td className="py-2 pr-3 font-semibold text-[#17201b]">{land.landId}</td>
                          <td className="break-all py-2 pr-3 text-xs">{ownerRef(land).name ?? land.ownerWallet}</td>
                          <td className="py-2 pr-3">{land.leafIndex ?? "—"}</td>
                          <td className="py-2 pr-3"><StatusBadge status={land.status} /></td>
                          <td className="py-2">{land.salePrice ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          },
          {
            id: "ledger",
            label: "Ledger",
            content: (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#d8dfda] text-[#65766b]">
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Land</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 50).map((tx) => (
                      <tr key={tx._id} className="border-b border-[#eef2ed]">
                        <td className="py-2 pr-3 font-semibold">{tx.transactionType.replaceAll("_", " ")}</td>
                        <td className="py-2 pr-3">{tx.landId ?? "—"}</td>
                        <td className="py-2 pr-3"><StatusBadge status={tx.status} /></td>
                        <td className="py-2 text-xs text-[#65766b]">{tx.detail ?? tx.blockchainTxHash.slice(0, 18) + "…"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        ]}
      />
    </div>
  );
}
