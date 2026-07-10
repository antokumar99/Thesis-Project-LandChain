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
    /// Field encoding of the land id used inside the ZK circuits, so a proof
    /// can be bound to THIS land record on-chain.
    uint256 landIdField;
  }

  IVerifier public verifier;
  MerkleRootStore.Store private roots;
  mapping(bytes32 => LandRecord) public lands;
  /// Response nullifiers already consumed by a transfer (replay protection).
  mapping(uint256 => bool) public usedNullifiers;

  /// Order of the challenge-response circuit's public signals:
  /// [responseNullifier, landIdField, merkleRoot, challenge].
  uint256 public constant NULLIFIER_SIGNAL_INDEX = 0;
  uint256 public constant LAND_ID_SIGNAL_INDEX = 1;
  uint256 public constant ROOT_SIGNAL_INDEX = 2;
  uint256 public constant CHALLENGE_SIGNAL_INDEX = 3;
  uint256 public constant PUBLIC_SIGNAL_COUNT = 4;

  /// BN254 scalar field prime used by the circom circuits.
  uint256 public constant SNARK_SCALAR_FIELD =
    21888242871839275222246405745257275088548364400416034343698204186575808495617;

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

  function registerLand(
    bytes32 landHash,
    address landOwner,
    string calldata deedCid,
    bytes32 root,
    uint256 landIdField
  ) external onlyOwner {
    require(landHash != bytes32(0), "LAND_HASH_ZERO");
    require(landOwner != address(0), "OWNER_ZERO");
    require(!lands[landHash].exists, "LAND_EXISTS");
    require(landIdField != 0 && landIdField < SNARK_SCALAR_FIELD, "LAND_ID_FIELD_INVALID");

    roots.set(root);
    lands[landHash] = LandRecord({
      owner: landOwner,
      deedCid: deedCid,
      merkleRoot: root,
      status: LandStatus.REGISTERED,
      exists: true,
      landIdField: landIdField
    });

    emit MerkleRootUpdated(root, msg.sender, block.timestamp);
    emit LandRegistered(landHash, landOwner, deedCid, root);
  }

  /// @param challengeSalt One-time salt chosen when the buyer issued the
  ///        challenge. The circuit's `challenge` public signal must equal
  ///        keccak256(buyer, challengeSalt) reduced into the scalar field,
  ///        which binds the seller's proof to THIS buyer and prevents a proof
  ///        made for one buyer from being replayed for another.
  function verifyAndTransfer(
    bytes32 landHash,
    address buyer,
    bytes32 challengeSalt,
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
    require(land.status != LandStatus.DISPUTED, "LAND_DISPUTED");
    require(publicSignals.length == PUBLIC_SIGNAL_COUNT, "PUBLIC_SIGNALS_LENGTH");
    // Proof must be about THIS land, not merely some land in the tree.
    require(publicSignals[LAND_ID_SIGNAL_INDEX] == land.landIdField, "LAND_ID_MISMATCH");
    require(bytes32(publicSignals[ROOT_SIGNAL_INDEX]) == roots.latestRoot, "ROOT_NOT_CURRENT");
    // Proof must answer a challenge derived from THIS buyer.
    uint256 expectedChallenge = uint256(keccak256(abi.encodePacked(buyer, challengeSalt))) % SNARK_SCALAR_FIELD;
    require(publicSignals[CHALLENGE_SIGNAL_INDEX] == expectedChallenge, "CHALLENGE_NOT_BOUND");
    // Each proof is single-use.
    uint256 nullifier = publicSignals[NULLIFIER_SIGNAL_INDEX];
    require(!usedNullifiers[nullifier], "PROOF_ALREADY_USED");
    require(verifier.verifyProof(a, b, c, publicSignals), "INVALID_PROOF");

    usedNullifiers[nullifier] = true;
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
