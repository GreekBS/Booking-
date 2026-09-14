import { randomBytes } from "crypto";
import { prisma } from "../client";
import type {
  IVerificationTokenRepository,
  VerificationTokenRecord,
} from "@hcp/domain";

export class PrismaVerificationTokenRepository
  implements IVerificationTokenRepository
{
  async create(record: VerificationTokenRecord): Promise<void> {
    await prisma.verificationToken.create({
      data: {
        identifier: record.identifier,
        token: record.token,
        expires: record.expires,
      },
    });
  }

  async find(
    identifier: string,
    token: string,
  ): Promise<VerificationTokenRecord | null> {
    const record = await prisma.verificationToken.findUnique({
      where: { identifier_token: { identifier, token } },
    });
    if (!record) {
      return null;
    }
    return {
      identifier: record.identifier,
      token: record.token,
      expires: record.expires,
    };
  }

  async delete(identifier: string, token: string): Promise<void> {
    await prisma.verificationToken.deleteMany({
      where: { identifier, token },
    });
  }
}

export function generateSecureToken(): string {
  return randomBytes(32).toString("hex");
}
