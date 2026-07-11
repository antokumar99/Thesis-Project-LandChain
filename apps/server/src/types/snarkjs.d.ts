declare module "snarkjs" {
  export type Groth16FullProveResult = {
    proof: unknown;
    publicSignals: string[];
  };
  export const groth16: {
    fullProve: (
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string
    ) => Promise<Groth16FullProveResult>;
    verify: (verificationKey: unknown, publicSignals: unknown, proof: unknown) => Promise<boolean>;
  };
}
