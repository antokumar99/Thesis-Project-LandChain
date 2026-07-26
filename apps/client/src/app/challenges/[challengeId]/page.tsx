"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Navbar } from "../../../components/common/Navbar";
import { ProtectedRoute } from "../../../components/common/ProtectedRoute";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { ProofOutputTabs } from "../../../components/proof/ProofOutputTabs";
import { api } from "../../../lib/api";
import { landIdToField, proveInBrowser, secretToField, verifyInBrowser } from "../../../lib/zk";
import { useAuth } from "../../../hooks/useAuth";
import type { Challenge, ChallengeParty } from "../../../types/challenge.types";
import type { Land } from "../../../types/land.types";
import type { ProofRecord } from "../../../types/proof.types";

function partyId(value: Challenge["buyerId"]): string {
  return typeof value === "object" && value?._id ? value._id : String(value);
}

function partyName(value: Challenge["buyerId"]): string {
  return typeof value === "object" && value ? ((value as ChallengeParty).name ?? "user") : "user";
}

export default function ChallengePage() {
  const params = useParams<{ challengeId: string }>();
  const { user } = useAuth();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [localVerdict, setLocalVerdict] = useState("");

  const refresh = useCallback(async () => {
    try {
      setChallenge(await api<Challenge>(`/challenges/${params.challengeId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load challenge.");
    }
  }, [params.challengeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!challenge) {
    return (
      <ProtectedRoute>
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 py-6">
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : <p>Loading…</p>}
        </main>
      </ProtectedRoute>
    );
  }

  const isSeller = user?.id === partyId(challenge.sellerId) || user?._id === partyId(challenge.sellerId);
  const isBuyer = user?.id === partyId(challenge.buyerId) || user?._id === partyId(challenge.buyerId);
  const proof = typeof challenge.proofId === "object" ? (challenge.proofId as ProofRecord) : null;

  async function call(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(`/challenges/${challenge!._id}${path}`, { method: "POST", body: body ? JSON.stringify(body) : "{}" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = String(form.get("body") ?? "").trim();
    if (!body) return;
    event.currentTarget.reset();
    await call("/messages", { body });
  }

  async function respond(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ownerSecret = String(form.get("ownerSecret") ?? "");
    setBusy(true);
    setError("");
    try {
      // Prove IN THE BROWSER: the secret never leaves this device. Only the
      // finished nonce-bound Groth16 proof is sent to the buyer via the API.
      const land = await api<Land>(`/lands/${challenge!.landId}`);
      if (!land.merkleRoot || !land.pathElements?.length) throw new Error("Land has no Merkle path yet.");
      const { proof, publicSignals } = await proveInBrowser("challengeProof", {
        ownerSecret: secretToField(land.landId, ownerSecret),
        pathElements: land.pathElements,
        pathIndices: land.pathIndices,
        landIdField: landIdToField(land.landId),
        merkleRoot: land.merkleRoot,
        challenge: challenge!.nonce
      });
      await api(`/challenges/${challenge!._id}/respond`, {
        method: "POST",
        body: JSON.stringify({ proof, publicSignals })
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proving failed.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Buyer-side verification: the Groth16 proof is checked LOCALLY against
   * the published verification key (plus nonce/land binding), so the buyer
   * does not have to trust the server's verdict. The server is then asked to
   * record the result.
   */
  async function verifyAsBuyer() {
    setBusy(true);
    setError("");
    setLocalVerdict("");
    try {
      const current = await api<Challenge>(`/challenges/${challenge!._id}`);
      const proofRecord = typeof current.proofId === "object" ? (current.proofId as ProofRecord) : null;
      if (!proofRecord) throw new Error("The seller has not submitted a proof yet.");

      const land = await api<Land>(`/lands/${current.landId}`);
      const signals = proofRecord.publicSignals;
      const checks: string[] = [];
      let ok = await verifyInBrowser("challengeProof", proofRecord.proof, signals);
      checks.push(ok ? "Groth16 proof valid (verified in YOUR browser)." : "Groth16 proof INVALID.");
      if (signals[1] !== landIdToField(current.landId)) { ok = false; checks.push("Proof is for a different land."); }
      if (land.merkleRoot && signals[2] !== land.merkleRoot) { ok = false; checks.push("Merkle root is stale."); }
      if (signals[3] !== current.nonce) { ok = false; checks.push("Challenge nonce mismatch — possible replay."); }
      setLocalVerdict(checks.join(" "));
      if (!ok) throw new Error(`Local verification failed: ${checks.join(" ")}`);

      await api(`/challenges/${challenge!._id}/verify`, { method: "POST", body: "{}" });
      await refresh();
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Ownership Challenge</h1>
            <p className="mt-1 text-sm text-[#65766b]">
              Land{" "}
              <Link className="font-semibold underline" href={`/lands/${challenge.landId}`}>
                {challenge.landId}
              </Link>{" "}
              · buyer {partyName(challenge.buyerId)} ⇄ seller {partyName(challenge.sellerId)}
            </p>
          </div>
          <StatusBadge status={challenge.status} />
        </div>
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

        <Card>
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#65766b]">One-time challenge nonce</h2>
          <p className="mt-1 break-all font-mono text-xs text-[#34433b]">{challenge.nonce}</p>
          <p className="mt-2 text-xs text-[#65766b]">
            The seller must bind this exact nonce into their Groth16 proof. A proof made for any other request will
            not verify — replays are impossible.
          </p>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Conversation</h2>
          <div className="mt-3 grid gap-2">
            {challenge.messages.map((message, index) => (
              <div key={index} className="rounded-md bg-[#f0f4f0] px-3 py-2 text-sm">
                <p className="text-xs font-bold text-[#244b36]">
                  {message.senderName} · {new Date(message.sentAt).toLocaleString()}
                </p>
                <p className="mt-0.5 text-[#17201b]">{message.body}</p>
              </div>
            ))}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={sendMessage}>
            <input
              className="h-10 flex-1 rounded-md border border-[#c6d0c9] bg-white px-3 text-sm outline-none focus:border-[#244b36]"
              name="body"
              placeholder="Write a message…"
            />
            <Button disabled={busy} type="submit">Send</Button>
          </form>
        </Card>

        {isSeller && (challenge.status === "PENDING" || challenge.status === "PROOF_SUBMITTED") ? (
          <Card>
            <h2 className="text-lg font-bold">Respond with a zero-knowledge proof</h2>
            <p className="mt-1 text-sm text-[#65766b]">
              Enter your owner secret. The proof is generated IN YOUR BROWSER — the secret never leaves your
              device, and the buyer learns nothing except that you are the authentic current owner.
            </p>
            <form className="mt-3 grid gap-3" onSubmit={respond}>
              <Input
                label="Owner Secret (the 0x… value you saved at registration)"
                name="ownerSecret"
                placeholder="0x…"
                type="password"
                required
              />
              <div className="flex gap-2">
                <Button disabled={busy} type="submit">
                  {busy ? "Proving…" : challenge.status === "PROOF_SUBMITTED" ? "Regenerate Proof" : "Generate & Send Proof"}
                </Button>
                {challenge.status === "PENDING" ? (
                  <Button disabled={busy} onClick={() => call("/decline")} type="button" variant="secondary">
                    Decline
                  </Button>
                ) : null}
              </div>
            </form>
          </Card>
        ) : null}

        {isBuyer && challenge.status === "PROOF_SUBMITTED" ? (
          <Card>
            <h2 className="text-lg font-bold">Verify the seller's proof</h2>
            <p className="mt-1 text-sm text-[#65766b]">
              Runs Groth16 verification IN YOUR BROWSER (using the published verification key) and checks the
              proof binds to this land, this nonce, and the current registry Merkle root — you do not have to
              trust the server's verdict.
            </p>
            <Button className="mt-3" disabled={busy} onClick={verifyAsBuyer}>
              {busy ? "Verifying…" : "Verify Proof"}
            </Button>
            {localVerdict ? (
              <p className="mt-2 rounded-md bg-[#f0f4f0] px-3 py-2 text-xs text-[#34433b]">{localVerdict}</p>
            ) : null}
          </Card>
        ) : null}

        {challenge.status === "VERIFIED" && isBuyer ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            ✓ Seller ownership verified. You can now{" "}
            <Link className="underline" href={`/lands/${challenge.landId}`}>
              buy this land
            </Link>
            .
          </p>
        ) : null}
        {challenge.verificationNote ? (
          <p className="rounded-md bg-[#f0f4f0] px-3 py-2 text-xs text-[#34433b]">{challenge.verificationNote}</p>
        ) : null}

        {proof ? (
          <Card>
            <h2 className="mb-3 text-lg font-bold">Proof outputs</h2>
            <ProofOutputTabs proof={proof} />
          </Card>
        ) : null}
      </main>
    </ProtectedRoute>
  );
}
