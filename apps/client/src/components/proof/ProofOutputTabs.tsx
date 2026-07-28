"use client";

import { Tabs } from "../ui/Tabs";
import { JsonViewer } from "../ui/JsonViewer";
import { StatusBadge } from "../ui/StatusBadge";
import type { ProofRecord } from "../../types/proof.types";

/**
 * Shows every output of a zero-knowledge proof in tabs:
 * the raw Groth16 proof, the labeled public signals, and the
 * verification result. Nothing secret ever appears here — that is the point.
 */
export function ProofOutputTabs({ proof }: { proof: ProofRecord }) {
  const labeledSignals = proof.publicSignals.map((signal, index) => ({
    index,
    label: proof.publicSignalLabels?.[index] ?? `signal[${index}]`,
    value: signal
  }));

  return (
    <Tabs
      tabs={[
        {
          id: "summary",
          label: "Summary",
          content: (
            <div className="grid gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={proof.verified ? "VERIFIED" : "FAILED"} />
                <span className="font-semibold text-[#17201b]">{proof.proofType.replaceAll("_", " ")}</span>
                <span className="text-[#65766b]">circuit: {proof.circuit}</span>
              </div>
              {proof.landId ? <p className="text-[#34433b]">Land: {proof.landId}</p> : null}
              <p className="text-[#34433b]">Prover wallet: {proof.ownerWallet}</p>
              {proof.verificationNote ? <p className="text-[#65766b]">{proof.verificationNote}</p> : null}
              <p className="text-xs text-[#65766b]">
                Generated {new Date(proof.createdAt).toLocaleString()}
                {proof.verifiedAt ? ` · verified ${new Date(proof.verifiedAt).toLocaleString()}` : ""}
              </p>
            </div>
          )
        },
        {
          id: "proof",
          label: "Proof (Groth16)",
          content: <JsonViewer value={proof.proof} />
        },
        {
          id: "signals",
          label: "Public Signals",
          content: (
            <div className="grid gap-3">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#d8dfda] text-[#65766b]">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Label</th>
                    <th className="py-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {labeledSignals.map((signal) => (
                    <tr key={signal.index} className="border-b border-[#eef2ed] align-top">
                      <td className="py-2 pr-3 text-[#65766b]">{signal.index}</td>
                      <td className="py-2 pr-3 font-semibold text-[#17201b]">{signal.label}</td>
                      <td className="break-all py-2 font-mono text-xs text-[#34433b]">{signal.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <JsonViewer value={proof.publicSignals} maxHeight="12rem" />
            </div>
          )
        },
        {
          id: "verification",
          label: "Verification",
          content: (
            <div className="grid gap-3 text-sm">
              <div className="flex items-center gap-2">
                <StatusBadge status={proof.verified ? "VERIFIED" : "FAILED"} />
                <span className="text-[#34433b]">
                  {proof.verified
                    ? "This Groth16 proof passed cryptographic verification against the circuit's verification key."
                    : "This proof did not pass verification."}
                </span>
              </div>
              {proof.merkleRoot ? (
                <p className="break-all text-xs text-[#65766b]">Registry Merkle root at proof time: {proof.merkleRoot}</p>
              ) : null}
              {proof.verificationNote ? <p className="text-[#34433b]">{proof.verificationNote}</p> : null}
              {proof.transactionHash ? (
                <p className="break-all text-xs text-[#65766b]">Tx: {proof.transactionHash}</p>
              ) : null}
            </div>
          )
        }
      ]}
    />
  );
}
