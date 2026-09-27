import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  ConflictError,
  NotFoundError,
  archiveCleaningLocation,
  createCleaningLocation,
  createCleaningLocationStatus,
  defaultBulkCleaningLocationName,
  markCleaningLocationClean,
  markCleaningLocationDirty,
  normalizeCleaningLocationName,
  renameCleaningLocation,
  type CleaningLocationBoardOpenTask,
  type CleaningLocationBoardRow,
  type CleaningLocationLifecycleStatus,
  type CleaningLocationRecord,
  type CleaningLocationStatusRecord,
  type ICleaningLocationRepository,
  type BulkCreateCleaningLocationsCommand,
  type AddCleaningLocationCommand,
  type RenameCleaningLocationCommand,
  type ArchiveCleaningLocationCommand,
  type MarkCleaningLocationStatusCommand,
  type UnitHousekeepingSource,
  type UnitHousekeepingStatusValue,
} from "@hcp/domain";
import { withTenantTransaction } from "../../../client";

type LocationRow = {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  status: string;
  sortOrder: number;
  commercialUnitId: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

type StatusRow = {
  cleaningLocationId: string;
  tenantId: string;
  propertyId: string;
  status: string;
  source: string;
  updatedByUserId: string | null;
  updatedAt: Date;
  version: number;
};

type BoardRawRow = {
  location_id: string;
  property_id: string;
  name: string;
  sort_order: number;
  commercial_unit_id: string | null;
  readiness_status: string | null;
  readiness_version: number | null;
  readiness_source: string | null;
  last_completed_at: Date | null;
  open_task_id: string | null;
  open_task_title: string | null;
  open_task_status: string | null;
  open_task_priority: string | null;
  has_active_qr: boolean;
};

function mapLocation(row: LocationRow): CleaningLocationRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    name: row.name,
    status: row.status as CleaningLocationLifecycleStatus,
    sortOrder: row.sortOrder,
    commercialUnitId: row.commercialUnitId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

function mapStatus(row: StatusRow): CleaningLocationStatusRecord {
  return {
    cleaningLocationId: row.cleaningLocationId,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    status: row.status as UnitHousekeepingStatusValue,
    source: row.source as UnitHousekeepingSource,
    updatedByUserId: row.updatedByUserId,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function compareBoardRows(
  a: CleaningLocationBoardRow,
  b: CleaningLocationBoardRow,
): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export class PrismaCleaningLocationRepository
  implements ICleaningLocationRepository
{
  async listActiveByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<CleaningLocationRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.cleaningLocation.findMany({
        where: { tenantId, propertyId, status: "active" },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      return (rows as LocationRow[])
        .map(mapLocation)
        .sort((a, b) =>
          a.sortOrder !== b.sortOrder
            ? a.sortOrder - b.sortOrder
            : a.name.localeCompare(b.name, undefined, {
                numeric: true,
                sensitivity: "base",
              }),
        );
    });
  }

  async findById(
    tenantId: string,
    locationId: string,
  ): Promise<CleaningLocationRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.cleaningLocation.findFirst({
        where: { id: locationId, tenantId },
      });
      return row ? mapLocation(row as LocationRow) : null;
    });
  }

  async findActiveByCommercialUnit(
    tenantId: string,
    unitId: string,
  ): Promise<CleaningLocationRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.cleaningLocation.findFirst({
        where: {
          tenantId,
          commercialUnitId: unitId,
          status: "active",
        },
      });
      return row ? mapLocation(row as LocationRow) : null;
    });
  }

  async countActiveByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<number> {
    return withTenantTransaction(tenantId, async (tx) => {
      return tx.cleaningLocation.count({
        where: { tenantId, propertyId, status: "active" },
      });
    });
  }

  async bulkCreate(
    command: BulkCreateCleaningLocationsCommand,
  ): Promise<CleaningLocationRecord[]> {
    const now = command.now ?? new Date();

    return withTenantTransaction(command.tenantId, async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM properties
        WHERE id = ${command.propertyId}::uuid
          AND tenant_id = ${command.tenantId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new NotFoundError("Property", command.propertyId);
      }

      const existing = await tx.cleaningLocation.count({
        where: {
          tenantId: command.tenantId,
          propertyId: command.propertyId,
          status: "active",
        },
      });
      if (existing > 0) {
        throw new ConflictError(
          "Cleaning locations already exist for this property",
          "cleaning_locations_already_initialized",
        );
      }

      const created: CleaningLocationRecord[] = [];
      for (let i = 1; i <= command.count; i += 1) {
        const record = createCleaningLocation({
          id: randomUUID(),
          tenantId: command.tenantId,
          propertyId: command.propertyId,
          name: defaultBulkCleaningLocationName(i),
          sortOrder: i - 1,
          now,
        });
        await tx.cleaningLocation.create({
          data: {
            id: record.id,
            tenantId: record.tenantId,
            propertyId: record.propertyId,
            name: record.name,
            status: record.status,
            sortOrder: record.sortOrder,
            commercialUnitId: null,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            archivedAt: null,
          },
        });
        const status = createCleaningLocationStatus({
          cleaningLocationId: record.id,
          tenantId: command.tenantId,
          propertyId: command.propertyId,
          status: "CLEAN",
          source: "INIT",
          // System/INIT rows must not FK to a user — matches UnitHousekeepingStatus.
          updatedByUserId: null,
          now,
        });
        await tx.cleaningLocationStatus.create({
          data: {
            cleaningLocationId: status.cleaningLocationId,
            tenantId: status.tenantId,
            propertyId: status.propertyId,
            status: status.status,
            source: status.source,
            updatedByUserId: status.updatedByUserId,
            updatedAt: status.updatedAt,
            version: status.version,
          },
        });
        created.push(record);
      }

      return created;
    });
  }

  async add(command: AddCleaningLocationCommand): Promise<CleaningLocationRecord> {
    const now = command.now ?? new Date();
    const name = normalizeCleaningLocationName(command.name);

    return withTenantTransaction(command.tenantId, async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM properties
        WHERE id = ${command.propertyId}::uuid
          AND tenant_id = ${command.tenantId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new NotFoundError("Property", command.propertyId);
      }

      const maxSort = await tx.cleaningLocation.aggregate({
        where: {
          tenantId: command.tenantId,
          propertyId: command.propertyId,
          status: "active",
        },
        _max: { sortOrder: true },
      });
      const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

      const record = createCleaningLocation({
        id: randomUUID(),
        tenantId: command.tenantId,
        propertyId: command.propertyId,
        name,
        sortOrder,
        commercialUnitId: command.commercialUnitId ?? null,
        now,
      });

      try {
        await tx.cleaningLocation.create({
          data: {
            id: record.id,
            tenantId: record.tenantId,
            propertyId: record.propertyId,
            name: record.name,
            status: record.status,
            sortOrder: record.sortOrder,
            commercialUnitId: record.commercialUnitId,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            archivedAt: null,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            "An active cleaning location with this name already exists",
            "cleaning_location_name_conflict",
          );
        }
        throw error;
      }

      const status = createCleaningLocationStatus({
        cleaningLocationId: record.id,
        tenantId: command.tenantId,
        propertyId: command.propertyId,
        status: "CLEAN",
        source: "INIT",
        // System/INIT rows must not FK to a user — matches UnitHousekeepingStatus.
        updatedByUserId: null,
        now,
      });
      await tx.cleaningLocationStatus.create({
        data: {
          cleaningLocationId: status.cleaningLocationId,
          tenantId: status.tenantId,
          propertyId: status.propertyId,
          status: status.status,
          source: status.source,
          updatedByUserId: status.updatedByUserId,
          updatedAt: status.updatedAt,
          version: status.version,
        },
      });

      return record;
    });
  }

  async rename(
    command: RenameCleaningLocationCommand,
  ): Promise<CleaningLocationRecord> {
    const now = command.now ?? new Date();

    return withTenantTransaction(command.tenantId, async (tx) => {
      const existing = await tx.cleaningLocation.findFirst({
        where: { id: command.locationId, tenantId: command.tenantId },
      });
      if (!existing) {
        throw new NotFoundError("Cleaning location", command.locationId);
      }

      const renamed = renameCleaningLocation(
        mapLocation(existing as LocationRow),
        command.name,
        now,
      );

      try {
        const updated = await tx.cleaningLocation.updateMany({
          where: {
            id: command.locationId,
            tenantId: command.tenantId,
            status: "active",
          },
          data: { name: renamed.name, updatedAt: now },
        });
        if (updated.count !== 1) {
          throw new ConflictError(
            "Cannot rename an archived cleaning location",
            "cleaning_location_archived",
          );
        }
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            "An active cleaning location with this name already exists",
            "cleaning_location_name_conflict",
          );
        }
        throw error;
      }

      const row = await tx.cleaningLocation.findFirst({
        where: { id: command.locationId, tenantId: command.tenantId },
      });
      if (!row) throw new NotFoundError("Cleaning location", command.locationId);
      return mapLocation(row as LocationRow);
    });
  }

  async archive(
    command: ArchiveCleaningLocationCommand,
  ): Promise<CleaningLocationRecord> {
    const now = command.now ?? new Date();

    return withTenantTransaction(command.tenantId, async (tx) => {
      const existing = await tx.cleaningLocation.findFirst({
        where: { id: command.locationId, tenantId: command.tenantId },
      });
      if (!existing) {
        throw new NotFoundError("Cleaning location", command.locationId);
      }

      const archived = archiveCleaningLocation(
        mapLocation(existing as LocationRow),
        now,
      );
      if (archived.status === existing.status && existing.archivedAt) {
        return archived;
      }

      await tx.cleaningLocation.updateMany({
        where: { id: command.locationId, tenantId: command.tenantId },
        data: {
          status: "archived",
          archivedAt: now,
          updatedAt: now,
        },
      });

      const row = await tx.cleaningLocation.findFirst({
        where: { id: command.locationId, tenantId: command.tenantId },
      });
      if (!row) throw new NotFoundError("Cleaning location", command.locationId);
      return mapLocation(row as LocationRow);
    });
  }

  async getBoard(
    tenantId: string,
    propertyId: string,
  ): Promise<CleaningLocationBoardRow[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.$queryRaw<BoardRawRow[]>`
        SELECT
          loc.id AS location_id,
          loc.property_id,
          loc.name,
          loc.sort_order,
          loc.commercial_unit_id,
          st.status AS readiness_status,
          st.version AS readiness_version,
          st.source AS readiness_source,
          last_exec.completed_at AS last_completed_at,
          open_task.id AS open_task_id,
          open_task.title AS open_task_title,
          open_task.status AS open_task_status,
          open_task.priority AS open_task_priority,
          EXISTS (
            SELECT 1
            FROM cleaning_location_qr_access qr
            WHERE qr.tenant_id = loc.tenant_id
              AND qr.cleaning_location_id = loc.id
              AND qr.status = 'ACTIVE'
          ) AS has_active_qr
        FROM cleaning_locations loc
        LEFT JOIN cleaning_location_statuses st
          ON st.cleaning_location_id = loc.id
         AND st.tenant_id = loc.tenant_id
        LEFT JOIN LATERAL (
          SELECT ce.completed_at
          FROM cleaning_executions ce
          WHERE ce.tenant_id = loc.tenant_id
            AND ce.cleaning_location_id = loc.id
            AND ce.status = 'COMPLETED'
          ORDER BY ce.completed_at DESC NULLS LAST
          LIMIT 1
        ) last_exec ON TRUE
        LEFT JOIN LATERAL (
          SELECT t.id, t.title, t.status, t.priority
          FROM tasks t
          WHERE t.tenant_id = loc.tenant_id
            AND t.cleaning_location_id = loc.id
            AND t.category = 'HOUSEKEEPING'
            AND t.status IN ('OPEN', 'IN_PROGRESS')
          ORDER BY t.created_at ASC
          LIMIT 1
        ) open_task ON TRUE
        WHERE loc.tenant_id = ${tenantId}::uuid
          AND loc.property_id = ${propertyId}::uuid
          AND loc.status = 'active'
      `;

      const mapped: CleaningLocationBoardRow[] = rows.map((row) => {
        const openTask: CleaningLocationBoardOpenTask | null =
          row.open_task_id &&
          row.open_task_title &&
          row.open_task_status &&
          row.open_task_priority
            ? {
                id: row.open_task_id,
                title: row.open_task_title,
                status: row.open_task_status,
                priority: row.open_task_priority,
              }
            : null;

        return {
          locationId: row.location_id,
          propertyId: row.property_id,
          name: row.name,
          sortOrder: row.sort_order,
          commercialUnitId: row.commercial_unit_id,
          readinessStatus: (row.readiness_status ?? "CLEAN") as UnitHousekeepingStatusValue,
          readinessVersion: row.readiness_version ?? 0,
          readinessSource: (row.readiness_source ?? "INIT") as UnitHousekeepingSource,
          lastCompletedAt: row.last_completed_at,
          openTask,
          hasActiveQr: Boolean(row.has_active_qr),
        };
      });

      return mapped.sort(compareBoardRows);
    });
  }

  async ensureStatusInitialized(input: {
    tenantId: string;
    propertyId: string;
    locationId: string;
  }): Promise<CleaningLocationStatusRecord> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const existing = await tx.cleaningLocationStatus.findFirst({
        where: {
          tenantId: input.tenantId,
          cleaningLocationId: input.locationId,
        },
      });
      if (existing) {
        return mapStatus(existing as StatusRow);
      }

      const location = await tx.cleaningLocation.findFirst({
        where: { id: input.locationId, tenantId: input.tenantId },
        select: { id: true, propertyId: true },
      });
      if (!location) {
        throw new NotFoundError("Cleaning location", input.locationId);
      }

      const now = new Date();
      const status = createCleaningLocationStatus({
        cleaningLocationId: input.locationId,
        tenantId: input.tenantId,
        propertyId: location.propertyId,
        status: "CLEAN",
        source: "INIT",
        now,
      });

      try {
        const created = await tx.cleaningLocationStatus.create({
          data: {
            cleaningLocationId: status.cleaningLocationId,
            tenantId: status.tenantId,
            propertyId: status.propertyId,
            status: status.status,
            source: status.source,
            updatedByUserId: status.updatedByUserId,
            updatedAt: status.updatedAt,
            version: status.version,
          },
        });
        return mapStatus(created as StatusRow);
      } catch {
        const again = await tx.cleaningLocationStatus.findFirst({
          where: {
            tenantId: input.tenantId,
            cleaningLocationId: input.locationId,
          },
        });
        if (!again) {
          throw new Error("Failed to initialize cleaning location status");
        }
        return mapStatus(again as StatusRow);
      }
    });
  }

  async markClean(
    command: MarkCleaningLocationStatusCommand,
  ): Promise<CleaningLocationStatusRecord> {
    return this.markStatus(command, "CLEAN");
  }

  async markDirty(
    command: MarkCleaningLocationStatusCommand,
  ): Promise<CleaningLocationStatusRecord> {
    return this.markStatus(command, "DIRTY");
  }

  private async markStatus(
    command: MarkCleaningLocationStatusCommand,
    target: "CLEAN" | "DIRTY",
  ): Promise<CleaningLocationStatusRecord> {
    const now = command.now ?? new Date();

    return withTenantTransaction(command.tenantId, async (tx) => {
      const existing = await tx.cleaningLocationStatus.findFirst({
        where: {
          tenantId: command.tenantId,
          cleaningLocationId: command.locationId,
        },
      });
      if (!existing) {
        throw new NotFoundError("Cleaning location status", command.locationId);
      }

      const current = mapStatus(existing as StatusRow);
      const result =
        target === "CLEAN"
          ? markCleaningLocationClean(
              current,
              command.expectedVersion,
              command.source,
              command.updatedByUserId,
              now,
            )
          : markCleaningLocationDirty(
              current,
              command.expectedVersion,
              command.source,
              command.updatedByUserId,
              now,
            );

      if (!result.changed) {
        return result.record;
      }

      const updated = await tx.cleaningLocationStatus.updateMany({
        where: {
          cleaningLocationId: command.locationId,
          tenantId: command.tenantId,
          version: command.expectedVersion,
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

      return result.record;
    });
  }
}
