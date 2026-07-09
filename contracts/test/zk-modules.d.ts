declare module "snarkjs" {
  export const groth16: {
    fullProve: (
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string
    ) => Promise<{ proof: SnarkjsGroth16Proof; publicSignals: string[] }>;
    verify: (verificationKey: unknown, publicSignals: unknown, proof: unknown) => Promise<boolean>;
  };
  export type SnarkjsGroth16Proof = {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
}

declare module "circomlibjs" {
  export type Poseidon = {
    (inputs: (bigint | string | number)[]): unknown;
    F: { toString(value: unknown, radix?: number): string };
  };
  export function buildPoseidon(): Promise<Poseidon>;
}
