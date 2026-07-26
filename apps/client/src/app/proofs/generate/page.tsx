"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { Navbar } from "../../../components/common/Navbar";
import { ProtectedRoute } from "../../../components/common/ProtectedRoute";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { ProofOutputTabs } from "../../../components/proof/ProofOutputTabs";
import { api } from "../../../lib/api";
import {
  areaSaltField,
  landIdToField,
  proveInBrowser,
  secretToField,
  type CircuitName
} from "../../../lib/zk";
import type { Challenge } from "../../../types/challenge.types";
import type { Land } from "../../../types/land.types";
import type { Groth16Proof, ProofRecord, ProofStatus, ProofType } from "../../../types/proof.types";

const PROOF_TYPE_ORDER: ProofType[] = ["COMMITMENT_OPENING", "REGISTRY_MEMBERSHIP", "CHALLENGE_RESPONSE", "AREA_RANGE"];

const PROOF_TYPE_CIRCUITS: Record<ProofType, CircuitName> = {
  COMMITMENT_OPENING: "commitmentProof",
  REGISTRY_MEMBERSHIP: "landOwnership",
  CHALLENGE_RESPONSE: "challengeProof",
  AREA_RANGE: "areaRange"
};

/**
 * Build the circuit witness input IN THE BROWSER. The owner secret is turned
 * into field elements locally and never sent anywhere.
 */
async function buildCircuitInput(
  proofType: ProofType,
  land: Land,
  ownerSecret: string,
  options: { challengeId?: string; minArea?: number }
): Promise<Record<string, unknown>> {
  const landIdField = landIdToField(land.landId);
  const secretField = secretToField(land.landId, ownerSecret);

  switch (proofType) {
    case "COMMITMENT_OPENING":
      return { ownerSecret: secretField, landIdField, commitment: land.landCommitment };

    case "REGISTRY_MEMBERSHIP":
      if (!land.merkleRoot || !land.pathElements?.length) throw new Error("Land has no Merkle path yet.");
      return {
        landIdField,
        ownerSecret: secretField,
        pathElements: land.pathElements,
        pathIndices: land.pathIndices,
        merkleRoot: land.merkleRoot
      };

    case "CHALLENGE_RESPONSE": {
      if (!options.challengeId) throw new Error("challengeId is required for a challenge-response proof.");
      if (!land.merkleRoot || !land.pathElements?.length) throw new Error("Land has no Merkle path yet.");
      const challenge = await api<Challenge>(`/challenges/${options.challengeId}`);
      return {
        ownerSecret: secretField,
        pathElements: land.pathElements,
        pathIndices: land.pathIndices,
        landIdField,
        merkleRoot: land.merkleRoot,
        challenge: challenge.nonce
      };
    }

    case "AREA_RANGE": {
      const minArea = Math.floor(Number(options.minArea));
      if (!Number.isFinite(minArea) || minArea <= 0) throw new Error("minArea must be a positive number.");
      return {
        areaValue: String(land.areaSqm),
        areaSalt: areaSaltField(land.landId, ownerSecret),
        areaCommitment: land.areaCommitment,
        minArea: String(minArea)
      };
    }
  }
}

const PROOF_TYPE_TITLES: Record<ProofType, string> = {
  COMMITMENT_OPENING: "Commitment Opening",
  REGISTRY_MEMBERSHIP: "Registry Membership (anonymous)",
  CHALLENGE_RESPONSE: "Challenge–Response (for a buyer)",
  AREA_RANGE: "Area Range (selective disclosure)"
};

