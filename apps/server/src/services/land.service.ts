import { LandModel } from "../models/Land.model";
import { MerkleRootModel } from "../models/MerkleRoot.model";
import { TransactionModel } from "../models/Transaction.model";
import { UserModel } from "../models/User.model";
import { deterministicTxHash } from "../utils/hash.util";
import { areaSaltField, landIdToField, secretToField } from "../utils/field.util";
import { poseidonHash2 } from "./poseidon.service";
import { uploadDeedToIpfs } from "./ipfs.service";
import { nextLeafIndex, rebuildRegistryTree, TREE_CAPACITY } from "./merkle.service";
import { registerLandOnChain } from "./blockchain.service";
import { withRegistryLock } from "../utils/lock.util";
import { badRequest, conflict, forbidden, notFound } from "../utils/errors.util";

/**
 * A user submits a land registration request. The commitment is computed from
 * the owner's secret which is NEVER stored — only the Poseidon commitment is.
 * The land stays PENDING_APPROVAL until the fixed authority approves it.
 */
export async function requestLandRegistration(input: {
  landId: string;
  plotNumber: string;
  location: string;
  areaSqm: number;
  ownerSecret: string;
  requestNote?: string;
  deedFile?: Express.Multer.File;
  userId: string;
  userWallet: string;
}) {
  const existing = await LandModel.findOne({ landId: input.landId });
  if (existing) throw conflict("A land with this ID already exists.");
  if (!Number.isFinite(input.areaSqm) || input.areaSqm <= 0) throw badRequest("areaSqm must be a positive number.");

  const { cid, deedHash } = await uploadDeedToIpfs(input.deedFile);

  const landIdField = landIdToField(input.landId);
  const secretField = secretToField(input.landId, input.ownerSecret);
  const landCommitment = await poseidonHash2(landIdField, secretField);
  const areaSalt = areaSaltField(input.landId, input.ownerSecret);
  const areaCommitment = await poseidonHash2(String(Math.floor(input.areaSqm)), areaSalt);

  const land = await LandModel.create({
    landId: input.landId,
    plotNumber: input.plotNumber,
    location: input.location,
    areaSqm: Math.floor(input.areaSqm),
    ownerId: input.userId,
    ownerWallet: input.userWallet.toLowerCase(),
    deedHash,
    ipfsCID: cid,
    landCommitment,
    areaCommitment,
    status: "PENDING_APPROVAL",
    requestNote: input.requestNote
  });

  await TransactionModel.create({
    landId: input.landId,
    toOwner: input.userWallet.toLowerCase(),
    transactionType: "LAND_REQUESTED",
    blockchainTxHash: deterministicTxHash(`request:${input.landId}:${input.userWallet}`),
    status: "PENDING",
    detail: "Registration request submitted; awaiting authority approval."
  });

  return land;
}

/** Authority view: pending requests including the applicant's identity info. */
export async function listPendingRequests() {
  return LandModel.find({ status: "PENDING_APPROVAL" })
    .sort({ createdAt: 1 })
    .populate("ownerId", "name email walletAddress nidHash phone address");
}

/**
 * Authority approves a request: the land's commitment is inserted into the
 * registry Merkle tree, all paths are refreshed, and the new root is anchored
 * on-chain.
 */
export async function approveLand(input: { landId: string; authorityId: string }) {
  // Serialized: concurrent approvals must not read the same nextLeafIndex.
  return withRegistryLock(async () => {
  const land = await LandModel.findOne({ landId: input.landId });
  if (!land) throw notFound("Land not found.");
  if (land.status !== "PENDING_APPROVAL") throw badRequest("Only pending requests can be approved.");

  const leafIndex = await nextLeafIndex();
  if (leafIndex >= TREE_CAPACITY) throw badRequest("Registry tree is full.");

  land.leafIndex = leafIndex;
  land.status = "REGISTERED";
  land.approvedBy = input.authorityId as never;
  land.approvedAt = new Date();
  await land.save();

  const snapshot = await rebuildRegistryTree();
  const blockchainTxHash = await registerLandOnChain(
    land.landId,
    land.ownerWallet,
    land.ipfsCID,
    snapshot.root,
    landIdToField(land.landId)
  );

  await MerkleRootModel.create({
    root: snapshot.root,
    leafCount: snapshot.leafCount,
    landIds: (await LandModel.find({ leafIndex: { $ne: null } }).select("landId")).map((item) => item.landId),
    transactionHash: blockchainTxHash,
    createdBy: input.authorityId
  });

  await TransactionModel.create({
    landId: land.landId,
    toOwner: land.ownerWallet,
    transactionType: "LAND_APPROVED",
    blockchainTxHash,
    status: "CONFIRMED",
    detail: `Approved; commitment added to registry tree at leaf ${leafIndex}.`
  });

  return LandModel.findOne({ landId: input.landId });
  });
}

