export const PROOF_TYPES = {
  COMMITMENT_OPENING: "COMMITMENT_OPENING",
  REGISTRY_MEMBERSHIP: "REGISTRY_MEMBERSHIP",
  CHALLENGE_RESPONSE: "CHALLENGE_RESPONSE",
  AREA_RANGE: "AREA_RANGE"
} as const;

export type ProofType = (typeof PROOF_TYPES)[keyof typeof PROOF_TYPES];

export const PROOF_TYPE_CIRCUITS: Record<ProofType, string> = {
  COMMITMENT_OPENING: "commitmentProof",
  REGISTRY_MEMBERSHIP: "landOwnership",
  CHALLENGE_RESPONSE: "challengeProof",
  AREA_RANGE: "areaRange"
};

/** snarkjs publicSignals order per proof type (outputs first, then public inputs). */
export const PUBLIC_SIGNAL_LABELS: Record<ProofType, string[]> = {
  COMMITMENT_OPENING: ["landIdField", "commitment"],
  REGISTRY_MEMBERSHIP: ["nullifier", "merkleRoot"],
  CHALLENGE_RESPONSE: ["responseNullifier", "landIdField", "merkleRoot", "challenge"],
  AREA_RANGE: ["areaCommitment", "minArea"]
};

export const PROOF_TYPE_DESCRIPTIONS: Record<ProofType, string> = {
  COMMITMENT_OPENING:
    "Proves knowledge of the owner secret behind a specific land commitment without revealing the secret.",
  REGISTRY_MEMBERSHIP:
    "Proves ownership of some land in the official registry Merkle tree without revealing which land.",
  CHALLENGE_RESPONSE:
    "Proves current ownership of a specific land in answer to a buyer's one-time challenge nonce. Replay-proof.",
  AREA_RANGE: "Proves the committed land area is at least a threshold without revealing the exact area."
};
