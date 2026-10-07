import { NextRequest } from "next/server";
import {
  createCopilotConversationUseCase,
  listCopilotConversationsUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import {
  createCopilotConversationBodySchema,
  listCopilotConversationsQuerySchema,
  toConversationDto,
} from "@/lib/copilot/copilot-api-schemas";

/** Create a private Copilot conversation owned by the authenticated operator. */
export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const raw: unknown = await request.json().catch(() => ({}));
    const body = createCopilotConversationBodySchema.parse(raw ?? {});

    const result = await createCopilotConversationUseCase.execute(
      {
        tenantId: actor.tenantId,
        activePropertyId: body.activePropertyId ?? null,
        title: body.title ?? null,
      },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(toConversationDto(result.getValue()), 201);
  } catch (error) {
    return apiError(error);
  }
}

/** List the authenticated operator's own conversations. */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const params = request.nextUrl.searchParams;
    const query = listCopilotConversationsQuerySchema.parse({
      status: params.get("status") ?? undefined,
      limit: params.get("limit") ?? undefined,
    });

    const result = await listCopilotConversationsUseCase.execute(
      {
        tenantId: actor.tenantId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({ conversations: result.getValue().map(toConversationDto) });
  } catch (error) {
    return apiError(error);
  }
}
