import { env } from "./env";

export const ipfsConfig = {
  pinataJwt: env.pinataJwt,
  gateway: env.ipfsGateway,
  deedEncryptionKey: env.deedEncryptionKey
};
