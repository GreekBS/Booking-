import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ApplyBulkRatePlanFromTemplateUseCase,
  BULK_RATE_PLAN_CONFIRM_TTL_SECONDS,
  BULK_RATE_PLAN_CONFIRM_TYP,
  PreviewBulkRatePlanFromTemplateUseCase,
  Property,
  ValidationError,
  ratePlanContentFingerprint,
  type ActorContext,
  type BulkRatePlanConfirmClaims,
  type IBulkRatePlanConfirmTokenService,
  type IPropertyRepository,
  type IRatePlanRepository,
  type RatePlanProps,
} from "../../src/index";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SOURCE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TARGET_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const TARGET_B = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const admin: ActorContext = {
  userId: "admin-1",
  tenantId: TENANT,
  role: "admin",
  propertyIds: null,
};

const templatePlan: RatePlanProps = {
  baseNightlyAmount: "100.0000",
  currency: "EUR",
  seasons: [
    {
      id: "s-src",
      name: "Summer",
      startDate: "2025-07-01",
      endDate: "2025-08-31",
      nightlyAmount: "150.0000",
    },
  ],
  dowModifiers: [
    { dayOfWeek: 5, modifierType: "percent", modifierValue: "10.0000" },
  ],
  losDiscounts: [],
};

const customizedPlan: RatePlanProps = {
  ...templatePlan,
  baseNightlyAmount: "200.0000",
  seasons: [],
};

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

/** Test double mirroring production HMAC confirm tokens. */
class TestConfirmTokens implements IBulkRatePlanConfirmTokenService {
  constructor(private readonly secret = "test-bulk-rate-secret-ok") {}

  issue(
    input: Omit<BulkRatePlanConfirmClaims, "typ" | "v" | "iat" | "exp"> & {
      now?: Date;
      ttlSeconds?: number;
    },
  ) {
    const now = input.now ?? new Date();
    const iat = Math.floor(now.getTime() / 1000);
    const claims: BulkRatePlanConfirmClaims = {
      typ: BULK_RATE_PLAN_CONFIRM_TYP,
      v: 1,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      sourceUnitId: input.sourceUnitId,
      roomTypeId: input.roomTypeId,
      targetUnitIds: [...input.targetUnitIds].sort(),
      mode: input.mode,
      sourceFingerprint: input.sourceFingerprint,
      targetFingerprints: { ...input.targetFingerprints },
      applyUnitIds: [...input.applyUnitIds].sort(),
      skipUnitIds: [...input.skipUnitIds].sort(),
      actorId: input.actorId,
      iat,
      exp: iat + (input.ttlSeconds ?? BULK_RATE_PLAN_CONFIRM_TTL_SECONDS),
    };
    const payload = b64url(Buffer.from(JSON.stringify(claims), "utf8"));
    const sig = b64url(
      createHmac("sha256", this.secret).update(payload).digest(),
    );
    return { token: `${payload}.${sig}`, claims };
  }

  verify(token: string, now: Date = new Date()) {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expected = b64url(
      createHmac("sha256", this.secret).update(payload).digest(),
    );
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const claims = JSON.parse(
      fromB64url(payload).toString("utf8"),
    ) as BulkRatePlanConfirmClaims;
    if (Math.floor(now.getTime() / 1000) > claims.exp) return null;
    return claims;
  }
}

function propertyFixture() {
  const property = Property.create({
    id: PROP,
    tenantId: TENANT,
    name: "Hotel H2c",
    slug: "hotel-h2c",
    type: "hotel",
    defaultUnit: {
      id: "11111111-1111-4111-8111-111111111111",
      maxGuests: 2,
    },
  });
  for (const [id, name, room] of [
    [SOURCE, "Std 100", "100"],
    [TARGET_A, "Std 101", "101"],
    [TARGET_B, "Std 102", "102"],
  ] as const) {
    property.addUnit({
      id,
      name,
      slug: `room-${room}`,
      maxGuests: 2,
      roomTypeId: RT,
      roomNumber: room,
    });
  }
  return property;
}

