import { NextRequest } from "next/server";

import { activateTenantUseCase } from "@/lib/di/container";

import { requireSuperAdmin, serializeTenant, getClientIp } from "@/lib/tenant-context";

import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";



interface RouteParams {

  params: Promise<{ tenantId: string }>;

}



export async function POST(request: NextRequest, { params }: RouteParams) {

  try {

    const actor = await requireSuperAdmin();

    const { tenantId } = await params;

    const result = await activateTenantUseCase.execute(tenantId, {

      actorId: actor.userId,

      ipAddress: getClientIp(request),

    });



    if (result.isFailure) {

      return mapResultError(result.getError());

    }



    return apiSuccess(serializeTenant(result.getValue()));

  } catch (error) {

    return apiError(error);

  }

}


