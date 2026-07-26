"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Navbar } from "../../components/common/Navbar";
import { ProtectedRoute } from "../../components/common/ProtectedRoute";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ProofOutputTabs } from "../../components/proof/ProofOutputTabs";
import { api } from "../../lib/api";
import type { ProofRecord, ProofStatus } from "../../types/proof.types";

export default function ProofsPage() {
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [status, setStatus] = useState<ProofStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<ProofRecord[]>("/proofs"), api<ProofStatus>("/proofs/status")])
      .then(([proofData, statusData]) => {
        setProofs(proofData);
        setStatus(statusData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load proofs."));
  }, []);

  return (
    <ProtectedRoute>
      <Navbar />
      <main className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">ZK Outputs</h1>
            <p className="mt-1 text-sm text-[#65766b]">
              Every zero-knowledge proof you generated or received, with the raw Groth16 proof, public signals, and
              verification result in tabs.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/proofs/generate"><Button>Generate Proof</Button></Link>
            <Link href="/proofs/verify"><Button variant="secondary">Verify Proof</Button></Link>
          </div>
        </div>
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

        {status ? (
          <Card>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#65766b]">Circuit artifacts</h2>
            <div className="mt-2 grid gap-1 text-sm md:grid-cols-2">
              {status.circuits.map((circuit) => (
                <p key={circuit.circuit} className="text-[#34433b]">
                  <span className={circuit.ready ? "text-emerald-700" : "text-red-700"}>{circuit.ready ? "●" : "○"}</span>{" "}
                  <span className="font-semibold">{circuit.circuit}</span> — signals: {circuit.publicSignalLabels.join(", ")}
                </p>
              ))}
            </div>
          </Card>
        ) : null}

        {proofs.length === 0 && !error ? <p className="text-sm text-[#65766b]">No proofs yet.</p> : null}
        {proofs.map((proof) => (
          <Card key={proof._id}>
            <ProofOutputTabs proof={proof} />
          </Card>
        ))}
      </main>
    </ProtectedRoute>
  );
}
