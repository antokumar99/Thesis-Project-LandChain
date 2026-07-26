pragma circom 2.1.6;

include "components/merkleTreeChecker.circom";

/*
 * ZK Application #5 — Registry root-transition proof.
 *
 * Statement: "newRoot is obtained from the tree with root oldRoot by changing
 * exactly ONE leaf from leafBefore to leafAfter (same position, every sibling
 * subtree unchanged)."
 *
 * The on-chain LandRegistry requires this proof for every root update, so the
 * contract no longer trusts the backend's root computation: each anchored
 * root is provably a single-leaf insertion (leafBefore = 0) or removal
 * (leafAfter = 0) applied to the previously anchored root. A malicious or
 * compromised operator cannot swap in an unrelated tree.
 *
 * Private inputs: pathElements[], pathIndices[]
 * Public inputs:  leafBefore, leafAfter, oldRoot, newRoot
 */
template RootTransition(levels) {
  signal input pathElements[levels];
  signal input pathIndices[levels];
  signal input leafBefore;
  signal input leafAfter;
  signal input oldRoot;
  signal input newRoot;

  component before = MerkleTreeChecker(levels);
  before.leaf <== leafBefore;
  component after = MerkleTreeChecker(levels);
  after.leaf <== leafAfter;
  for (var i = 0; i < levels; i++) {
    before.pathElements[i] <== pathElements[i];
    before.pathIndices[i] <== pathIndices[i];
    after.pathElements[i] <== pathElements[i];
    after.pathIndices[i] <== pathIndices[i];
  }
  oldRoot === before.root;
  newRoot === after.root;
}

component main { public [leafBefore, leafAfter, oldRoot, newRoot] } = RootTransition(20);
