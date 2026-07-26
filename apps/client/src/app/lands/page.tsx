"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Navbar } from "../../components/common/Navbar";
import { ProtectedRoute } from "../../components/common/ProtectedRoute";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { api } from "../../lib/api";
import type { Land } from "../../types/land.types";

export default function LandsPage() {
  const [lands, setLands] = useState<Land[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Land[]>("/lands?scope=all")
      .then(setLands)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load lands."));
  }, []);

  return (
    <ProtectedRoute>
      <Navbar />
      <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-6">
        <h1 className="text-2xl font-bold">Land Registry</h1>
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
        <div className="grid gap-3">
          {lands.map((land) => (
            <Card key={land._id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid gap-1 text-sm">
                  <Link href={`/lands/${land.landId}`} className="text-base font-bold text-[#17201b] hover:underline">
                    {land.landId} · Plot {land.plotNumber}
                  </Link>
                  <p className="text-[#34433b]">{land.location} · {land.areaSqm} m²</p>
                  <p className="break-all text-xs text-[#65766b]">Commitment: {land.landCommitment.slice(0, 40)}…</p>
                </div>
                <div className="grid justify-items-end gap-1">
                  <StatusBadge status={land.status} />
                  {land.salePrice ? <span className="text-sm font-bold text-[#244b36]">{land.salePrice}</span> : null}
                </div>
              </div>
            </Card>
          ))}
          {lands.length === 0 && !error ? <p className="text-sm text-[#65766b]">No lands registered yet.</p> : null}
        </div>
      </main>
    </ProtectedRoute>
  );
}
