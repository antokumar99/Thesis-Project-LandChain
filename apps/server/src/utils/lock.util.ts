/**
 * Minimal async mutex used to serialize registry-tree mutations.
 *
 * approveLand and buyListedLand read the current leaf assignment, mutate land
 * documents, and rebuild the Merkle tree. Running two of those interleaved can
 * assign the same leafIndex to two lands — one commitment silently overwrites
 * the other in the tree and that owner can never prove membership again.
 * Serializing the critical sections removes the race (single-process server).
 */
let registryChain: Promise<unknown> = Promise.resolve();

export function withRegistryLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = registryChain.then(fn, fn);
  // Keep the chain alive regardless of individual failures.
  registryChain = run.catch(() => undefined);
  return run;
}
