import bcrypt from "bcryptjs";

/** Must match apps/web/lib/auth/BcryptPasswordHasher (bcrypt rounds = 12). */
const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
