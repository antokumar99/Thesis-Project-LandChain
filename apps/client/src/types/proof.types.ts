export type ProofType = "COMMITMENT_OPENING" | "REGISTRY_MEMBERSHIP" | "CHALLENGE_RESPONSE" | "AREA_RANGE";

export type Groth16Proof = {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol?: string;
  curve?: string;
};

export type ProofRecord = {
  _id: string;
  proofType: ProofType;
  circuit: string;
  landId?: string;
  ownerId: string;
  ownerWallet: string;
  challengeId?: string;
  proof: Groth16Proof;
  publicSignals: string[];
  publicSignalLabels?: string[];
  merkleRoot?: string;
  verified: boolean;
  verifiedAt?: string;
  verificationNote?: string;
  transactionHash?: string;
  createdAt: string;
};

export type CircuitStatus = {
  circuit: string;
  ready: boolean;
  wasm: boolean;
  zkey: boolean;
  vkey: boolean;
  publicSignalLabels: string[];
};

export type ProofStatus = {
  circuits: CircuitStatus[];
  proofTypes: Record<ProofType, string>;
};
