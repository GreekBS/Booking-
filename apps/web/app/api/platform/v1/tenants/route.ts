import { NextRequest } from "next/server";

import { createTenantSchema, paginationSchema } from "@hcp/validators";

import { createTenantUseCase, listTenantsUseCase } from "@/lib/di/container";

import {

  requireSuperAdmin,

  serializeTenant,

  getClientIp,

} from "@/lib/tenant-context";

import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";



export async function GET(request: NextRequest) {

  try {

    await requireSuperAdmin();

    const params = paginationSchema.parse(

      Object.fromEntries(request.nextUrl.searchParams),

    );



    const result = await listTenantsUseCase.execute(params);

    if (result.isFailure) {

      return mapResultError(result.getError());

    }



    const page = result.getValue();

    return apiSuccess({

      data: page.data.map(({ tenant, propertyCount }) => ({

        ...serializeTenant(tenant),

        propertyCount,

      })),

      meta: {

        total: page.total,

        page: page.page,

        limit: page.limit,

      },

    });

  } catch (error) {

    return apiError(error);

  }

}



export async function POST(request: NextRequest) {

  try {

    const actor = await requireSuperAdmin();

    const body = createTenantSchema.parse(await request.json());

    const result = await createTenantUseCase.execute(

      {

        ...body,

        invitedByUserId: actor.userId,

      },

      { actorId: actor.userId, ipAddress: getClientIp(request) },

    );



    if (result.isFailure) {

      return mapResultError(result.getError());

    }



    const { tenant, provisioning } = result.getValue();



    return apiSuccess(

      {

        ...serializeTenant(tenant),

        provisioning,

      },

      201,

    );

  } catch (error) {

    return apiError(error);

  }

}


