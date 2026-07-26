"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Navbar } from "../../../components/common/Navbar";
import { ProtectedRoute } from "../../../components/common/ProtectedRoute";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { OwnerSecretField } from "../../../components/common/OwnerSecretField";
import { api, EMPTY_DEED_CID, openDeed } from "../../../lib/api";
import { computeCommitments, isValidOwnerSecret } from "../../../lib/zk";
import { useAuth } from "../../../hooks/useAuth";
import type { Land } from "../../../types/land.types";
import type { Challenge } from "../../../types/challenge.types";

export default function LandDetailPage() {
  const params = useParams<{ landId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [land, setLand] = useState<Land | null>(null);
  const [challenges, setChallenges] = useState<{ asBuyer: Challenge[]; asSeller: Challenge[] }>({ asBuyer: [], asSeller: [] });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [newOwnerSecret, setNewOwnerSecret] = useState("");

  const landId = params.landId;

  const refresh = useCallback(async () => {
    try {
      const [landData, challengeData] = await Promise.all([
        api<Land>(`/lands/${landId}`),
        api<{ asBuyer: Challenge[]; asSeller: Challenge[] }>("/challenges")
      ]);
      setLand(landData);
      setChallenges(challengeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load land.");
    }
  }, [landId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!land) {
    return (
      <ProtectedRoute>
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 py-6">
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : <p>Loading…</p>}
        </main>
      </ProtectedRoute>
    );
  }

  const ownerName = typeof land.ownerId === "object" ? land.ownerId.name : undefined;
  const isOwner = land.ownerWallet.toLowerCase() === user?.walletAddress?.toLowerCase();
  const myVerifiedChallenge = challenges.asBuyer.find(
    (challenge) => challenge.landId === land.landId && challenge.status === "VERIFIED"
  );
  const myOpenChallenge = challenges.asBuyer.find(
    (challenge) => challenge.landId === land.landId && ["PENDING", "PROOF_SUBMITTED"].includes(challenge.status)
  );

  async function askAuthenticity() {
    setBusy(true);
    setError("");
    try {
      const challenge = await api<Challenge>("/challenges", {
        method: "POST",
        body: JSON.stringify({
          landId: land!.landId,
          message: "Are you the authentic owner of this land? Please prove it with a zero-knowledge proof."
        })
      });
      router.push(`/challenges/${challenge._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create challenge.");
      setBusy(false);
    }
  }

  async function buy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      // The new secret never leaves the browser: only the derived Poseidon
      // commitments are submitted with the purchase.
      if (!isValidOwnerSecret(newOwnerSecret)) throw new Error("Your new owner secret is missing or malformed.");
      const { landCommitment, areaCommitment } = computeCommitments(land!.landId, newOwnerSecret, land!.areaSqm);
      await api("/transfers/buy", {
        method: "POST",
        body: JSON.stringify({
          landId: land!.landId,
          newLandCommitment: landCommitment,
          newAreaCommitment: areaCommitment
        })
      });
      setInfo("Purchase complete! The land is now committed to YOUR secret. Keep it safe.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProtectedRoute>
      <Navbar />
      <main className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{land.landId}</h1>
          <StatusBadge status={land.status} />
        </div>
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
        {info ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{info}</p> : null}

        <Card>
          <dl className="grid gap-2 text-sm md:grid-cols-2">
            <div><dt className="font-semibold text-[#65766b]">Plot</dt><dd>{land.plotNumber}</dd></div>
            <div><dt className="font-semibold text-[#65766b]">Location</dt><dd>{land.location}</dd></div>
            <div><dt className="font-semibold text-[#65766b]">Area</dt><dd>{land.areaSqm} m²</dd></div>
            <div><dt className="font-semibold text-[#65766b]">Owner</dt><dd>{ownerName ?? land.ownerWallet}</dd></div>
            <div className="md:col-span-2">
              <dt className="font-semibold text-[#65766b]">Ownership Commitment (Poseidon)</dt>
              <dd className="break-all font-mono text-xs">{land.landCommitment}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="font-semibold text-[#65766b]">Area Commitment</dt>
              <dd className="break-all font-mono text-xs">{land.areaCommitment}</dd>
            </div>
            {land.merkleRoot ? (
              <div className="md:col-span-2">
                <dt className="font-semibold text-[#65766b]">Registry Merkle Root</dt>
                <dd className="break-all font-mono text-xs">{land.merkleRoot}</dd>
              </div>
            ) : null}
            <div><dt className="font-semibold text-[#65766b]">Tree Leaf</dt><dd>{land.leafIndex ?? "not in tree yet"}</dd></div>
            <div>
              <dt className="font-semibold text-[#65766b]">Deed CID</dt>
              <dd className="break-all text-xs">
                {land.ipfsCID}
                {isOwner && land.ipfsCID && land.ipfsCID !== EMPTY_DEED_CID ? (
                  <button
                    className="ml-2 font-semibold text-[#244b36] underline"
                    onClick={() =>
                      openDeed(land.ipfsCID).catch((err) =>
                        setError(err instanceof Error ? err.message : "Deed not available.")
                      )
                    }
                    type="button"
                  >
                    View Deed
                  </button>
                ) : null}
              </dd>
            </div>
            {land.salePrice ? (
              <div><dt className="font-semibold text-[#65766b]">Price</dt><dd className="font-bold text-[#244b36]">{land.salePrice}</dd></div>
            ) : null}
          </dl>
        </Card>

        {!isOwner && land.status === "LISTED_FOR_SALE" ? (
          <Card>
            <h2 className="text-lg font-bold">Buy this land</h2>
            <div className="mt-3 grid gap-3 text-sm">
              {myVerifiedChallenge ? (
                <p className="rounded-md bg-emerald-50 px-3 py-2 font-semibold text-emerald-700">
                  ✓ You verified the seller's zero-knowledge ownership proof. You can buy now.
                </p>
              ) : myOpenChallenge ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 font-semibold text-amber-700">
                  Your authenticity challenge is open —{" "}
                  <Link className="underline" href={`/challenges/${myOpenChallenge._id}`}>
                    continue the conversation
                  </Link>
                  {" "}and verify the seller's proof before buying.
                </p>
              ) : (
                <div className="grid gap-2">
                  <p className="text-[#34433b]">
                    Before buying you must ask the seller to prove authentic ownership with a zero-knowledge proof.
                  </p>
                  <Button disabled={busy} onClick={askAuthenticity}>Ask Owner to Prove Authenticity</Button>
                </div>
              )}
              {myVerifiedChallenge ? (
                <form className="grid gap-3" onSubmit={buy}>
                  <OwnerSecretField
                    label="YOUR new owner secret (256-bit — save it before buying!)"
                    onChange={setNewOwnerSecret}
                    value={newOwnerSecret}
                  />
                  <Button disabled={busy} type="submit">
                    {busy ? "Processing..." : `Buy for ${land.salePrice ?? "listed price"}`}
                  </Button>
                </form>
              ) : null}
            </div>
          </Card>
        ) : null}

        {isOwner ? (
          <Card>
            <h2 className="text-lg font-bold">Owner actions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/proofs/generate?landId=${land.landId}`}>
                <Button>Generate ZK Proof</Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="secondary">Manage in Dashboard</Button>
              </Link>
            </div>
          </Card>
        ) : null}
      </main>
    </ProtectedRoute>
  );
}
