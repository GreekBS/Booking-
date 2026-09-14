import { NextRequest } from "next/server";
import {
  createPublishableKeySchema,
} from "@hcp/validators";
import {
  listPublishableKeysUseCase,
  createPublishableKeyUseCase,
  generatePublishableKey,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

function serializeKey(key: {
  id: string;
  keyPrefix: string;
  environment: string;
  allowedDomains: string[];
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: key.id,
    keyPrefix: key.keyPrefix,
    environment: key.environment,
    allowedDomains: key.allowedDomains,
    isActive: key.isActive,
    createdAt: key.createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await listPublishableKeysUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ data: result.getValue().map(serializeKey) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = createPublishableKeySchema.parse(await request.json());
    const { rawKey } = generatePublishableKey(body.environment);

    const result = await createPublishableKeyUseCase.execute(
      {
        tenantId: actor.tenantId,
        environment: body.environment,
        allowedDomains: body.allowedDomains,
        rawKey,
      },
      toPermissionActor(actor),
      { actorId: actor.userId, ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const created = result.getValue();
    return apiSuccess(
      {
        id: created.id,
        publishableKey: created.publishableKey,
        environment: created.environment,
        allowedDomains: created.allowedDomains,
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
