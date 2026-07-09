pragma circom 2.1.6;

include "components/poseidonHasher.circom";
include "components/merkleTreeChecker.circom";

/*
 * ZK Application #2 — Anonymous registry-membership proof.
 *
 * Statement: "I own SOME land recorded in the official registry Merkle tree
 * with root `merkleRoot`" — without revealing which land or the secret.
 *
 * Private inputs: landIdField, ownerSecret, pathElements[], pathIndices[]
 * Public inputs:  merkleRoot
 * Public outputs: nullifier = Poseidon(ownerSecret, landIdField)
 *                 (stable per land+owner, lets verifiers detect proof reuse
 *                 without learning identity)
 */
template LandOwnership(levels) {
  signal input landIdField;
  signal input ownerSecret;
  signal input pathElements[levels];
  signal input pathIndices[levels];
  signal input merkleRoot;
  signal output nullifier;

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

  component nullifierHasher = Poseidon2();
  nullifierHasher.left <== ownerSecret;
  nullifierHasher.right <== landIdField;
  nullifier <== nullifierHasher.out;
}

component main { public [merkleRoot] } = LandOwnership(10);
