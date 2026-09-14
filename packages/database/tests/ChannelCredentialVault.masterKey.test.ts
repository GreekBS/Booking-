import { describe, expect, it } from "vitest";
import { PersistenceCorruptionError } from "@hcp/domain";
import { PrismaChannelCredentialVault } from "../src";

describe("PrismaChannelCredentialVault master-key fail-closed (unit)", () => {
  it("constructs without a key (lazy parse for build safety)", () => {
    expect(() => new PrismaChannelCredentialVault(undefined, undefined)).not.toThrow();
  });

  it("putCredential fails closed when key is missing — before any encrypt", async () => {
    const vault = new PrismaChannelCredentialVault(undefined, undefined);
    await expect(
      vault.putCredential("550e8400-e29b-41d4-a716-446655440900", { apiKey: "x" }),
    ).rejects.toBeInstanceOf(PersistenceCorruptionError);
  });

  it("putCredential fails closed when key is empty", async () => {
    const vault = new PrismaChannelCredentialVault(undefined, "   ");
    await expect(
      vault.putCredential("550e8400-e29b-41d4-a716-446655440900", { apiKey: "x" }),
    ).rejects.toBeInstanceOf(PersistenceCorruptionError);
  });

  it("putCredential fails closed when key is wrong length", async () => {
    const vault = new PrismaChannelCredentialVault(
      undefined,
      Buffer.alloc(16, 1).toString("base64"),
    );
    await expect(
      vault.putCredential("550e8400-e29b-41d4-a716-446655440900", { apiKey: "x" }),
    ).rejects.toBeInstanceOf(PersistenceCorruptionError);
  });
});
