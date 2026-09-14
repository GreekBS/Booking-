import { NextRequest } from "next/server";

import { updateTenantSchema } from "@hcp/validators";

import { getTenantUseCase, updateTenantUseCase } from "@/lib/di/container";

import {

  requireSuperAdmin,

  serializeTenant,

  getClientIp,

} from "@/lib/tenant-context";

import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";



interface RouteParams {

  params: Promise<{ tenantId: string }>;

}



export async function GET(_request: NextRequest, { params }: RouteParams) {

  try {

    await requireSuperAdmin();

    const { tenantId } = await params;



    const result = await getTenantUseCase.execute(tenantId);

    if (result.isFailure) {

      return mapResultError(result.getError());

    }



    const { tenant, propertyCount } = result.getValue();

    return apiSuccess({

      ...serializeTenant(tenant),

      propertyCount,

    });

  } catch (error) {

    return apiError(error);

  }

}



export async function PATCH(request: NextRequest, { params }: RouteParams) {

  try {

    const actor = await requireSuperAdmin();

    const { tenantId } = await params;

    const body = updateTenantSchema.parse(await request.json());



    const result = await updateTenantUseCase.execute(

      { tenantId, ...body },

      { actorId: actor.userId, ipAddress: getClientIp(request) },

    );



    if (result.isFailure) {

      return mapResultError(result.getError());

    }



    return apiSuccess(serializeTenant(result.getValue()));

  } catch (error) {

    return apiError(error);

  }

}


