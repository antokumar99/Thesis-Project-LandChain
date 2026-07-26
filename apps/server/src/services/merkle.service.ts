import { LandModel } from "../models/Land.model";
import { poseidonHash2 } from "./poseidon.service";
import { proveWithCircuit } from "./zk.service";
import type { Groth16Proof } from "../types/proof.types";

/** Must match the `levels` parameter of the compiled circom circuits. */
export const TREE_DEPTH = 20;
export const TREE_CAPACITY = 2 ** TREE_DEPTH;
const ZERO_LEAF = "0";

let zeroCache: string[] | null = null;

/** zeros[i] = root of an empty subtree of height i. */
async function zeros(): Promise<string[]> {
  if (zeroCache) return zeroCache;
  const levels: string[] = [ZERO_LEAF];
  for (let i = 0; i < TREE_DEPTH; i++) {
    levels.push(await poseidonHash2(levels[i], levels[i]));
  }
  zeroCache = levels;
  return levels;
}

export type MerklePath = { pathElements: string[]; pathIndices: number[] };
export type MerkleSnapshot = {
  root: string;
  leafCount: number;
  pathFor: (leafIndex: number) => MerklePath;
};

/**
 * Build the fixed-depth Poseidon Merkle tree over land commitments placed at
 * their assigned leafIndex. `leaves` maps leafIndex -> commitment.
 */
export async function buildTree(leaves: Map<number, string>): Promise<MerkleSnapshot> {
  const zs = await zeros();
  const leafCount = leaves.size === 0 ? 0 : Math.max(...leaves.keys()) + 1;
  if (leafCount > TREE_CAPACITY) throw new Error(`Registry tree is full (capacity ${TREE_CAPACITY}).`);

  // layers[0] = leaf layer (sparse; missing = zero).
  const layers: Map<number, string>[] = [new Map(leaves)];
  for (let level = 0; level < TREE_DEPTH; level++) {
    const current = layers[level];
    const next = new Map<number, string>();
    const parentIndices = new Set<number>();
    for (const index of current.keys()) parentIndices.add(Math.floor(index / 2));
    for (const parent of parentIndices) {
      const left = current.get(parent * 2) ?? zs[level];
      const right = current.get(parent * 2 + 1) ?? zs[level];
      next.set(parent, await poseidonHash2(left, right));
    }
    layers.push(next);
  }

  const root = layers[TREE_DEPTH].get(0) ?? zs[TREE_DEPTH];

  function pathFor(leafIndex: number): MerklePath {
    const pathElements: string[] = [];
    const pathIndices: number[] = [];
    let index = leafIndex;
    for (let level = 0; level < TREE_DEPTH; level++) {
      const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
      pathElements.push(layers[level].get(siblingIndex) ?? zs[level]);
      pathIndices.push(index % 2);
      index = Math.floor(index / 2);
    }
    return { pathElements, pathIndices };
  }

  return { root, leafCount, pathFor };
}

/** Lands that occupy a leaf in the registry tree. */
export function treeLandFilter() {
  return { status: { $in: ["REGISTERED", "LISTED_FOR_SALE"] as const }, leafIndex: { $ne: null } };
}

/**
 * Rebuild the registry tree from all approved lands and persist the new root
 * and per-land Merkle paths. Returns the snapshot.
 */
export async function rebuildRegistryTree(): Promise<MerkleSnapshot> {
  const lands = await LandModel.find(treeLandFilter());
  const leaves = new Map<number, string>();
  for (const land of lands) leaves.set(land.leafIndex as number, land.landCommitment);

  const snapshot = await buildTree(leaves);

  await Promise.all(
    lands.map((land) => {
      const { pathElements, pathIndices } = snapshot.pathFor(land.leafIndex as number);
      return LandModel.updateOne(
        { _id: land._id },
        { merkleRoot: snapshot.root, pathElements, pathIndices }
      );
    })
  );

  return snapshot;
}

/** Next free leaf index (append-only assignment). */
export async function nextLeafIndex(): Promise<number> {
  const last = await LandModel.findOne(treeLandFilter()).sort({ leafIndex: -1 }).select("leafIndex");
  return last?.leafIndex != null ? (last.leafIndex as number) + 1 : 0;
}

/** Fold a Merkle path bottom-up to compute the root a given leaf implies. */
export async function computeRootFromPath(leaf: string, path: MerklePath): Promise<string> {
  let node = leaf;
  for (let level = 0; level < TREE_DEPTH; level++) {
    node =
      path.pathIndices[level] === 0
        ? await poseidonHash2(node, path.pathElements[level])
        : await poseidonHash2(path.pathElements[level], node);
  }
  return node;
}

export type RootTransition = {
  proof: Groth16Proof;
  /** [leafBefore, leafAfter, oldRoot, newRoot] as decimal field strings. */
  publicSignals: string[];
};

/**
 * Groth16 proof that the registry root changed in exactly ONE leaf: the leaf
 * on `path` went from `leafBefore` to `leafAfter`, turning the previously
 * anchored root into `newRoot`. The on-chain LandRegistry verifies this proof
 * for every root update, so it never trusts our off-chain tree computation.
 */
export async function proveRootTransition(input: {
  path: MerklePath;
  leafBefore: string;
  leafAfter: string;
  newRoot: string;
}): Promise<RootTransition> {
  const oldRoot = await computeRootFromPath(input.leafBefore, input.path);
  const expectedNewRoot = await computeRootFromPath(input.leafAfter, input.path);
  if (expectedNewRoot !== input.newRoot) {
    throw new Error("Root transition mismatch: the rebuilt tree differs from a single-leaf update.");
  }

  const proved = await proveWithCircuit("rootTransition", {
    pathElements: input.path.pathElements,
    pathIndices: input.path.pathIndices,
    leafBefore: input.leafBefore,
    leafAfter: input.leafAfter,
    oldRoot,
    newRoot: input.newRoot
  });

  return { proof: proved.proof as Groth16Proof, publicSignals: proved.publicSignals };
}
