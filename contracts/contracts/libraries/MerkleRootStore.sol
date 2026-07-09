// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library MerkleRootStore {
  struct Store {
    bytes32 latestRoot;
    mapping(bytes32 => bool) knownRoots;
  }

  function set(Store storage store, bytes32 root) internal {
    require(root != bytes32(0), "ROOT_ZERO");
    store.latestRoot = root;
    store.knownRoots[root] = true;
  }

  function isKnown(Store storage store, bytes32 root) internal view returns (bool) {
    return store.knownRoots[root];
  }
}
