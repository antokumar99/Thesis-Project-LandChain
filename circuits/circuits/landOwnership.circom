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
 * Public outputs: nullifier = Poseidon(Poseidon(ownerSecret, landIdField), DOMAIN)
 *                 (stable per land+owner, lets verifiers detect proof reuse
 *                 without learning identity)
 *
 * DOMAIN separation: challengeProof publishes
 *   responseNullifier = Poseidon(Poseidon(ownerSecret, landIdField), challenge)
 * with landIdField public. If this circuit emitted the inner hash directly,
 * anyone could test Poseidon(nullifier, challenge) == responseNullifier and
 * retroactively deanonymise a membership proof. Hashing once more with a
 * fixed domain tag (keccak256("landchain:membership-nullifier") mod p) keeps
 * the two nullifier spaces unlinkable.
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

  // keccak256("landchain:membership-nullifier") mod p — fixed domain tag.
  var MEMBERSHIP_DOMAIN = 7160624230185569488450522106054910242159549549043173897393582740424566747561;

  component innerHasher = Poseidon2();
  innerHasher.left <== ownerSecret;
  innerHasher.right <== landIdField;

  component nullifierHasher = Poseidon2();
  nullifierHasher.left <== innerHasher.out;
  nullifierHasher.right <== MEMBERSHIP_DOMAIN;
  nullifier <== nullifierHasher.out;
}

component main { public [merkleRoot] } = LandOwnership(10);
