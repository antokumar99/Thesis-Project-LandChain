"use client";

import { useEffect, useState } from "react";
import { Navbar } from "../../../components/common/Navbar";
import { ProtectedRoute } from "../../../components/common/ProtectedRoute";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { ProofOutputTabs } from "../../../components/proof/ProofOutputTabs";
import { api } from "../../../lib/api";
import type { ProofRecord } from "../../../types/proof.types";

export default function VerifyProofPage() {
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<ProofRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ProofRecord[]>("/proofs")
      .then(setProofs)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load proofs."));
  }, []);

  async function verify() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await api<ProofRecord>("/proofs/verify", { method: "POST", body: JSON.stringify({ proofId: selected }) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProtectedRoute>
      <Navbar />
      <main className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Verify a Proof</h1>
          <p className="mt-1 text-sm text-[#65766b]">
            Re-runs Groth16 verification against the circuit's verification key AND checks the public signals still
            match the current registry state (root, commitment, nonce).
          </p>
        </div>
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

        <Card>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-[#34433b]">
              Proof record
              <select
                className="h-10 rounded-md border border-[#c6d0c9] bg-white px-3 text-sm outline-none focus:border-[#244b36]"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">Select a proof…</option>
                {proofs.map((proof) => (
                  <option key={proof._id} value={proof._id}>
                    {proof.proofType} · {proof.landId ?? "anonymous"} · {new Date(proof.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <Button disabled={!selected || busy} onClick={verify}>{busy ? "Verifying…" : "Verify"}</Button>
          </div>
        </Card>

        {result ? (
          <>
            <div className="flex items-center gap-3">
              <StatusBadge status={result.verified ? "VERIFIED" : "FAILED"} />
              <p className="text-sm text-[#34433b]">{result.verificationNote}</p>
            </div>
            <Card>
              <ProofOutputTabs proof={result} />
            </Card>
          </>
        ) : null}
      </main>
    </ProtectedRoute>
  );
}
