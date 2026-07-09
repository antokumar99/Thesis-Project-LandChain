// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IVerifier} from "./interfaces/IVerifier.sol";
import {MerkleRootStore} from "./libraries/MerkleRootStore.sol";

contract LandRegistry is Ownable {
  using MerkleRootStore for MerkleRootStore.Store;

  enum LandStatus {
    REGISTERED,
    TRANSFERRED,
    DISPUTED
  }

  struct LandRecord {
    address owner;
    string deedCid;
    bytes32 merkleRoot;
    LandStatus status;
    bool exists;
  }

  IVerifier public verifier;
  MerkleRootStore.Store private roots;
  mapping(bytes32 => LandRecord) public lands;

  /// Position of the Merkle root inside the challenge-response circuit's
  /// public signals: [responseNullifier, landIdField, merkleRoot, challenge].
  uint256 public constant ROOT_SIGNAL_INDEX = 2;

  event VerifierUpdated(address indexed verifier);
  event MerkleRootUpdated(bytes32 indexed root, address indexed updatedBy, uint256 timestamp);
  event LandRegistered(bytes32 indexed landHash, address indexed owner, string deedCid, bytes32 merkleRoot);
  event LandTransferred(bytes32 indexed landHash, address indexed fromOwner, address indexed toOwner);
  event LandDisputed(bytes32 indexed landHash, address indexed markedBy);

  constructor(address initialOwner, address verifierAddress) Ownable(initialOwner) {
    require(verifierAddress != address(0), "VERIFIER_ZERO");
    verifier = IVerifier(verifierAddress);
  }

  function latestMerkleRoot() external view returns (bytes32) {
    return roots.latestRoot;
  }

  function isKnownRoot(bytes32 root) external view returns (bool) {
    return roots.isKnown(root);
  }

  function setVerifier(address verifierAddress) external onlyOwner {
    require(verifierAddress != address(0), "VERIFIER_ZERO");
    verifier = IVerifier(verifierAddress);
    emit VerifierUpdated(verifierAddress);
  }

  function updateMerkleRoot(bytes32 newRoot) public onlyOwner {
    roots.set(newRoot);
    emit MerkleRootUpdated(newRoot, msg.sender, block.timestamp);
  }

  function registerLand(bytes32 landHash, address landOwner, string calldata deedCid, bytes32 root) external onlyOwner {
    require(landHash != bytes32(0), "LAND_HASH_ZERO");
    require(landOwner != address(0), "OWNER_ZERO");
    require(!lands[landHash].exists, "LAND_EXISTS");

    roots.set(root);
    lands[landHash] = LandRecord({
      owner: landOwner,
      deedCid: deedCid,
      merkleRoot: root,
      status: LandStatus.REGISTERED,
      exists: true
    });

    emit MerkleRootUpdated(root, msg.sender, block.timestamp);
    emit LandRegistered(landHash, landOwner, deedCid, root);
  }

  function verifyAndTransfer(
    bytes32 landHash,
    address buyer,
    uint256[2] calldata a,
    uint256[2][2] calldata b,
    uint256[2] calldata c,
    uint256[] calldata publicSignals
  ) external {
    LandRecord storage land = lands[landHash];
    require(land.exists, "LAND_NOT_FOUND");
    // The land owner may submit directly, or the registry owner (authority)
    // may relay the transfer. Either way the seller's Groth16 proof — which
    // only the holder of the owner secret can produce — gates the transfer.
    require(land.owner == msg.sender || msg.sender == owner(), "NOT_AUTHORIZED");
    require(buyer != address(0), "BUYER_ZERO");
    require(publicSignals.length > ROOT_SIGNAL_INDEX, "PUBLIC_SIGNALS_EMPTY");
    require(bytes32(publicSignals[ROOT_SIGNAL_INDEX]) == roots.latestRoot, "ROOT_NOT_CURRENT");
    require(verifier.verifyProof(a, b, c, publicSignals), "INVALID_PROOF");

    address previousOwner = land.owner;
    land.owner = buyer;
    land.status = LandStatus.TRANSFERRED;

    emit LandTransferred(landHash, previousOwner, buyer);
  }

  function markDisputed(bytes32 landHash) external onlyOwner {
    require(lands[landHash].exists, "LAND_NOT_FOUND");
    lands[landHash].status = LandStatus.DISPUTED;
    emit LandDisputed(landHash, msg.sender);
  }
}
