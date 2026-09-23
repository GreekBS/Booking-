import { NextRequest } from "next/server";
import {
  listBusinessFiscalProfilesUseCase,
  upsertBusinessFiscalProfileUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { z } from "zod";

const upsertSchema = z.object({
  propertyId: z.string().uuid(),
  legalName: z.string().min(1),
  tradeName: z.string().nullable().optional(),
  country: z.string().length(2),
  vatNumber: z.string().nullable().optional(),
  address: z.object({
    line1: z.string().min(1),
    line2: z.string().nullable().optional(),
    city: z.string().min(1),
    region: z.string().nullable().optional(),
    postalCode: z.string().min(1),
    country: z.string().length(2),
  }),
  fiscalJurisdiction: z.string().min(1),
  establishmentCode: z.string().nullable().optional(),
  accommodationType: z.enum([
    "hotel",
    "furnished_rooms_apartments",
    "short_term_rental",
    "villa_self_catering",
    "tourist_furnished_house",
    "other",
  ]),
  propertyClassification: z
    .enum([
      "hotel_stars_1_2",
      "hotel_stars_3",
      "hotel_stars_4",
      "hotel_stars_5",
      "furnished_rooms_apartments",
      "short_term_rental",
      "short_term_rental_detached_gt_80sqm",
      "villa_self_catering",
      "tourist_furnished_house_lt_80sqm",
      "tourist_furnished_house_gte_80sqm",
      "unclassified",
    ])
    .nullable()
    .optional(),
  floorAreaSqm: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const result = await listBusinessFiscalProfilesUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({ profiles: result.getValue() });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = upsertSchema.parse(await request.json());
    const result = await upsertBusinessFiscalProfileUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
      {
        ...body,
        tradeName: body.tradeName ?? null,
        vatNumber: body.vatNumber ?? null,
        establishmentCode: body.establishmentCode ?? null,
        propertyClassification: body.propertyClassification ?? null,
        floorAreaSqm: body.floorAreaSqm ?? null,
        address: {
          line1: body.address.line1,
          line2: body.address.line2 ?? null,
          city: body.address.city,
          region: body.address.region ?? null,
          postalCode: body.address.postalCode,
          country: body.address.country,
        },
        metadata: body.metadata ?? {},
      },
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
