pragma circom 2.1.6;

include "components/poseidonHasher.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

/*
 * ZK Application #4 — Attribute range proof (selective disclosure).
 *
 * Statement: "The land area committed to in `areaCommitment` is at least
 * `minArea` square meters" — without revealing the exact area.
 *
 * Private inputs: areaValue, areaSalt
 * Public inputs:  areaCommitment, minArea
 */
template AreaRange(bits) {
  signal input areaValue;
  signal input areaSalt;
  signal input areaCommitment;
  signal input minArea;

  // Enforce both operands fit in `bits` bits before comparing.
  component areaBits = Num2Bits(bits);
  areaBits.in <== areaValue;
  component minBits = Num2Bits(bits);
  minBits.in <== minArea;

  component hasher = Poseidon2();
  hasher.left <== areaValue;
  hasher.right <== areaSalt;
  areaCommitment === hasher.out;

  component ge = GreaterEqThan(bits);
  ge.in[0] <== areaValue;
  ge.in[1] <== minArea;
  ge.out === 1;
}

component main { public [areaCommitment, minArea] } = AreaRange(64);
