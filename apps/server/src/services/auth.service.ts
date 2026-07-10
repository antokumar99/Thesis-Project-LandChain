import bcrypt from "bcryptjs";
import { UserModel } from "../models/User.model";
import { signToken } from "../utils/jwt.util";
import { ROLES, type Role } from "../constants/roles";
import { env } from "../config/env";
import { sha256Hex } from "../utils/hash.util";
import { badRequest, notFound, unauthorized } from "../utils/errors.util";
import { logger } from "../utils/logger.util";

function sanitizeUser(user: { toObject: () => Record<string, unknown> }) {
  const { passwordHash, __v, _id, ...safeUser } = user.toObject();
  return { ...safeUser, id: String(_id) };
}

/**
 * Public registration always creates a normal USER. The single authority
 * account is fixed and seeded from environment configuration at startup.
 */
export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  walletAddress: string;
  nid: string;
  phone?: string;
  address?: string;
}) {
  const email = input.email.toLowerCase();
  if (email === env.authorityEmail) throw badRequest("This email is reserved.");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await UserModel.create({
    name: input.name,
    email,
    passwordHash,
    walletAddress: input.walletAddress.toLowerCase(),
    role: ROLES.USER,
    nidHash: sha256Hex(`landchain-nid:${input.nid}`),
    phone: input.phone,
    address: input.address
  });

  const token = signToken({
    id: user.id,
    role: user.role as Role,
    walletAddress: user.walletAddress,
    email: user.email
  });

  return { user: sanitizeUser(user), token };
}

export async function loginUser(email: string, password: string) {
  const user = await UserModel.findOne({ email: email.toLowerCase() });
  if (!user) throw unauthorized("Invalid credentials.");

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) throw unauthorized("Invalid credentials.");

  const token = signToken({
    id: user.id,
    role: user.role as Role,
    walletAddress: user.walletAddress,
    email: user.email
  });

  return { user: sanitizeUser(user), token };
}

export async function getMe(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) throw notFound("User not found.");
  return sanitizeUser(user);
}

/** Upsert the fixed authority account from env config. Called at startup. */
export async function seedAuthority(): Promise<void> {
  const existing = await UserModel.findOne({ role: ROLES.AUTHORITY });
  if (existing) return;

  const passwordHash = await bcrypt.hash(env.authorityPassword, 12);
  await UserModel.create({
    name: env.authorityName,
    email: env.authorityEmail,
    passwordHash,
    walletAddress: env.authorityWallet,
    role: ROLES.AUTHORITY,
    nidHash: sha256Hex("landchain-authority")
  });
  logger.info(`Seeded fixed authority account: ${env.authorityEmail}`);
}
