// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IVerifier} from "./interfaces/IVerifier.sol";
import {Groth16Verifier} from "./ChallengeVerifier.sol";

/// @notice Adapts the snarkjs-generated Groth16 verifier for the
/// challenge-response ownership circuit (4 public signals:
/// responseNullifier, landIdField, merkleRoot, challenge) to the
/// dynamic-length IVerifier interface used by LandRegistry.
contract Verifier is IVerifier {
  Groth16Verifier public immutable groth16Verifier;

  constructor() {
    groth16Verifier = new Groth16Verifier();
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
