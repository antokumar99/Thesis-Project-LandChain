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

  /// @dev Deliberately IDENTITY-FREE: the registry stores no owner address.
  /// Ownership lives exclusively as a Poseidon commitment inside the
  /// off-chain Merkle tree whose root this contract anchors, so the chain
  /// never publishes a queryable plot -> owner map. Authorization to move a
  /// parcel comes from the Groth16 ownership proof, not from an address.
  struct LandRecord {
    string deedCid;
    LandStatus status;
    bool exists;
    /// Field encoding of the land id used inside the ZK circuits, so a proof
    /// can be bound to THIS land record on-chain.
    uint256 landIdField;
  }

  /// Groth16 proof that the registry tree changed in exactly one leaf:
  /// signals = [leafBefore, leafAfter, oldRoot, newRoot].
  struct TransitionProof {
    uint256[2] a;
    uint256[2][2] b;
    uint256[2] c;
    uint256[4] signals;
  }

  /// Verifier for the challenge-response ownership circuit.
  IVerifier public verifier;
  /// Verifier for the registry root-transition circuit.
  IVerifier public rootVerifier;
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

  /// Order of the root-transition circuit's public signals.
  uint256 public constant T_LEAF_BEFORE_INDEX = 0;
  uint256 public constant T_LEAF_AFTER_INDEX = 1;
  uint256 public constant T_OLD_ROOT_INDEX = 2;
  uint256 public constant T_NEW_ROOT_INDEX = 3;

  /// BN254 scalar field prime used by the circom circuits.
  uint256 public constant SNARK_SCALAR_FIELD =
    21888242871839275222246405745257275088548364400416034343698204186575808495617;

  /// Poseidon root of the depth-20 all-zero-leaves tree (capacity 2^20 =
  /// 1,048,576 parcels): the registry starts from a provably empty tree, so
  /// the very first anchored root must be a verified single-leaf insertion
  /// into THIS root.
  bytes32 public constant EMPTY_TREE_ROOT =
    0x2134e76ac5d21aab186c2be1dd8f84ee880a1e46eaf712f9d371b6df22191f3e;

  event VerifierUpdated(address indexed verifier);
  event RootVerifierUpdated(address indexed verifier);
  event MerkleRootUpdated(bytes32 indexed root, address indexed updatedBy, uint256 timestamp);
  event MerkleRootBootstrapped(bytes32 indexed root, address indexed updatedBy);
  /// Events carry no owner identity: a parcel's existence and the fact that
  /// it changed hands are public, but who holds it is not recorded on chain.
  event LandRegistered(bytes32 indexed landHash, string deedCid);
  event LandTransferred(bytes32 indexed landHash, uint256 indexed nullifier);
  event LandDisputed(bytes32 indexed landHash, address indexed markedBy);

  constructor(address initialOwner, address verifierAddress, address rootVerifierAddress) Ownable(initialOwner) {
    require(verifierAddress != address(0), "VERIFIER_ZERO");
    require(rootVerifierAddress != address(0), "ROOT_VERIFIER_ZERO");
    verifier = IVerifier(verifierAddress);
    rootVerifier = IVerifier(rootVerifierAddress);
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

  function setRootVerifier(address verifierAddress) external onlyOwner {
    require(verifierAddress != address(0), "ROOT_VERIFIER_ZERO");
    rootVerifier = IVerifier(verifierAddress);
    emit RootVerifierUpdated(verifierAddress);
  }

  /// @notice One-time escape hatch for migrating a registry that already has
  /// anchored state (e.g. redeploying the contract): may only be called while
  /// NO root has ever been anchored. Every subsequent root must chain from it
  /// via a verified transition proof.
  function bootstrapRoot(bytes32 root) external onlyOwner {
    require(roots.latestRoot == bytes32(0), "ALREADY_BOOTSTRAPPED");
    roots.set(root);
    emit MerkleRootBootstrapped(root, msg.sender);
    emit MerkleRootUpdated(root, msg.sender, block.timestamp);
  }

  /// @notice Anchors a new registry root. The caller must supply a Groth16
  /// proof that `newRoot` differs from the currently anchored root in exactly
  /// one leaf, so the contract never trusts an off-chain root computation.
  function updateMerkleRoot(bytes32 newRoot, TransitionProof calldata transition) external onlyOwner {
    _anchorRoot(newRoot, transition);
    emit MerkleRootUpdated(newRoot, msg.sender, block.timestamp);
  }

  function _anchorRoot(bytes32 newRoot, TransitionProof calldata transition) internal {
    bytes32 current = roots.latestRoot == bytes32(0) ? EMPTY_TREE_ROOT : roots.latestRoot;
    require(bytes32(transition.signals[T_OLD_ROOT_INDEX]) == current, "OLD_ROOT_NOT_CURRENT");
    require(bytes32(transition.signals[T_NEW_ROOT_INDEX]) == newRoot, "NEW_ROOT_MISMATCH");

    uint256[] memory signals = new uint256[](4);
    for (uint256 i = 0; i < 4; i++) {
      signals[i] = transition.signals[i];
    }
    require(rootVerifier.verifyProof(transition.a, transition.b, transition.c, signals), "INVALID_TRANSITION_PROOF");

    roots.set(newRoot);
  }

  /// @notice Records a land parcel. Root anchoring happens separately via
  /// {updateMerkleRoot}, which requires a verified transition proof for the
  /// leaf insertion.
  function registerLand(
    bytes32 landHash,
    string calldata deedCid,
    uint256 landIdField
  ) external onlyOwner {
    require(landHash != bytes32(0), "LAND_HASH_ZERO");
    require(!lands[landHash].exists, "LAND_EXISTS");
    require(landIdField != 0 && landIdField < SNARK_SCALAR_FIELD, "LAND_ID_FIELD_INVALID");

    lands[landHash] = LandRecord({
      deedCid: deedCid,
      status: LandStatus.REGISTERED,
      exists: true,
      landIdField: landIdField
    });

    emit LandRegistered(landHash, deedCid);
  }

  /// @notice Consumes a seller's ownership proof to authorize a transfer. No
  ///         owner identity is written: the parcel's new owner exists only as
  ///         a fresh commitment in the off-chain tree, anchored separately by
  ///         verified root transitions.
  /// @param buyer Address the challenge was bound to. It is NOT stored — it
  ///        is needed only so the contract can re-derive the challenge and
  ///        confirm the seller's proof was produced for this counterparty.
  ///        Supplying a different address makes the derived challenge differ
  ///        from the proof's committed signal, so redirection fails.
  /// @param challengeSalt One-time salt chosen when the buyer issued the
  ///        challenge. The circuit's `challenge` public signal must equal
  ///        keccak256(buyer, challengeSalt) reduced into the scalar field.
  function verifyAndTransfer(
    bytes32 landHash,
    address buyer,
    bytes32 challengeSalt,
    uint256[2] calldata a,
    uint256[2][2] calldata b,
    uint256[2] calldata c,
    uint256[] calldata publicSignals
  ) external onlyOwner {
    LandRecord storage land = lands[landHash];
    require(land.exists, "LAND_NOT_FOUND");
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
    land.status = LandStatus.TRANSFERRED;

    emit LandTransferred(landHash, nullifier);
  }

  function markDisputed(bytes32 landHash) external onlyOwner {
    require(lands[landHash].exists, "LAND_NOT_FOUND");
    lands[landHash].status = LandStatus.DISPUTED;
    emit LandDisputed(landHash, msg.sender);
  }
}
