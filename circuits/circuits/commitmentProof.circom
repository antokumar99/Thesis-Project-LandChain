pragma circom 2.1.6;

include "components/poseidonHasher.circom";

/*
 * ZK Application #1 — Commitment-opening proof.
 *
 * Statement: "I know the ownerSecret behind the on-registry commitment of
 * land `landIdField`" — without revealing ownerSecret.
 *
 * Private inputs: ownerSecret
 * Public inputs:  landIdField, commitment
 */
template CommitmentProof() {
  signal input ownerSecret;
  signal input landIdField;
  signal input commitment;

  component hasher = Poseidon2();
  hasher.left <== landIdField;
  hasher.right <== ownerSecret;
  commitment === hasher.out;
}

component main { public [landIdField, commitment] } = CommitmentProof();