export async function rejectLand(input: { landId: string; authorityId: string; reason?: string }) {
  const land = await LandModel.findOne({ landId: input.landId });
  if (!land) throw notFound("Land not found.");
  if (land.status !== "PENDING_APPROVAL") throw badRequest("Only pending requests can be rejected.");

  land.status = "REJECTED";
  land.rejectionReason = input.reason ?? "Rejected by authority.";
  await land.save();

  await TransactionModel.create({
    landId: land.landId,
    toOwner: land.ownerWallet,
    transactionType: "LAND_REJECTED",
    blockchainTxHash: deterministicTxHash(`reject:${land.landId}`),
    status: "REJECTED",
    detail: land.rejectionReason
  });

  return land;
}

export async function listLands(input: { scope: "mine" | "market" | "all"; userId: string; role: string }) {
  if (input.scope === "mine") {
    return LandModel.find({ ownerId: input.userId }).sort({ createdAt: -1 });
  }
  if (input.scope === "market") {
    return LandModel.find({ status: "LISTED_FOR_SALE", forSale: true, ownerId: { $ne: input.userId } })
      .sort({ updatedAt: -1 })
      .populate("ownerId", "name walletAddress");
  }
  if (input.role !== "AUTHORITY") {
    return LandModel.find({ status: { $in: ["REGISTERED", "LISTED_FOR_SALE"] } }).sort({ createdAt: -1 });
  }
  return LandModel.find().sort({ createdAt: -1 }).populate("ownerId", "name email walletAddress");
}

export async function getLand(landId: string) {
  const land = await LandModel.findOne({ landId }).populate("ownerId", "name walletAddress");
  if (!land) throw notFound("Land not found.");
  return land;
}

export async function listLandForSale(input: { landId: string; salePrice: string; userId: string }) {
  const land = await LandModel.findOne({ landId: input.landId });
  if (!land) throw notFound("Land not found.");
  if (String(land.ownerId) !== input.userId) throw forbidden("Only the current owner can list this land.");
  if (land.status !== "REGISTERED") throw badRequest("Only registered lands can be listed for sale.");

  land.forSale = true;
  land.salePrice = input.salePrice;
  land.status = "LISTED_FOR_SALE";
  await land.save();

  await TransactionModel.create({
    landId: input.landId,
    fromOwner: land.ownerWallet,
    transactionType: "LIST_FOR_SALE",
    blockchainTxHash: deterministicTxHash(`market-list:${input.landId}:${input.salePrice}`),
    status: "LISTED"
  });

  return land;
}

export async function cancelLandSale(input: { landId: string; userId: string }) {
  const land = await LandModel.findOne({ landId: input.landId });
  if (!land) throw notFound("Land not found.");
  if (String(land.ownerId) !== input.userId) throw forbidden("Only the current owner can cancel this sale.");
  if (land.status !== "LISTED_FOR_SALE") throw badRequest("Land is not listed for sale.");

  land.forSale = false;
  land.salePrice = undefined;
  land.status = "REGISTERED";
  await land.save();

  await TransactionModel.create({
    landId: input.landId,
    fromOwner: land.ownerWallet,
    transactionType: "SALE_CANCELLED",
    blockchainTxHash: deterministicTxHash(`market-cancel:${input.landId}`),
    status: "CANCELLED"
  });

  return land;
}

export async function registryStats() {
  const [pending, registered, listed, users, latestRoot] = await Promise.all([
    LandModel.countDocuments({ status: "PENDING_APPROVAL" }),
    LandModel.countDocuments({ status: { $in: ["REGISTERED", "LISTED_FOR_SALE"] } }),
    LandModel.countDocuments({ status: "LISTED_FOR_SALE" }),
    UserModel.countDocuments({}),
    MerkleRootModel.findOne().sort({ createdAt: -1 })
  ]);
  return { pending, registered, listed, users, latestRoot: latestRoot?.root ?? null };
}
