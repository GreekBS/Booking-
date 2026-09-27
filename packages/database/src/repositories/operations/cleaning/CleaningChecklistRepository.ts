import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  CleaningChecklistTemplateItemRecord,
  CleaningChecklistTemplateRecord,
  EnsureDefaultChecklistTemplateInput,
  EnsureDefaultChecklistTemplateResult,
  ICleaningChecklistRepository,
  UpsertChecklistTemplateInput,
} from "@hcp/domain";
import {
  DEFAULT_CLEANING_CHECKLIST_MINIMUM_PHOTOS,
  DEFAULT_CLEANING_CHECKLIST_NAME,
  buildDefaultCleaningChecklistItems,
  NotFoundError,
} from "@hcp/domain";
import { withTenantTransaction } from "../../../client";

type TemplateItemRow = {
  id: string;
  tenantId: string;
  templateId: string;
  label: string;
  description: string | null;
  position: number;
  required: boolean;
  photoRequired: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type TemplateRow = {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  isActive: boolean;
  version: number;
  minimumCompletionPhotos: number;
  createdAt: Date;
  updatedAt: Date;
  items?: TemplateItemRow[];
};

function mapItem(row: TemplateItemRow): CleaningChecklistTemplateItemRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    templateId: row.templateId,
    label: row.label,
    description: row.description,
    position: row.position,
    required: row.required,
    photoRequired: row.photoRequired,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTemplate(row: TemplateRow): CleaningChecklistTemplateRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    name: row.name,
    isActive: row.isActive,
    version: row.version,
    minimumCompletionPhotos: row.minimumCompletionPhotos,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: (row.items ?? []).map(mapItem),
  };
}

async function loadTemplate(
  tx: Prisma.TransactionClient,
  tenantId: string,
  templateId: string,
): Promise<CleaningChecklistTemplateRecord> {
  const row = await tx.cleaningChecklistTemplate.findFirst({
    where: { id: templateId, tenantId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!row) throw new Error("Cleaning checklist template not found after write");
  return mapTemplate(row as TemplateRow);
}

export class PrismaCleaningChecklistRepository
  implements ICleaningChecklistRepository
{
  async findActiveTemplateByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<CleaningChecklistTemplateRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.cleaningChecklistTemplate.findFirst({
        where: { tenantId, propertyId, isActive: true },
        include: { items: { orderBy: { position: "asc" } } },
      });
      return row ? mapTemplate(row as TemplateRow) : null;
    });
  }

  async upsertActiveTemplate(
    input: UpsertChecklistTemplateInput,
  ): Promise<CleaningChecklistTemplateRecord> {
    const now = input.now ?? new Date();

    return withTenantTransaction(input.tenantId, async (tx) => {
      // Serialize checklist edits per property against the partial unique index.
      await tx.$queryRaw`
        SELECT id FROM properties
        WHERE id = ${input.propertyId}::uuid AND tenant_id = ${input.tenantId}::uuid
        FOR UPDATE
      `;

      const existing = await tx.cleaningChecklistTemplate.findFirst({
        where: {
          tenantId: input.tenantId,
          propertyId: input.propertyId,
          isActive: true,
        },
        include: { items: true },
      });

      const templateId = existing?.id ?? randomUUID();

      if (existing) {
        await tx.cleaningChecklistTemplate.update({
          where: { id: templateId },
          data: {
            name: input.name,
            minimumCompletionPhotos: input.minimumCompletionPhotos,
            version: { increment: 1 },
            updatedAt: now,
          },
        });
      } else {
        await tx.cleaningChecklistTemplate.create({
          data: {
            id: templateId,
            tenantId: input.tenantId,
            propertyId: input.propertyId,
            name: input.name,
            isActive: true,
            version: 1,
            minimumCompletionPhotos: input.minimumCompletionPhotos,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      const keptIds: string[] = [];
      for (const [index, item] of input.items.entries()) {
        const label = item.label.trim();
        const description = item.description?.trim() || null;
        const required = item.required ?? true;
        const photoRequired = item.photoRequired ?? false;
        const existingItem = item.id
          ? existing?.items.find((row) => row.id === item.id)
          : undefined;

        if (existingItem) {
          await tx.cleaningChecklistTemplateItem.update({
            where: { id: existingItem.id },
            data: {
              label,
              description,
              position: index,
              required,
              photoRequired,
              isActive: true,
              updatedAt: now,
            },
          });
          keptIds.push(existingItem.id);
          continue;
        }

        const created = await tx.cleaningChecklistTemplateItem.create({
          data: {
            id: randomUUID(),
            tenantId: input.tenantId,
            templateId,
            label,
            description,
            position: index,
            required,
            photoRequired,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
        });
        keptIds.push(created.id);
      }

      // Removed lines are deactivated, not deleted: execution snapshots keep
      // pointing at their source item.
      await tx.cleaningChecklistTemplateItem.updateMany({
        where: {
          tenantId: input.tenantId,
          templateId,
          id: { notIn: keptIds.length > 0 ? keptIds : [randomUUID()] },
          isActive: true,
        },
        data: { isActive: false, updatedAt: now },
      });

      return loadTemplate(tx, input.tenantId, templateId);
    });
  }

  async ensureDefaultActiveTemplate(
    input: EnsureDefaultChecklistTemplateInput,
  ): Promise<EnsureDefaultChecklistTemplateResult> {
    const now = input.now ?? new Date();

    return withTenantTransaction(input.tenantId, async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM properties
        WHERE id = ${input.propertyId}::uuid AND tenant_id = ${input.tenantId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new NotFoundError("Property", input.propertyId);
      }

      const existing = await tx.cleaningChecklistTemplate.findFirst({
        where: {
          tenantId: input.tenantId,
          propertyId: input.propertyId,
          isActive: true,
        },
        include: { items: { orderBy: { position: "asc" } } },
      });
      if (existing) {
        return {
          template: mapTemplate(existing as TemplateRow),
          created: false,
        };
      }

      const templateId = randomUUID();
      const defaults = buildDefaultCleaningChecklistItems();

      await tx.cleaningChecklistTemplate.create({
        data: {
          id: templateId,
          tenantId: input.tenantId,
          propertyId: input.propertyId,
          name: DEFAULT_CLEANING_CHECKLIST_NAME,
          isActive: true,
          version: 1,
          minimumCompletionPhotos: DEFAULT_CLEANING_CHECKLIST_MINIMUM_PHOTOS,
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.cleaningChecklistTemplateItem.createMany({
        data: defaults.map((item, index) => ({
          id: randomUUID(),
          tenantId: input.tenantId,
          templateId,
          label: item.label.trim(),
          description: item.description?.trim() || null,
          position: index,
          required: item.required ?? true,
          photoRequired: item.photoRequired ?? false,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })),
      });

      return {
        template: await loadTemplate(tx, input.tenantId, templateId),
        created: true,
      };
    });
  }
}

export { mapTemplate, type TemplateRow };
