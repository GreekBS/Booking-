import { describe, expect, it } from "vitest";
import {
  IdempotencyConflictError,
  PersistenceCorruptionError,
  ValidationError,
} from "@hcp/domain";
import { apiError } from "@/lib/api-error-handler";

describe("api-error-handler (CM-4b S3f)", () => {
  it("maps IDEMPOTENCY_CONFLICT to 409", async () => {
    const response = apiError(new IdempotencyConflictError("fingerprint mismatch"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
  });

  it("maps PERSISTENCE_CORRUPTION to 500", async () => {
    const response = apiError(new PersistenceCorruptionError("corrupt"));
    expect(response.status).toBe(500);
  });

  it("keeps VALIDATION_ERROR at 400", async () => {
    const response = apiError(new ValidationError("bad"));
    expect(response.status).toBe(400);
  });
});
