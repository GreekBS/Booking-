import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  ConflictError,
  NotFoundError,
  QR_MANUAL_CLEANING_TASK_TITLE,
  Task,
  ValidationError,
  assertCleaningCompletable,
  createCleaningLocationStatus,
  markCleaningLocationClean,
  selectCleaningTask,
  type CleaningContextSnapshot,
  type CleaningExecutionDetail,
  type CleaningExecutionItemRecord,
  type CleaningExecutionStatus,
  type CleaningHistoryEntry,
  type CleaningPhotoRecord,
  type CompleteCleaningCommand,
  type CompleteCleaningResult,
  type ICleaningExecutionRepository,
  type IHousekeepingTurnoverStore,
  type ListCleaningHistoryFilters,
  type PaginatedCleaningHistory,
  type StartOrResumeCleaningCommand,
  type StartOrResumeCleaningResult,
  type UpdateCleaningItemCommand,
  type UnitHousekeepingSource,
  type UnitHousekeepingStatusValue,
} from "@hcp/domain";
import { withTenantTransaction } from "../../../client";
import { mapTask, type TaskRow } from "../TaskRepository";
import { mapPhoto, type PhotoRow } from "./CleaningPhotoRepository";

type ExecutionRow = {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string | null;
  cleaningLocationId: string | null;
  taskId: string;
  templateId: string | null;
  templateVersion: number | null;
  status: string;
  startedByUserId: string;
  startedAt: Date;
  completedByUserId: string | null;
  completedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type ExecutionItemRow = {
  id: string;
  tenantId: string;
  executionId: string;
  sourceTemplateItemId: string | null;
  labelSnapshot: string;
  descriptionSnapshot: string | null;
  position: number;
  required: boolean;
  photoRequired: boolean;
  checked: boolean;
  checkedAt: Date | null;
  checkedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapExecutionItem(row: ExecutionItemRow): CleaningExecutionItemRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    executionId: row.executionId,
    sourceTemplateItemId: row.sourceTemplateItemId,
    labelSnapshot: row.labelSnapshot,
    descriptionSnapshot: row.descriptionSnapshot,
    position: row.position,
    required: row.required,
    photoRequired: row.photoRequired,
    checked: row.checked,
    checkedAt: row.checkedAt,
    checkedByUserId: row.checkedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapExecution(
  row: ExecutionRow,
  items: ExecutionItemRow[],
  photos: PhotoRow[],
): CleaningExecutionDetail {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    unitId: row.unitId,
    cleaningLocationId: row.cleaningLocationId,
    taskId: row.taskId,
    templateId: row.templateId,
    templateVersion: row.templateVersion,
    status: row.status as CleaningExecutionStatus,
    startedByUserId: row.startedByUserId,
    startedAt: row.startedAt,
    completedByUserId: row.completedByUserId,
    completedAt: row.completedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: items.map(mapExecutionItem),
    photos: photos.map(mapPhoto),
  };
}

async function loadExecutionDetail(
  tx: Prisma.TransactionClient,
  tenantId: string,
  executionId: string,
): Promise<CleaningExecutionDetail | null> {
  const row = await tx.cleaningExecution.findFirst({
    where: { id: executionId, tenantId },
    include: {
      items: { orderBy: { position: "asc" } },
      photos: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) return null;
  const { items, photos, ...rest } = row as ExecutionRow & {
    items: ExecutionItemRow[];
    photos: PhotoRow[];
  };
  return mapExecution(rest, items, photos);
}

async function startTaskIfOpen(
  tx: Prisma.TransactionClient,
  tenantId: string,
  taskId: string,
  now: Date,
): Promise<void> {
  const taskRow = await tx.task.findFirst({
    where: { id: taskId, tenantId },
  });
  if (!taskRow) throw new NotFoundError("Task", taskId);
  const task = mapTask(taskRow as TaskRow);
  if (task.status === "OPEN") {
    const expected = task.version;
    task.start(expected, now);
    const updated = await tx.task.updateMany({
      where: { id: taskId, tenantId, version: expected },
      data: {
        status: task.status,
        startedAt: task.startedAt,
        version: task.version,
        updatedAt: task.updatedAt,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictError("Task version conflict", "task_version_conflict");
    }
  }
}

async function snapshotExecutionFromTemplate(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    propertyId: string;
    unitId: string | null;
    cleaningLocationId: string | null;
    taskId: string;
    actorUserId: string;
    now: Date;
  },
): Promise<CleaningExecutionDetail> {
  const template = await tx.cleaningChecklistTemplate.findFirst({
    where: {
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      isActive: true,
    },
    include: {
      items: { where: { isActive: true }, orderBy: { position: "asc" } },
    },
  });

  const executionId = randomUUID();
  await tx.cleaningExecution.create({
    data: {
      id: executionId,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      unitId: input.unitId,
      cleaningLocationId: input.cleaningLocationId,
      taskId: input.taskId,
      templateId: template?.id ?? null,
      templateVersion: template?.version ?? null,
      status: "IN_PROGRESS",
      startedByUserId: input.actorUserId,
      startedAt: input.now,
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    },
  });

  if (template && template.items.length > 0) {
    await tx.cleaningExecutionItem.createMany({
      data: template.items.map((item, index) => ({
        id: randomUUID(),
        tenantId: input.tenantId,
        executionId,
        sourceTemplateItemId: item.id,
        labelSnapshot: item.label,
        descriptionSnapshot: item.description,
        position: index,
        required: item.required,
        photoRequired: item.photoRequired,
        checked: false,
        createdAt: input.now,
        updatedAt: input.now,
      })),
    });
  }

  const detail = await loadExecutionDetail(tx, input.tenantId, executionId);
  if (!detail) throw new Error("Cleaning execution vanished mid-transaction");
  return detail;
}

async function markLocationCleanInTx(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    propertyId: string;
    locationId: string;
    actorUserId: string;
    now: Date;
  },
): Promise<void> {
  let statusRow = await tx.cleaningLocationStatus.findFirst({
    where: {
      tenantId: input.tenantId,
      cleaningLocationId: input.locationId,
    },
  });
  if (!statusRow) {
    const init = createCleaningLocationStatus({
      cleaningLocationId: input.locationId,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      status: "CLEAN",
      source: "INIT",
      updatedByUserId: input.actorUserId,
      now: input.now,
    });
    try {
      statusRow = await tx.cleaningLocationStatus.create({
        data: {
          cleaningLocationId: init.cleaningLocationId,
          tenantId: init.tenantId,
          propertyId: init.propertyId,
          status: init.status,
          source: init.source,
          updatedByUserId: init.updatedByUserId,
          updatedAt: init.updatedAt,
          version: init.version,
        },
      });
    } catch {
      statusRow = await tx.cleaningLocationStatus.findFirst({
        where: {
          tenantId: input.tenantId,
          cleaningLocationId: input.locationId,
        },
      });
    }
  }
  if (!statusRow) return;

  const current = {
    cleaningLocationId: statusRow.cleaningLocationId,
    tenantId: statusRow.tenantId,
    propertyId: statusRow.propertyId,
    status: statusRow.status as UnitHousekeepingStatusValue,
    source: statusRow.source as UnitHousekeepingSource,
    updatedByUserId: statusRow.updatedByUserId,
    updatedAt: statusRow.updatedAt,
    version: statusRow.version,
  };
  const result = markCleaningLocationClean(
    current,
    current.version,
    "TASK_COMPLETE",
    input.actorUserId,
    input.now,
  );
  if (!result.changed) return;

  const updated = await tx.cleaningLocationStatus.updateMany({
    where: {
      cleaningLocationId: input.locationId,
      tenantId: input.tenantId,
      version: current.version,
    },
    data: {
      status: result.record.status,
      source: result.record.source,
      updatedByUserId: result.record.updatedByUserId,
      updatedAt: result.record.updatedAt,
      version: result.record.version,
    },
  });
  if (updated.count !== 1) {
    throw new ConflictError(
      "Cleaning location status version conflict",
      "cleaning_location_status_version_conflict",
    );
  }
}

export class PrismaCleaningExecutionRepository
  implements ICleaningExecutionRepository
{
  constructor(private readonly turnoverStore: IHousekeepingTurnoverStore) {}

  async findById(
    tenantId: string,
    executionId: string,
  ): Promise<CleaningExecutionDetail | null> {
    return withTenantTransaction(tenantId, (tx) =>
      loadExecutionDetail(tx, tenantId, executionId),
    );
  }

  async resolveContext(
    tenantId: string,
    input: { unitId?: string; locationId?: string },
  ): Promise<CleaningContextSnapshot | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      if (input.locationId) {
        return this.resolveContextForLocation(tx, tenantId, input.locationId);
      }
      if (input.unitId) {
        return this.resolveContextForUnit(tx, tenantId, input.unitId);
      }
      return null;
    });
  }

  private async resolveContextForLocation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
  ): Promise<CleaningContextSnapshot | null> {
    const location = await tx.cleaningLocation.findFirst({
      where: { id: locationId, tenantId, status: "active" },
      include: {
        property: { select: { id: true, name: true, timezone: true } },
      },
    });
    if (!location) return null;

    const hk = await tx.cleaningLocationStatus.findFirst({
      where: { tenantId, cleaningLocationId: locationId },
    });
    const housekeepingStatus = (hk?.status ?? "CLEAN") as UnitHousekeepingStatusValue;

    const taskRows = await tx.task.findMany({
      where: {
        tenantId,
        cleaningLocationId: locationId,
        category: "HOUSEKEEPING",
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      orderBy: { createdAt: "asc" },
    });

    return this.buildContextFromTasks(tx, {
      tenantId,
      propertyId: location.property.id,
      propertyName: location.property.name,
      propertyTimezone: location.property.timezone,
      locationId: location.id,
      locationName: location.name,
      unitId: location.commercialUnitId,
      unitName: location.name,
      housekeepingStatus,
      housekeepingVersion: hk?.version ?? 0,
      taskRows,
    });
  }

  private async resolveContextForUnit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    unitId: string,
  ): Promise<CleaningContextSnapshot | null> {
    const linked = await tx.cleaningLocation.findFirst({
      where: { tenantId, commercialUnitId: unitId, status: "active" },
    });
    if (linked) {
      return this.resolveContextForLocation(tx, tenantId, linked.id);
    }

    const unit = await tx.unit.findFirst({
      where: { id: unitId, tenantId, deletedAt: null },
      include: { property: { select: { id: true, name: true, timezone: true } } },
    });
    if (!unit) return null;

    const hk = await tx.unitHousekeepingStatus.findFirst({
      where: { tenantId, unitId },
    });
    const housekeepingStatus = (hk?.status ?? "CLEAN") as UnitHousekeepingStatusValue;

    const taskRows = await tx.task.findMany({
      where: {
        tenantId,
        unitId,
        category: "HOUSEKEEPING",
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      orderBy: { createdAt: "asc" },
    });

    return this.buildContextFromTasks(tx, {
      tenantId,
      propertyId: unit.property.id,
      propertyName: unit.property.name,
      propertyTimezone: unit.property.timezone,
      locationId: null,
      locationName: null,
      unitId: unit.id,
      unitName: unit.name,
      housekeepingStatus,
      housekeepingVersion: hk?.version ?? 0,
      taskRows,
    });
  }

  private async buildContextFromTasks(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      propertyId: string;
      propertyName: string;
      propertyTimezone: string;
      locationId: string | null;
      locationName: string | null;
      unitId: string | null;
      unitName: string;
      housekeepingStatus: UnitHousekeepingStatusValue;
      housekeepingVersion: number;
      taskRows: Array<{
        id: string;
        title: string;
        status: string;
        source: string;
        dueAt: Date | null;
        version: number;
        createdAt: Date;
      }>;
    },
  ): Promise<CleaningContextSnapshot> {
    const selection = selectCleaningTask({
      housekeepingStatus: input.housekeepingStatus,
      tasks: input.taskRows.map((row) => ({
        id: row.id,
        status: row.status as never,
        source: row.source as never,
        createdAt: row.createdAt,
      })),
    });

    const selectedRow =
      selection.kind === "EXISTING"
        ? input.taskRows.find((row) => row.id === selection.taskId)
        : undefined;

    let activeExecution: CleaningExecutionDetail | null = null;
    if (selectedRow) {
      const row = await tx.cleaningExecution.findFirst({
        where: {
          tenantId: input.tenantId,
          taskId: selectedRow.id,
          status: "IN_PROGRESS",
        },
        include: {
          items: { orderBy: { position: "asc" } },
          photos: { orderBy: { createdAt: "asc" } },
        },
      });
      if (row) {
        const { items, photos, ...rest } = row as ExecutionRow & {
          items: ExecutionItemRow[];
          photos: PhotoRow[];
        };
        activeExecution = mapExecution(rest, items, photos);
      }
    }

    return {
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      propertyName: input.propertyName,
      propertyTimezone: input.propertyTimezone,
      locationId: input.locationId,
      locationName: input.locationName,
      unitId: input.unitId,
      unitName: input.unitName,
      housekeepingStatus: input.housekeepingStatus,
      housekeepingVersion: input.housekeepingVersion,
      selection,
      task: selectedRow
        ? {
            id: selectedRow.id,
            title: selectedRow.title,
            status: selectedRow.status,
            source: selectedRow.source,
            dueAt: selectedRow.dueAt,
            version: selectedRow.version,
          }
        : null,
      activeExecution,
    };
  }

  async startOrResume(
    command: StartOrResumeCleaningCommand,
  ): Promise<StartOrResumeCleaningResult> {
    const now = command.now ?? new Date();

    if (command.cleaningLocationId) {
      return this.startOrResumeForLocation({
        tenantId: command.tenantId,
        locationId: command.cleaningLocationId,
        actorUserId: command.actorUserId,
        now,
      });
    }

    if (!command.unitId) {
      throw new ValidationError("Provide either locationId or unitId");
    }

    // Prefer linked CleaningLocation when the legacy unit path is used.
    const linked = await withTenantTransaction(command.tenantId, async (tx) => {
      return tx.cleaningLocation.findFirst({
        where: {
          tenantId: command.tenantId,
          commercialUnitId: command.unitId,
          status: "active",
        },
        select: { id: true },
      });
    });
    if (linked) {
      return this.startOrResumeForLocation({
        tenantId: command.tenantId,
        locationId: linked.id,
        actorUserId: command.actorUserId,
        now,
      });
    }
    return this.startOrResumeForUnitLegacy(command, now);
  }

  private async startOrResumeForLocation(input: {
    tenantId: string;
    locationId: string;
    actorUserId: string;
    now: Date;
  }): Promise<StartOrResumeCleaningResult> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM cleaning_locations
        WHERE id = ${input.locationId}::uuid
          AND tenant_id = ${input.tenantId}::uuid
        FOR UPDATE
      `;

      const location = await tx.cleaningLocation.findFirst({
        where: {
          id: input.locationId,
          tenantId: input.tenantId,
          status: "active",
        },
        select: {
          id: true,
          propertyId: true,
          commercialUnitId: true,
          name: true,
        },
      });
      if (!location) {
        throw new NotFoundError("Cleaning location", input.locationId);
      }

      let hk = await tx.cleaningLocationStatus.findFirst({
        where: {
          tenantId: input.tenantId,
          cleaningLocationId: input.locationId,
        },
      });
      if (!hk) {
        const init = createCleaningLocationStatus({
          cleaningLocationId: input.locationId,
          tenantId: input.tenantId,
          propertyId: location.propertyId,
          status: "CLEAN",
          source: "INIT",
          updatedByUserId: input.actorUserId,
          now: input.now,
        });
        try {
          hk = await tx.cleaningLocationStatus.create({
            data: {
              cleaningLocationId: init.cleaningLocationId,
              tenantId: init.tenantId,
              propertyId: init.propertyId,
              status: init.status,
              source: init.source,
              updatedByUserId: init.updatedByUserId,
              updatedAt: init.updatedAt,
              version: init.version,
            },
          });
        } catch {
          hk = await tx.cleaningLocationStatus.findFirst({
            where: {
              tenantId: input.tenantId,
              cleaningLocationId: input.locationId,
            },
          });
        }
      }
      const housekeepingStatus = (hk?.status ?? "CLEAN") as UnitHousekeepingStatusValue;

      const taskRows = await tx.task.findMany({
        where: {
          tenantId: input.tenantId,
          cleaningLocationId: input.locationId,
          category: "HOUSEKEEPING",
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
        orderBy: { createdAt: "asc" },
      });

      const selection = selectCleaningTask({
        housekeepingStatus,
        tasks: taskRows.map((row) => ({
          id: row.id,
          status: row.status as never,
          source: row.source as never,
          createdAt: row.createdAt,
        })),
      });

      if (selection.kind === "NO_WORK") {
        throw new ValidationError(
          "This location is already clean — no cleaning is due",
        );
      }

      let taskCreated = false;
      let taskId: string;

      if (selection.kind === "CREATE_MANUAL") {
        const task = Task.create({
          id: randomUUID(),
          tenantId: input.tenantId,
          propertyId: location.propertyId,
          unitId: location.commercialUnitId,
          category: "HOUSEKEEPING",
          title: QR_MANUAL_CLEANING_TASK_TITLE,
          source: "MANUAL",
          createdByUserId: input.actorUserId,
          now: input.now,
        });
        const props = task.toProps();
        await tx.task.create({
          data: {
            id: props.id,
            tenantId: props.tenantId,
            propertyId: props.propertyId,
            unitId: props.unitId,
            cleaningLocationId: location.id,
            bookingId: props.bookingId,
            guestId: props.guestId,
            category: props.category,
            title: props.title,
            description: props.description,
            status: props.status,
            priority: props.priority,
            assignedToUserId: props.assignedToUserId,
            dueAt: props.dueAt,
            startedAt: props.startedAt,
            completedAt: props.completedAt,
            completionNote: props.completionNote,
            source: props.source,
            sourceKey: props.sourceKey,
            version: props.version,
            createdByUserId: props.createdByUserId,
            createdAt: props.createdAt,
            updatedAt: props.updatedAt,
          },
        });
        taskId = props.id;
        taskCreated = true;
      } else {
        taskId = selection.taskId;
      }

      const existing = await tx.cleaningExecution.findFirst({
        where: {
          tenantId: input.tenantId,
          taskId,
          status: "IN_PROGRESS",
        },
      });
      if (existing) {
        const detail = await loadExecutionDetail(tx, input.tenantId, existing.id);
        if (!detail) throw new Error("Cleaning execution vanished mid-transaction");
        return { execution: detail, created: false, taskCreated, taskId };
      }

      await startTaskIfOpen(tx, input.tenantId, taskId, input.now);

      const detail = await snapshotExecutionFromTemplate(tx, {
        tenantId: input.tenantId,
        propertyId: location.propertyId,
        unitId: location.commercialUnitId,
        cleaningLocationId: location.id,
        taskId,
        actorUserId: input.actorUserId,
        now: input.now,
      });
      return { execution: detail, created: true, taskCreated, taskId };
    });
  }

  private async startOrResumeForUnitLegacy(
    command: StartOrResumeCleaningCommand,
    now: Date,
  ): Promise<StartOrResumeCleaningResult> {
    const unitId = command.unitId!;
    return withTenantTransaction(command.tenantId, async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM units
        WHERE id = ${unitId}::uuid AND tenant_id = ${command.tenantId}::uuid
        FOR UPDATE
      `;

      const unit = await tx.unit.findFirst({
        where: { id: unitId, tenantId: command.tenantId, deletedAt: null },
        select: { id: true, propertyId: true },
      });
      if (!unit) {
        throw new NotFoundError("Unit", unitId);
      }

      const hk = await tx.unitHousekeepingStatus.findFirst({
        where: { tenantId: command.tenantId, unitId },
      });
      const housekeepingStatus = (hk?.status ?? "CLEAN") as UnitHousekeepingStatusValue;

      const taskRows = await tx.task.findMany({
        where: {
          tenantId: command.tenantId,
          unitId,
          category: "HOUSEKEEPING",
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
        orderBy: { createdAt: "asc" },
      });

      const selection = selectCleaningTask({
        housekeepingStatus,
        tasks: taskRows.map((row) => ({
          id: row.id,
          status: row.status as never,
          source: row.source as never,
          createdAt: row.createdAt,
        })),
      });

      if (selection.kind === "NO_WORK") {
        throw new ValidationError(
          "This unit is already clean — no cleaning is due",
        );
      }

      let taskCreated = false;
      let taskId: string;

      if (selection.kind === "CREATE_MANUAL") {
        const task = Task.create({
          id: randomUUID(),
          tenantId: command.tenantId,
          propertyId: unit.propertyId,
          unitId,
          category: "HOUSEKEEPING",
          title: QR_MANUAL_CLEANING_TASK_TITLE,
          source: "MANUAL",
          createdByUserId: command.actorUserId,
          now,
        });
        const props = task.toProps();
        await tx.task.create({
          data: {
            id: props.id,
            tenantId: props.tenantId,
            propertyId: props.propertyId,
            unitId: props.unitId,
            bookingId: props.bookingId,
            guestId: props.guestId,
            category: props.category,
            title: props.title,
            description: props.description,
            status: props.status,
            priority: props.priority,
            assignedToUserId: props.assignedToUserId,
            dueAt: props.dueAt,
            startedAt: props.startedAt,
            completedAt: props.completedAt,
            completionNote: props.completionNote,
            source: props.source,
            sourceKey: props.sourceKey,
            version: props.version,
            createdByUserId: props.createdByUserId,
            createdAt: props.createdAt,
            updatedAt: props.updatedAt,
          },
        });
        taskId = props.id;
        taskCreated = true;
      } else {
        taskId = selection.taskId;
      }

      const existing = await tx.cleaningExecution.findFirst({
        where: { tenantId: command.tenantId, taskId, status: "IN_PROGRESS" },
      });
      if (existing) {
        const detail = await loadExecutionDetail(tx, command.tenantId, existing.id);
        if (!detail) throw new Error("Cleaning execution vanished mid-transaction");
        return { execution: detail, created: false, taskCreated, taskId };
      }

      await startTaskIfOpen(tx, command.tenantId, taskId, now);

      const detail = await snapshotExecutionFromTemplate(tx, {
        tenantId: command.tenantId,
        propertyId: unit.propertyId,
        unitId,
        cleaningLocationId: null,
        taskId,
        actorUserId: command.actorUserId,
        now,
      });
      return { execution: detail, created: true, taskCreated, taskId };
    });
  }

  async updateItem(
    command: UpdateCleaningItemCommand,
  ): Promise<CleaningExecutionItemRecord> {
    const now = command.now ?? new Date();

    return withTenantTransaction(command.tenantId, async (tx) => {
      const execution = await tx.cleaningExecution.findFirst({
        where: { id: command.executionId, tenantId: command.tenantId },
        select: { status: true },
      });
      if (!execution) {
        throw new NotFoundError("Cleaning execution", command.executionId);
      }
      if (execution.status !== "IN_PROGRESS") {
        throw new ValidationError("This cleaning is already completed");
      }

      const updated = await tx.cleaningExecutionItem.updateMany({
        where: {
          id: command.itemId,
          tenantId: command.tenantId,
          executionId: command.executionId,
        },
        data: {
          checked: command.checked,
          checkedAt: command.checked ? now : null,
          checkedByUserId: command.checked ? command.actorUserId : null,
          updatedAt: now,
        },
      });
      if (updated.count !== 1) {
        throw new NotFoundError("Cleaning checklist item", command.itemId);
      }

      const row = await tx.cleaningExecutionItem.findFirst({
        where: { id: command.itemId, tenantId: command.tenantId },
      });
      if (!row) throw new NotFoundError("Cleaning checklist item", command.itemId);
      return mapExecutionItem(row as ExecutionItemRow);
    });
  }

  async complete(
    command: CompleteCleaningCommand,
  ): Promise<CompleteCleaningResult> {
    const now = command.now ?? new Date();

    return withTenantTransaction(command.tenantId, async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{
          id: string;
          task_id: string;
          property_id: string;
          unit_id: string | null;
          cleaning_location_id: string | null;
          status: string;
          version: number;
        }>
      >`
        SELECT id, task_id, property_id, unit_id, cleaning_location_id, status, version
        FROM cleaning_executions
        WHERE id = ${command.executionId}::uuid
          AND tenant_id = ${command.tenantId}::uuid
        FOR UPDATE
      `;
      const execution = locked[0];
      if (!execution) {
        throw new NotFoundError("Cleaning execution", command.executionId);
      }
      if (execution.status !== "IN_PROGRESS") {
        throw new ValidationError("This cleaning is already completed");
      }
      if (execution.version !== command.expectedVersion) {
        throw new ConflictError(
          "Cleaning execution version conflict",
          "cleaning_execution_version_conflict",
        );
      }

      const [itemRows, photoRows, template] = await Promise.all([
        tx.cleaningExecutionItem.findMany({
          where: { tenantId: command.tenantId, executionId: command.executionId },
          orderBy: { position: "asc" },
        }),
        tx.cleaningPhoto.findMany({
          where: { tenantId: command.tenantId, executionId: command.executionId },
          orderBy: { createdAt: "asc" },
        }),
        tx.cleaningChecklistTemplate.findFirst({
          where: {
            tenantId: command.tenantId,
            propertyId: execution.property_id,
            isActive: true,
          },
          select: { minimumCompletionPhotos: true },
        }),
      ]);

      const items = (itemRows as ExecutionItemRow[]).map(mapExecutionItem);
      const photos: CleaningPhotoRecord[] = (photoRows as PhotoRow[]).map(mapPhoto);
      assertCleaningCompletable({
        items,
        photos,
        minimumCompletionPhotos: template?.minimumCompletionPhotos ?? 0,
      });

      const updated = await tx.cleaningExecution.updateMany({
        where: {
          id: command.executionId,
          tenantId: command.tenantId,
          version: command.expectedVersion,
          status: "IN_PROGRESS",
        },
        data: {
          status: "COMPLETED",
          completedAt: now,
          completedByUserId: command.actorUserId,
          version: command.expectedVersion + 1,
          updatedAt: now,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictError(
          "Cleaning execution version conflict",
          "cleaning_execution_version_conflict",
        );
      }

      const taskRow = await tx.task.findFirst({
        where: { id: execution.task_id, tenantId: command.tenantId },
        select: { version: true, status: true },
      });
      if (!taskRow) {
        throw new NotFoundError("Task", execution.task_id);
      }

      // Completes the HK task and, when unitId is set, marks UnitHousekeeping CLEAN.
      const housekeepingResult = await this.turnoverStore.completeHousekeepingTask({
        tenantId: command.tenantId,
        taskId: execution.task_id,
        expectedVersion: taskRow.version,
        completionNote: command.completionNote ?? null,
        actorUserId: command.actorUserId,
        now,
      });

      if (execution.cleaning_location_id) {
        await markLocationCleanInTx(tx, {
          tenantId: command.tenantId,
          propertyId: execution.property_id,
          locationId: execution.cleaning_location_id,
          actorUserId: command.actorUserId,
          now,
        });
      }

      const detail = await loadExecutionDetail(tx, command.tenantId, command.executionId);
      if (!detail) throw new Error("Cleaning execution vanished mid-transaction");

      return {
        execution: detail,
        task: housekeepingResult.task,
        housekeeping: housekeepingResult.housekeeping,
      };
    });
  }

  async listHistory(
    filters: ListCleaningHistoryFilters,
  ): Promise<PaginatedCleaningHistory> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    return withTenantTransaction(filters.tenantId, async (tx) => {
      const where: Record<string, unknown> = { tenantId: filters.tenantId };

      if (
        filters.allowedPropertyIds !== null &&
        filters.allowedPropertyIds !== undefined
      ) {
        if (filters.allowedPropertyIds.length === 0) {
          return { data: [], page, limit, total: 0 };
        }
        where.propertyId = { in: filters.allowedPropertyIds };
      }
      if (filters.propertyId) where.propertyId = filters.propertyId;
      if (filters.unitId) where.unitId = filters.unitId;
      if (filters.cleaningLocationId) {
        where.cleaningLocationId = filters.cleaningLocationId;
      }

      const [total, rows] = await Promise.all([
        tx.cleaningExecution.count({ where }),
        tx.cleaningExecution.findMany({
          where,
          orderBy: { startedAt: "desc" },
          skip,
          take: limit,
          include: {
            unit: { select: { name: true } },
            cleaningLocation: { select: { name: true } },
            property: { select: { name: true } },
            task: { select: { title: true } },
            items: { select: { checked: true } },
            _count: { select: { photos: true } },
          },
        }),
      ]);

      const data: CleaningHistoryEntry[] = rows.map((row) => {
        const typed = row as ExecutionRow & {
          unit: { name: string } | null;
          cleaningLocation: { name: string } | null;
          property: { name: string };
          task: { title: string };
          items: Array<{ checked: boolean }>;
          _count: { photos: number };
        };
        return {
          id: typed.id,
          tenantId: typed.tenantId,
          propertyId: typed.propertyId,
          unitId: typed.unitId,
          cleaningLocationId: typed.cleaningLocationId,
          taskId: typed.taskId,
          templateId: typed.templateId,
          templateVersion: typed.templateVersion,
          status: typed.status as CleaningExecutionStatus,
          startedByUserId: typed.startedByUserId,
          startedAt: typed.startedAt,
          completedByUserId: typed.completedByUserId,
          completedAt: typed.completedAt,
          version: typed.version,
          createdAt: typed.createdAt,
          updatedAt: typed.updatedAt,
          unitName:
            typed.cleaningLocation?.name ??
            typed.unit?.name ??
            "—",
          propertyName: typed.property.name,
          taskTitle: typed.task.title,
          itemsTotal: typed.items.length,
          itemsChecked: typed.items.filter((item) => item.checked).length,
          photoCount: typed._count.photos,
        };
      });

      return { data, page, limit, total };
    });
  }
}

export { mapExecution, mapExecutionItem };