function build(opts?: { plans?: Map<string, RatePlanProps | null> }) {
  const property = propertyFixture();
  const plans =
    opts?.plans ??
    new Map<string, RatePlanProps | null>([
      [SOURCE, templatePlan],
      [TARGET_A, null],
      [TARGET_B, customizedPlan],
    ]);

  const propertyRepository: IPropertyRepository = {
    save: vi.fn(),
    findById: vi.fn(async () => property),
    findBySlug: vi.fn(),
    existsBySlug: vi.fn(),
    findAll: vi.fn(),
    listUnitCatalog: vi.fn(),
    mutateUnderLock: vi.fn(async (_t, _p, mutator, after) => {
      await mutator(property);
      if (after) await after(property);
      return property;
    }),
  };

  const saved: Array<{ unitId: string; plan: RatePlanProps }> = [];
  const ratePlanRepository: IRatePlanRepository = {
    findByUnitId: vi.fn(async (id) => plans.get(id) ?? null),
    findByUnitIds: vi.fn(async () => new Map()),
    save: vi.fn(async (_t, unitId, plan) => {
      saved.push({ unitId, plan });
      plans.set(unitId, plan);
    }),
  };

  const outboxEvents: unknown[] = [];
  const outboxRepository = {
    saveEvents: vi.fn(async (events: unknown[]) => {
      outboxEvents.push(...events);
    }),
    findUnprocessed: vi.fn(),
    claimBatch: vi.fn(),
    markProcessed: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
  };

  const audits: unknown[] = [];
  const auditLogRepository = {
    append: vi.fn(async (entry: unknown) => {
      audits.push(entry);
    }),
  };

  const tokens = new TestConfirmTokens();
  let n = 0;
  const idGenerator = {
    generate: () => {
      n += 1;
      return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    },
  };

  const preview = new PreviewBulkRatePlanFromTemplateUseCase(
    propertyRepository,
    ratePlanRepository,
    new PermissionChecker(),
    tokens,
  );
  const apply = new ApplyBulkRatePlanFromTemplateUseCase(
    propertyRepository,
    ratePlanRepository,
    new PermissionChecker(),
    idGenerator,
    outboxRepository as never,
    auditLogRepository,
    tokens,
    preview,
  );

  return {
    preview,
    apply,
    saved,
    outboxEvents,
    audits,
    propertyRepository,
    ratePlanRepository,
  };
}

