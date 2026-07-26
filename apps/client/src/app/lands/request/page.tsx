"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Navbar } from "../../../components/common/Navbar";
import { ProtectedRoute } from "../../../components/common/ProtectedRoute";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { OwnerSecretField } from "../../../components/common/OwnerSecretField";
import { api } from "../../../lib/api";
import { computeCommitments, isValidOwnerSecret } from "../../../lib/zk";
import type { Land } from "../../../types/land.types";

export default function RequestLandPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ownerSecret, setOwnerSecret] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      // The secret never leaves the browser: only the derived Poseidon
      // commitments are sent to the server.
      const landId = String(form.get("landId") ?? "");
      const areaSqm = Number(form.get("areaSqm") ?? 0);
      if (!isValidOwnerSecret(ownerSecret)) throw new Error("Owner secret is missing or malformed.");
      const { landCommitment, areaCommitment } = computeCommitments(landId, ownerSecret, areaSqm);
      form.delete("secretSaved");
      form.set("landCommitment", landCommitment);
      form.set("areaCommitment", areaCommitment);

      await api<Land>("/lands/request", { method: "POST", body: form });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedRoute>
      <Navbar />
      <main className="mx-auto grid max-w-xl gap-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Request Land Registration</h1>
          <p className="mt-1 text-sm text-[#65766b]">
            Your request goes to the fixed land authority for approval. The authority sees your identity details;
            your owner secret NEVER leaves this browser — only a Poseidon commitment derived from it is sent.
          </p>
        </div>
        <Card>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <Input label="Land ID (e.g. LAND-2026-001)" name="landId" required />
            <Input label="Plot Number" name="plotNumber" required />
            <Input label="Location" name="location" required />
            <Input label="Area (square meters)" name="areaSqm" type="number" min={1} required />
            <OwnerSecretField onChange={setOwnerSecret} value={ownerSecret} />
            <label className="grid gap-1 text-sm font-medium text-[#34433b]">
              Deed Document (optional)
              <input
                className="rounded-md border border-[#c6d0c9] bg-white px-3 py-2 text-sm"
                name="deed"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
              />
            </label>
            <Input label="Note to Authority (optional)" name="requestNote" />
            {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
            <Button disabled={loading} type="submit">{loading ? "Submitting..." : "Submit Request"}</Button>
          </form>
        </Card>
      </main>
    </ProtectedRoute>
  );
}