function GenerateProofForm() {
  const searchParams = useSearchParams();
  const [lands, setLands] = useState<Land[]>([]);
  const [status, setStatus] = useState<ProofStatus | null>(null);
  const [proofType, setProofType] = useState<ProofType>("COMMITMENT_OPENING");
  const [result, setResult] = useState<ProofRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api<Land[]>("/lands?scope=mine"), api<ProofStatus>("/proofs/status")])
      .then(([landData, statusData]) => {
        setLands(landData.filter((land) => land.status === "REGISTERED" || land.status === "LISTED_FOR_SALE"));
        setStatus(statusData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load."));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    const form = new FormData(event.currentTarget);
    try {
      const landId = String(form.get("landId") ?? "");
      const ownerSecret = String(form.get("ownerSecret") ?? "");
      const challengeId = form.get("challengeId") ? String(form.get("challengeId")) : undefined;
      const minArea = form.get("minArea") ? Number(form.get("minArea")) : undefined;

      // 1. Prove locally: the secret and witness never leave the browser.
      // Re-fetch the land so the Merkle path/root are current.
      const land = await api<Land>(`/lands/${landId}`);
      const input = await buildCircuitInput(proofType, land, ownerSecret, { challengeId, minArea });
      const { proof, publicSignals } = await proveInBrowser(PROOF_TYPE_CIRCUITS[proofType], input);

      // 2. Submit only {proof, publicSignals}; the server verifies and records.
      const record = await api<ProofRecord>("/proofs/submit", {
        method: "POST",
        body: JSON.stringify({
          landId,
          proofType,
          proof: proof as Groth16Proof,
          publicSignals,
          challengeId
        })
      });
      setResult(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proof generation failed.");
    } finally {
      setBusy(false);
    }
  }

  const preselected = searchParams.get("landId") ?? undefined;

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">Generate Zero-Knowledge Proof</h1>
        <p className="mt-1 text-sm text-[#65766b]">
          Only the land owner can generate a proof: it requires the owner secret that matches the on-registry
          Poseidon commitment. Proving runs entirely IN YOUR BROWSER (snarkjs wasm) — the secret never leaves
          your device; the server only receives the finished proof.
        </p>
      </div>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        {PROOF_TYPE_ORDER.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setProofType(type)}
            className={`rounded-lg border p-4 text-left transition ${
              proofType === type ? "border-[#244b36] bg-[#e9efe9]" : "border-[#d8dfda] bg-white hover:bg-[#f0f4f0]"
            }`}
          >
            <p className="font-bold text-[#17201b]">{PROOF_TYPE_TITLES[type]}</p>
            <p className="mt-1 text-xs leading-5 text-[#34433b]">{status?.proofTypes?.[type] ?? ""}</p>
          </button>
        ))}
      </div>

      <Card>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <label className="grid gap-1 text-sm font-medium text-[#34433b]">
            Land
            <select
              className="h-10 rounded-md border border-[#c6d0c9] bg-white px-3 text-sm outline-none focus:border-[#244b36]"
              name="landId"
              defaultValue={preselected}
              required
            >
              <option value="">Select your land…</option>
              {lands.map((land) => (
                <option key={land.landId} value={land.landId}>
                  {land.landId} — {land.location}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Owner Secret (the 0x… value you saved at registration)"
            name="ownerSecret"
            placeholder="0x…"
            type="password"
            required
          />
          {proofType === "CHALLENGE_RESPONSE" ? (
            <Input label="Challenge ID (from the buyer's challenge)" name="challengeId" required />
          ) : null}
          {proofType === "AREA_RANGE" ? (
            <Input label="Minimum area to prove (m²)" name="minArea" type="number" min={1} required />
          ) : null}
          <Button disabled={busy} type="submit">{busy ? "Proving… (Groth16)" : "Generate Proof"}</Button>
        </form>
      </Card>

      {result ? (
        <Card>
          <h2 className="mb-3 text-lg font-bold">Proof outputs</h2>
          <ProofOutputTabs proof={result} />
        </Card>
      ) : null}
    </main>
  );
}

export default function GenerateProofPage() {
  return (
    <ProtectedRoute>
      <Navbar />
      <Suspense fallback={<main className="mx-auto max-w-3xl px-4 py-6">Loading…</main>}>
        <GenerateProofForm />
      </Suspense>
    </ProtectedRoute>
  );
}
