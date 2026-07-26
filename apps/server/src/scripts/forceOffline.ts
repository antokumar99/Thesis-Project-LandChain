/**
 * Imported FIRST by the smoke test (before config/env loads): forces offline
 * mode so the smoke run never depends on a running Ethereum node or a real
 * MongoDB — it must be deterministic on any machine.
 */
process.env.LANDCHAIN_OFFLINE = "1";

export {};
