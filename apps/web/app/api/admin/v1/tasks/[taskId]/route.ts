import { NextRequest } from "next/server";
import {
  assignTaskBodySchema,
  completeTaskBodySchema,
  taskVersionBodySchema,
} from "@hcp/validators";
import {
  assignTaskUseCase,
  cancelTaskUseCase,
  completeTaskUseCase,
  getTaskUseCase,
  reopenTaskUseCase,
  startTaskUseCase,
  unstartTaskUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { ValidationError } from "@hcp/domain";

type RouteContext = { params: Promise<{ taskId: string }> };

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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { taskId } = await context.params;
    const result = await getTaskUseCase.execute(
      { tenantId: actor.tenantId, taskId },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({ data: serializeTask(result.getValue()) });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { taskId } = await context.params;
    const action = request.nextUrl.searchParams.get("action");
    const body = await request.json().catch(() => ({}));
    const ip = { ipAddress: getClientIp(request) };
    const actorCtx = toPermissionActor(actor);

    if (action === "start") {
      const parsed = taskVersionBodySchema.parse(body);
      const result = await startTaskUseCase.execute(
        {
          tenantId: actor.tenantId,
          taskId,
          expectedVersion: parsed.expectedVersion,
        },
        actorCtx,
        ip,
      );
      if (result.isFailure) return mapResultError(result.getError());
      return apiSuccess({ data: serializeTask(result.getValue()) });
    }
    if (action === "unstart") {
      const parsed = taskVersionBodySchema.parse(body);
      const result = await unstartTaskUseCase.execute(
        {
          tenantId: actor.tenantId,
          taskId,
          expectedVersion: parsed.expectedVersion,
        },
        actorCtx,
        ip,
      );
      if (result.isFailure) return mapResultError(result.getError());
      return apiSuccess({ data: serializeTask(result.getValue()) });
    }
    if (action === "complete") {
      const parsed = completeTaskBodySchema.parse(body);
      const result = await completeTaskUseCase.execute(
        {
          tenantId: actor.tenantId,
          taskId,
          expectedVersion: parsed.expectedVersion,
          completionNote: parsed.completionNote,
        },
        actorCtx,
        ip,
      );
      if (result.isFailure) return mapResultError(result.getError());
      return apiSuccess({ data: serializeTask(result.getValue()) });
    }
    if (action === "cancel") {
      const parsed = taskVersionBodySchema.parse(body);
      const result = await cancelTaskUseCase.execute(
        {
          tenantId: actor.tenantId,
          taskId,
          expectedVersion: parsed.expectedVersion,
        },
        actorCtx,
        ip,
      );
      if (result.isFailure) return mapResultError(result.getError());
      return apiSuccess({ data: serializeTask(result.getValue()) });
    }
    if (action === "reopen") {
      const parsed = taskVersionBodySchema.parse(body);
      const result = await reopenTaskUseCase.execute(
        {
          tenantId: actor.tenantId,
          taskId,
          expectedVersion: parsed.expectedVersion,
        },
        actorCtx,
        ip,
      );
      if (result.isFailure) return mapResultError(result.getError());
      return apiSuccess({ data: serializeTask(result.getValue()) });
    }
    if (action === "assign") {
      const parsed = assignTaskBodySchema.parse(body);
      const result = await assignTaskUseCase.execute(
        {
          tenantId: actor.tenantId,
          taskId,
          expectedVersion: parsed.expectedVersion,
          assignedToUserId: parsed.assignedToUserId,
        },
        actorCtx,
        ip,
      );
      if (result.isFailure) return mapResultError(result.getError());
      return apiSuccess({ data: serializeTask(result.getValue()) });
    }

    return mapResultError(new ValidationError("Invalid action"));
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
