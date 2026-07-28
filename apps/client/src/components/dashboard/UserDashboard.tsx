"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Tabs } from "../ui/Tabs";
import { StatusBadge } from "../ui/StatusBadge";
import { ProofOutputTabs } from "../proof/ProofOutputTabs";
import { api } from "../../lib/api";
import type { Land } from "../../types/land.types";
import type { Challenge, ChallengeParty } from "../../types/challenge.types";
import type { ProofRecord } from "../../types/proof.types";
import type { TransactionRecord } from "../../types/transaction.types";

function party(value: Challenge["buyerId"]): ChallengeParty {
  return typeof value === "object" && value ? value : {};
}

export function UserDashboard() {
  const [myLands, setMyLands] = useState<Land[]>([]);
  const [market, setMarket] = useState<Land[]>([]);
  const [challenges, setChallenges] = useState<{ asBuyer: Challenge[]; asSeller: Challenge[] }>({
    asBuyer: [],
    asSeller: []
  });
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [mine, marketData, challengeData, proofData, txData] = await Promise.all([
        api<Land[]>("/lands?scope=mine"),
        api<Land[]>("/lands?scope=market"),
        api<{ asBuyer: Challenge[]; asSeller: Challenge[] }>("/challenges"),
        api<ProofRecord[]>("/proofs"),
        api<TransactionRecord[]>("/transactions")
      ]);
      setMyLands(mine);
      setMarket(marketData);
      setChallenges(challengeData);
      setProofs(proofData);
      setTransactions(txData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function listForSale(landId: string) {
    const salePrice = window.prompt("Sale price (e.g. 2.5 ETH):");
    if (!salePrice) return;
    setBusy(landId);
    setError("");
    try {
      await api(`/lands/${landId}/sell`, { method: "PATCH", body: JSON.stringify({ salePrice }) });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list for sale.");
    } finally {
      setBusy("");
    }
  }

  async function cancelSale(landId: string) {
    setBusy(landId);
    setError("");
    try {
      await api(`/lands/${landId}/cancel-sale`, { method: "PATCH" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel sale.");
    } finally {
      setBusy("");
    }
  }

  async function askAuthenticity(landId: string) {
    setBusy(landId);
    setError("");
    try {
      const challenge = await api<Challenge>("/challenges", {
        method: "POST",
        body: JSON.stringify({
          landId,
          message: "Are you the authentic owner of this land? Please prove it with a zero-knowledge proof."
        })
      });
      window.location.href = `/challenges/${challenge._id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create challenge.");
      setBusy("");
    }
  }

  const challengeRow = (challenge: Challenge, perspective: "buyer" | "seller") => {
    const other = perspective === "buyer" ? party(challenge.sellerId) : party(challenge.buyerId);
    return (
      <Link
        key={challenge._id}
        href={`/challenges/${challenge._id}`}
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#d8dfda] bg-white px-4 py-3 hover:bg-[#f0f4f0]"
      >
        <div className="grid gap-0.5 text-sm">
          <span className="font-semibold text-[#17201b]">{challenge.landId}</span>
          <span className="text-xs text-[#65766b]">
            {perspective === "buyer" ? "You asked" : "Asked by"} {other.name ?? "user"} ·{" "}
            {new Date(challenge.updatedAt).toLocaleString()}
          </span>
        </div>
        <StatusBadge status={challenge.status} />
      </Link>
    );
  };

  return (
    <div className="grid gap-5">
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

      <Tabs
        tabs={[
          {
            id: "lands",
            label: `My Lands (${myLands.length})`,
            content: (
              <div className="grid gap-4">
                <div className="flex justify-end">
                  <Link href="/lands/request">
                    <Button>Request Land Registration</Button>
                  </Link>
                </div>
                {myLands.length === 0 ? (
                  <p className="text-sm text-[#65766b]">You have no lands yet. Submit a registration request.</p>
                ) : null}
                {myLands.map((land) => (
                  <Card key={land._id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="grid gap-1 text-sm">
                        <Link href={`/lands/${land.landId}`} className="text-base font-bold text-[#17201b] hover:underline">
                          {land.landId} · Plot {land.plotNumber}
                        </Link>
                        <p className="text-[#34433b]">{land.location} · {land.areaSqm} m²</p>
                        <div className="mt-1 flex items-center gap-2">
                          <StatusBadge status={land.status} />
                          {land.salePrice ? <span className="text-xs font-semibold text-[#244b36]">{land.salePrice}</span> : null}
                        </div>
                        {land.status === "REJECTED" && land.rejectionReason ? (
                          <p className="text-xs text-red-700">{land.rejectionReason}</p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        {land.status === "REGISTERED" ? (
                          <Button disabled={busy === land.landId} onClick={() => listForSale(land.landId)} variant="secondary">
                            Sell
                          </Button>
                        ) : null}
                        {land.status === "LISTED_FOR_SALE" ? (
                          <Button disabled={busy === land.landId} onClick={() => cancelSale(land.landId)} variant="secondary">
                            Cancel Sale
                          </Button>
                        ) : null}
                        {land.status === "REGISTERED" || land.status === "LISTED_FOR_SALE" ? (
                          <Link href={`/proofs/generate?landId=${land.landId}`}>
                            <Button variant="ghost">Prove</Button>
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )
          },
          {
            id: "market",
            label: `Marketplace (${market.length})`,
            content: (
              <div className="grid gap-4">
                {market.length === 0 ? <p className="text-sm text-[#65766b]">No lands are listed for sale right now.</p> : null}
                {market.map((land) => (
                  <Card key={land._id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="grid gap-1 text-sm">
                        <Link href={`/lands/${land.landId}`} className="text-base font-bold text-[#17201b] hover:underline">
                          {land.landId} · Plot {land.plotNumber}
                        </Link>
                        <p className="text-[#34433b]">{land.location} · {land.areaSqm} m²</p>
                        <p className="text-sm font-bold text-[#244b36]">{land.salePrice}</p>
                        <p className="text-xs text-[#65766b]">
                          Seller: {typeof land.ownerId === "object" ? land.ownerId.name : land.ownerWallet}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button disabled={busy === land.landId} onClick={() => askAuthenticity(land.landId)}>
                          Ask Owner to Prove
                        </Button>
                        <Link href={`/lands/${land.landId}`}>
                          <Button variant="secondary" className="w-full">Details / Buy</Button>
                        </Link>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )
          },
          {
            id: "challenges",
            label: `Challenges (${challenges.asBuyer.length + challenges.asSeller.length})`,
            content: (
              <div className="grid gap-5 md:grid-cols-2">
                <div className="grid content-start gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-[#65766b]">
                    Incoming — prove your ownership ({challenges.asSeller.length})
                  </h3>
                  {challenges.asSeller.length === 0 ? <p className="text-sm text-[#65766b]">No incoming challenges.</p> : null}
                  {challenges.asSeller.map((challenge) => challengeRow(challenge, "seller"))}
                </div>
                <div className="grid content-start gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-[#65766b]">
                    Outgoing — verify sellers ({challenges.asBuyer.length})
                  </h3>
                  {challenges.asBuyer.length === 0 ? <p className="text-sm text-[#65766b]">No outgoing challenges.</p> : null}
                  {challenges.asBuyer.map((challenge) => challengeRow(challenge, "buyer"))}
                </div>
              </div>
            )
          },
          {
            id: "zk-outputs",
            label: `ZK Outputs (${proofs.length})`,
            content: (
              <div className="grid gap-4">
                <div className="flex justify-end">
                  <Link href="/proofs/generate">
                    <Button>Generate New Proof</Button>
                  </Link>
                </div>
                {proofs.length === 0 ? <p className="text-sm text-[#65766b]">No proofs generated yet.</p> : null}
                {proofs.map((proof) => (
                  <Card key={proof._id}>
                    <ProofOutputTabs proof={proof} />
                  </Card>
                ))}
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
                      <th className="py-2">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 50).map((tx) => (
                      <tr key={tx._id} className="border-b border-[#eef2ed]">
                        <td className="py-2 pr-3 font-semibold">{tx.transactionType.replaceAll("_", " ")}</td>
                        <td className="py-2 pr-3">{tx.landId ?? "—"}</td>
                        <td className="py-2 pr-3"><StatusBadge status={tx.status} /></td>
                        <td className="py-2 text-xs text-[#65766b]">{new Date(tx.createdAt).toLocaleString()}</td>
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