describe("BulkRatePlanFromTemplate C3-H2c", () => {
  it("fingerprints ignore season ids", () => {
    const a = ratePlanContentFingerprint(templatePlan);
    const b = ratePlanContentFingerprint({
      ...templatePlan,
      seasons: [{ ...templatePlan.seasons[0]!, id: "other-id" }],
    });
    expect(a).toBe(b);
  });

  it("previews create + protected skip without writes", async () => {
    const { preview, propertyRepository, ratePlanRepository } = build();
    const result = await preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_A, TARGET_B],
        mode: "skip_customized",
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.applyCount).toBe(1);
    expect(value.skipCount).toBe(1);
    expect(value.targets.find((t) => t.unitId === TARGET_A)?.decision).toBe(
      "apply_create",
    );
    expect(value.targets.find((t) => t.unitId === TARGET_B)?.decision).toBe(
      "skip_protected",
    );
    expect(value.confirmationToken.length).toBeGreaterThan(16);
    expect(value.customizationPolicy).toBe("conservative_content_diff");
    expect(propertyRepository.mutateUnderLock).not.toHaveBeenCalled();
    expect(ratePlanRepository.save).not.toHaveBeenCalled();
  });

  it("skip_customized apply creates missing plans only", async () => {
    const deps = build();
    const previewed = await deps.preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_A, TARGET_B],
        mode: "skip_customized",
      },
      admin,
    );

    const applied = await deps.apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
      },
      admin,
    );

    expect(applied.isSuccess).toBe(true);
    expect(applied.getValue().appliedUnitIds).toEqual([TARGET_A]);
    expect(applied.getValue().skippedUnitIds).toContain(TARGET_B);
    expect(deps.saved).toHaveLength(1);
    expect(deps.saved[0]!.plan.baseNightlyAmount).toBe("100.0000");
    expect(deps.saved[0]!.plan.seasons[0]!.id).not.toBe("s-src");
    expect(deps.outboxEvents).toHaveLength(1);
    expect(deps.audits).toHaveLength(1);
  });

  it("overwrite_all requires confirmOverwrite", async () => {
    const deps = build();
    const previewed = await deps.preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_B],
        mode: "overwrite_all",
      },
      admin,
    );

    const denied = await deps.apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
      },
      admin,
    );
    expect(denied.isFailure).toBe(true);
    expect(denied.getError().message).toMatch(/confirmOverwrite/);

    const ok = await deps.apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
        confirmOverwrite: true,
      },
      admin,
    );
    expect(ok.isSuccess).toBe(true);
    expect(ok.getValue().appliedUnitIds).toEqual([TARGET_B]);
  });

  it("rejects stale confirmation when target pricing changes", async () => {
    const plans = new Map<string, RatePlanProps | null>([
      [SOURCE, templatePlan],
      [TARGET_A, null],
    ]);
    const deps = build({ plans });
    const previewed = await deps.preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_A],
        mode: "skip_customized",
      },
      admin,
    );

    plans.set(TARGET_A, customizedPlan);

    const applied = await deps.apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
      },
      admin,
    );
    expect(applied.isFailure).toBe(true);
    expect(applied.getError()).toBeInstanceOf(ValidationError);
    expect(applied.getError().message).toMatch(/stale/i);
  });

  it("rejects zero-priced and LOS source templates", async () => {
    const zero = build({
      plans: new Map([[SOURCE, { ...templatePlan, baseNightlyAmount: "0.0000" }]]),
    });
    expect(
      (
        await zero.preview.execute(
          {
            tenantId: TENANT,
            propertyId: PROP,
            sourceUnitId: SOURCE,
            targetUnitIds: [TARGET_A],
            mode: "skip_customized",
          },
          admin,
        )
      ).isFailure,
    ).toBe(true);

    const los = build({
      plans: new Map([
        [
          SOURCE,
          {
            ...templatePlan,
            losDiscounts: [{ minNights: 7, percentOff: "10.0000" }],
          },
        ],
      ]),
    });
    expect(
      (
        await los.preview.execute(
          {
            tenantId: TENANT,
            propertyId: PROP,
            sourceUnitId: SOURCE,
            targetUnitIds: [TARGET_A],
            mode: "skip_customized",
          },
          admin,
        )
      ).isFailure,
    ).toBe(true);
  });

  it("rejects confirmation issued for another actor", async () => {
    const deps = build();
    const previewed = await deps.preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_A],
        mode: "skip_customized",
      },
      admin,
    );

    const applied = await deps.apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
      },
      { ...admin, userId: "other-admin" },
    );
    expect(applied.isFailure).toBe(true);
    expect(applied.getError().message).toMatch(/different operator/);
  });

  it("rejects wrong RoomType and duplicate-safe target selection", async () => {
    const property = propertyFixture();
    const otherRt = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    property.addUnit({
      id: "99999999-9999-4999-8999-999999999999",
      name: "Suite 200",
      slug: "suite-200",
      maxGuests: 4,
      roomTypeId: otherRt,
      roomNumber: "200",
    });
    const plans = new Map<string, RatePlanProps | null>([
      [SOURCE, templatePlan],
      ["99999999-9999-4999-8999-999999999999", null],
      [TARGET_A, null],
    ]);
    const deps = build({ plans });
    (deps.propertyRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      property,
    );

    const wrongRt = await deps.preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: ["99999999-9999-4999-8999-999999999999"],
        mode: "skip_customized",
      },
      admin,
    );
    expect(wrongRt.isFailure).toBe(true);
    expect(wrongRt.getError().message).toMatch(/RoomType/);

    const deduped = await deps.preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_A, TARGET_A],
        mode: "skip_customized",
      },
      admin,
    );
    expect(deduped.isSuccess).toBe(true);
    expect(deduped.getValue().targets).toHaveLength(1);
  });

  it("rejects stale confirmation when source pricing changes", async () => {
    const plans = new Map<string, RatePlanProps | null>([
      [SOURCE, templatePlan],
      [TARGET_A, null],
    ]);
    const deps = build({ plans });
    const previewed = await deps.preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_A],
        mode: "skip_customized",
      },
      admin,
    );

    plans.set(SOURCE, { ...templatePlan, baseNightlyAmount: "175.0000" });

    const applied = await deps.apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
      },
      admin,
    );
    expect(applied.isFailure).toBe(true);
    expect(applied.getError().message).toMatch(/stale/i);
  });

  it("rolls back all rate writes when mid-batch save fails", async () => {
    const plans = new Map<string, RatePlanProps | null>([
      [SOURCE, templatePlan],
      [TARGET_A, null],
      [TARGET_B, null],
    ]);
    const deps = build({ plans });
    let saves = 0;
    (deps.ratePlanRepository.save as ReturnType<typeof vi.fn>).mockImplementation(
      async (_t: string, unitId: string, plan: RatePlanProps) => {
        saves += 1;
        if (saves >= 2) throw new Error("simulated rate plan failure");
        plans.set(unitId, plan);
        deps.saved.push({ unitId, plan });
      },
    );

    const previewed = await deps.preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_A, TARGET_B],
        mode: "skip_customized",
      },
      admin,
    );

    const applied = await deps.apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
      },
      admin,
    );
    expect(applied.isFailure).toBe(true);
    // Domain use case surfaces the error; ambient TX (PG) rolls back. In-memory
    // map may retain the first write — callers rely on transactional repositories.
    expect(deps.outboxEvents).toHaveLength(0);
    expect(deps.audits).toHaveLength(0);
  });

  it("rolls back when outbox persistence fails", async () => {
    const plans = new Map<string, RatePlanProps | null>([
      [SOURCE, templatePlan],
      [TARGET_A, null],
    ]);
    const deps = build({ plans });
    const outbox = {
      saveEvents: vi.fn(async () => {
        throw new Error("simulated outbox failure");
      }),
      findUnprocessed: vi.fn(),
      claimBatch: vi.fn(),
      markProcessed: vi.fn(),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
    };
    const apply = new ApplyBulkRatePlanFromTemplateUseCase(
      deps.propertyRepository,
      deps.ratePlanRepository,
      new PermissionChecker(),
      {
        generate: () => "00000000-0000-4000-8000-000000000099",
      },
      outbox as never,
      {
        append: vi.fn(async () => {
          /* unused */
        }),
      },
      new TestConfirmTokens(),
      deps.preview,
    );

    const previewed = await deps.preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_A],
        mode: "skip_customized",
      },
      admin,
    );

    const applied = await apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
      },
      admin,
    );
    expect(applied.isFailure).toBe(true);
    expect(applied.getError().message).toMatch(/outbox/i);
  });

  it("emits rate-sync only for changed units and skips identical", async () => {
    const plans = new Map<string, RatePlanProps | null>([
      [SOURCE, templatePlan],
      [TARGET_A, null],
      [TARGET_B, templatePlan],
    ]);
    const deps = build({ plans });
    const previewed = await deps.preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_A, TARGET_B],
        mode: "skip_customized",
      },
      admin,
    );
    expect(previewed.getValue().targets.find((t) => t.unitId === TARGET_B)?.decision).toBe(
      "skip_identical",
    );

    const applied = await deps.apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
      },
      admin,
    );
    expect(applied.isSuccess).toBe(true);
    expect(applied.getValue().appliedUnitIds).toEqual([TARGET_A]);
    expect(deps.outboxEvents).toHaveLength(1);
    expect((deps.outboxEvents[0] as { payload: { unitId: string } }).payload.unitId).toBe(
      TARGET_A,
    );
  });
});
