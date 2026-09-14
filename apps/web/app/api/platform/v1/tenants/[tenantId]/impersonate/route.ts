import { NextRequest } from "next/server";

import { impersonateTenantUseCase } from "@/lib/di/container";

import { requireSuperAdmin, getClientIp } from "@/lib/tenant-context";

import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";



interface RouteParams {

  params: Promise<{ tenantId: string }>;

}



export async function POST(request: NextRequest, { params }: RouteParams) {

  try {

    const actor = await requireSuperAdmin();

    const { tenantId } = await params;



    const result = await impersonateTenantUseCase.execute(

      actor.userId,

      tenantId,

      { actorId: actor.userId, ipAddress: getClientIp(request) },

    );



    if (result.isFailure) {

      return mapResultError(result.getError());

    }



    return apiSuccess({

      tenantId,

      impersonating: true,

    });

  } catch (error) {

    return apiError(error);

  }

}


