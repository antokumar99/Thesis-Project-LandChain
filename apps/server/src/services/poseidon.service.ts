import { buildPoseidon } from "circomlibjs";

type PoseidonFn = Awaited<ReturnType<typeof buildPoseidon>>;

let poseidonPromise: Promise<PoseidonFn> | null = null;

async function getPoseidon(): Promise<PoseidonFn> {
  if (!poseidonPromise) poseidonPromise = buildPoseidon();
  return poseidonPromise;
}

/** Poseidon hash of two field elements; inputs and output are decimal strings. */
export async function poseidonHash2(left: string, right: string): Promise<string> {
  const poseidon = await getPoseidon();
  return poseidon.F.toString(poseidon([BigInt(left), BigInt(right)]));
}
