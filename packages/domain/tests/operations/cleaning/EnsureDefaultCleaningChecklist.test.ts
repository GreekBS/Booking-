import { describe, expect, it, vi } from "vitest";
import { PermissionChecker } from "../../../src/shared/services/PermissionChecker";
import type { ActorContext } from "../../../src/shared/services/PermissionChecker";
import { GetCleaningChecklistTemplateUseCase } from "../../../src/operations/cleaning/application/CleaningTemplateUseCases";
import {
  DEFAULT_CLEANING_CHECKLIST_ITEMS,
  DEFAULT_CLEANING_CHECKLIST_NAME,
} from "../../../src/operations/cleaning/domain/defaultCleaningChecklist";
import type {
  CleaningChecklistTemplateRecord,
  EnsureDefaultChecklistTemplateInput,
  EnsureDefaultChecklistTemplateResult,
  ICleaningChecklistRepository,
  UpsertChecklistTemplateInput,
} from "../../../src/operations/cleaning";

function makeTemplate(
  propertyId: string,
  overrides?: Partial<CleaningChecklistTemplateRecord>,
): CleaningChecklistTemplateRecord {
  const now = new Date("2026-09-28T00:00:00.000Z");
  return {
    id: "tmpl-1",
    tenantId: "tenant-1",
    propertyId,
    name: DEFAULT_CLEANING_CHECKLIST_NAME,
    isActive: true,
    version: 1,
    minimumCompletionPhotos: 0,
    createdAt: now,
    updatedAt: now,
    items: DEFAULT_CLEANING_CHECKLIST_ITEMS.map((item, index) => ({
      id: `item-${index}`,
      tenantId: "tenant-1",
      templateId: "tmpl-1",
      label: item.label,
      description: item.description,
      position: index,
      required: item.required,
      photoRequired: item.photoRequired,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })),
    ...overrides,
  };
}

class FakeChecklistRepo implements ICleaningChecklistRepository {
  store = new Map<string, CleaningChecklistTemplateRecord>();
  ensureCalls = 0;

  async findActiveTemplateByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<CleaningChecklistTemplateRecord | null> {
    return this.store.get(`${tenantId}:${propertyId}`) ?? null;
  }

  async upsertActiveTemplate(
    input: UpsertChecklistTemplateInput,
  ): Promise<CleaningChecklistTemplateRecord> {
    const existing = await this.findActiveTemplateByProperty(
      input.tenantId,
      input.propertyId,
    );
    const base = existing ?? makeTemplate(input.propertyId);
    const next: CleaningChecklistTemplateRecord = {
      ...base,
      name: input.name,
      minimumCompletionPhotos: input.minimumCompletionPhotos,
      version: existing ? existing.version + 1 : 1,
      items: input.items.map((item, index) => ({
        id: item.id ?? `new-${index}`,
        tenantId: input.tenantId,
        templateId: base.id,
        label: item.label,
        description: item.description ?? null,
        position: index,
        required: item.required ?? true,
        photoRequired: item.photoRequired ?? false,
        isActive: true,
        createdAt: base.createdAt,
        updatedAt: new Date(),
      })),
    };
    this.store.set(`${input.tenantId}:${input.propertyId}`, next);
    return next;
  }

  async ensureDefaultActiveTemplate(
    input: EnsureDefaultChecklistTemplateInput,
  ): Promise<EnsureDefaultChecklistTemplateResult> {
    this.ensureCalls += 1;
    const key = `${input.tenantId}:${input.propertyId}`;
    const existing = this.store.get(key);
    if (existing) return { template: existing, created: false };
    const created = makeTemplate(input.propertyId);
    this.store.set(key, created);
    return { template: created, created: true };
  }
}

const actor: ActorContext = {
  userId: "user-1",
  role: "admin",
  propertyIds: null,
  isSuperAdmin: false,
};

describe("GetCleaningChecklistTemplateUseCase default ensure", () => {
  it("materializes defaults once and returns the same template on retry", async () => {
    const repo = new FakeChecklistRepo();
    const audit = { append: vi.fn(async () => undefined) };
    const useCase = new GetCleaningChecklistTemplateUseCase(
      repo,
      new PermissionChecker(),
      audit,
    );

    const first = await useCase.execute(
      { tenantId: "tenant-1", propertyId: "prop-1" },
      actor,
    );
    const second = await useCase.execute(
      { tenantId: "tenant-1", propertyId: "prop-1" },
      actor,
    );

    expect(first.isSuccess).toBe(true);
    expect(second.isSuccess).toBe(true);
    const a = first.getValue();
    const b = second.getValue();
    expect(a.items.filter((i) => i.isActive)).toHaveLength(10);
    expect(b.id).toBe(a.id);
    expect(repo.ensureCalls).toBe(2);
    expect(audit.append).toHaveBeenCalledTimes(1);
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cleaning_checklist.default_ensured" }),
    );
  });

  it("does not restore defaults after operator customization", async () => {
    const repo = new FakeChecklistRepo();
    const useCase = new GetCleaningChecklistTemplateUseCase(
      repo,
      new PermissionChecker(),
    );

    await useCase.execute({ tenantId: "tenant-1", propertyId: "prop-1" }, actor);
    await repo.upsertActiveTemplate({
      tenantId: "tenant-1",
      propertyId: "prop-1",
      name: "Custom Olive",
      minimumCompletionPhotos: 1,
      actorUserId: actor.userId,
      items: [
        {
          id: "item-0",
          label: "Custom only",
          description: "Operator edited",
          required: true,
          photoRequired: false,
        },
      ],
    });

    const after = await useCase.execute(
      { tenantId: "tenant-1", propertyId: "prop-1" },
      actor,
    );
    expect(after.isSuccess).toBe(true);
    const template = after.getValue();
    expect(template.name).toBe("Custom Olive");
    expect(template.items.filter((i) => i.isActive)).toHaveLength(1);
    expect(template.items[0]!.label).toBe("Custom only");
  });
});
