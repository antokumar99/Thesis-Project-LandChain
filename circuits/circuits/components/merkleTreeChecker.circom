pragma circom 2.1.6;

include "poseidonHasher.circom";

template MerkleTreeChecker(levels) {
  signal input leaf;
  signal input pathElements[levels];
  signal input pathIndices[levels];
  signal output root;

  signal hashes[levels + 1];
  signal leftA[levels];
  signal leftB[levels];
  signal rightA[levels];
  signal rightB[levels];
  hashes[0] <== leaf;

  component hashers[levels];
  for (var i = 0; i < levels; i++) {
    pathIndices[i] * (pathIndices[i] - 1) === 0;

    hashers[i] = Poseidon2();
    leftA[i] <== hashes[i] * (1 - pathIndices[i]);
    leftB[i] <== pathElements[i] * pathIndices[i];
    rightA[i] <== pathElements[i] * (1 - pathIndices[i]);
    rightB[i] <== hashes[i] * pathIndices[i];
    hashers[i].left <== leftA[i] + leftB[i];
    hashers[i].right <== rightA[i] + rightB[i];
    hashes[i + 1] <== hashers[i].out;
  }

  root <== hashes[levels];
}
