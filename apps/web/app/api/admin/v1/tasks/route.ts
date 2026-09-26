import { NextRequest } from "next/server";
import { createTaskBodySchema, listTasksQuerySchema } from "@hcp/validators";
import { createTaskUseCase, listTasksUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";

function serializeTask(task: {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string | null;
  bookingId: string | null;
  guestId: string | null;
  category: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedToUserId: string | null;
  dueAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  completionNote: string | null;
  source: string;
  sourceKey: string | null;
  version: number;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: task.id,
    tenantId: task.tenantId,
    propertyId: task.propertyId,
    unitId: task.unitId,
    bookingId: task.bookingId,
    guestId: task.guestId,
    category: task.category,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assignedToUserId: task.assignedToUserId,
    dueAt: task.dueAt?.toISOString() ?? null,
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    completionNote: task.completionNote,
    source: task.source,
    sourceKey: task.sourceKey,
    version: task.version,
    createdByUserId: task.createdByUserId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const raw = Object.fromEntries(request.nextUrl.searchParams);
    // Support repeated status/category query keys
    const statusAll = request.nextUrl.searchParams.getAll("status");
    const categoryAll = request.nextUrl.searchParams.getAll("category");
    const priorityAll = request.nextUrl.searchParams.getAll("priority");
    const query = listTasksQuerySchema.parse({
      ...raw,
      status: statusAll.length > 1 ? statusAll : raw.status,
      category: categoryAll.length > 1 ? categoryAll : raw.category,
      priority: priorityAll.length > 1 ? priorityAll : raw.priority,
    });

    const result = await listTasksUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId: query.propertyId,
        entireTenant: query.entireTenant,
        status: query.status,
        category: query.category,
        unitId: query.unitId,
        assignedToUserId: query.assignedToUserId,
        priority: query.priority,
        bookingId: query.bookingId,
        page: query.page,
        limit: query.limit,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const page = result.getValue();
    return apiSuccess({
      data: page.data.map(serializeTask),
      page: page.page,
      limit: page.limit,
      total: page.total,
    });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = createTaskBodySchema.parse(await request.json());

    const result = await createTaskUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId: body.propertyId,
        unitId: body.unitId,
        bookingId: body.bookingId,
        guestId: body.guestId,
        category: body.category,
        title: body.title,
        description: body.description,
        priority: body.priority,
        assignedToUserId: body.assignedToUserId,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ data: serializeTask(result.getValue()) }, 201);
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
