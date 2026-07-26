// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IVerifier} from "./interfaces/IVerifier.sol";
import {RootTransitionGroth16Verifier} from "./RootTransitionVerifier.sol";

/// @notice Adapts the snarkjs-generated Groth16 verifier for the registry
/// root-transition circuit (4 public signals: leafBefore, leafAfter,
/// oldRoot, newRoot) to the dynamic-length IVerifier interface used by
/// LandRegistry.
contract RootVerifier is IVerifier {
  RootTransitionGroth16Verifier public immutable groth16Verifier;

  constructor() {
    groth16Verifier = new RootTransitionGroth16Verifier();
  }

  function verifyProof(
    uint256[2] calldata a,
    uint256[2][2] calldata b,
    uint256[2] calldata c,
    uint256[] calldata publicSignals
  ) external view returns (bool) {
    if (publicSignals.length != 4) return false;
    uint256[4] memory signals = [publicSignals[0], publicSignals[1], publicSignals[2], publicSignals[3]];
    return groth16Verifier.verifyProof(a, b, c, signals);
  }
}
