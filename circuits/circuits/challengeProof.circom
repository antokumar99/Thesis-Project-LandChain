pragma circom 2.1.6;

include "components/poseidonHasher.circom";
include "components/merkleTreeChecker.circom";

/*
 * ZK Application #3 — Challenge-response ownership proof (buyer <-> seller).
 *
 * Statement: "I am the current registered owner of land `landIdField`
 * (its commitment sits in the registry tree with root `merkleRoot`) and I am
 * answering YOUR challenge nonce" — without revealing ownerSecret.
 *
 * Binding the buyer's one-time challenge nonce into the proof makes it
 * non-replayable: a proof produced for one buyer/request cannot be shown to
 * another. Only someone knowing ownerSecret (the owner) can produce it.
 *
 * Private inputs: ownerSecret, pathElements[], pathIndices[]
 * Public inputs:  landIdField, merkleRoot, challenge
 * Public outputs: responseNullifier = Poseidon(Poseidon(ownerSecret, landIdField), challenge)
 */
template ChallengeProof(levels) {
  signal input ownerSecret;
  signal input pathElements[levels];
  signal input pathIndices[levels];
  signal input landIdField;
  signal input merkleRoot;
  signal input challenge;
  signal output responseNullifier;

  component commitmentHasher = Poseidon2();
  commitmentHasher.left <== landIdField;
  commitmentHasher.right <== ownerSecret;

  component checker = MerkleTreeChecker(levels);
  checker.leaf <== commitmentHasher.out;
  for (var i = 0; i < levels; i++) {
    checker.pathElements[i] <== pathElements[i];
    checker.pathIndices[i] <== pathIndices[i];
  }
  merkleRoot === checker.root;

  component baseHasher = Poseidon2();
  baseHasher.left <== ownerSecret;
  baseHasher.right <== landIdField;

  component responseHasher = Poseidon2();
  responseHasher.left <== baseHasher.out;
  responseHasher.right <== challenge;
  responseNullifier <== responseHasher.out;
}

component main { public [landIdField, merkleRoot, challenge] } = ChallengeProof(10);
