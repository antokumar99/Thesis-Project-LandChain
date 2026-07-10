declare module "circomlibjs" {
  export type PoseidonField = {
    toString(value: unknown, radix?: number): string;
  };
  export type Poseidon = {
    (inputs: (bigint | string | number)[]): unknown;
    F: PoseidonField;
  };
  export function buildPoseidon(): Promise<Poseidon>;
}
