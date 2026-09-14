import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { acceptInvitationSchema } from "@hcp/validators";
import { acceptInvitationUseCase, hashToken } from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const body = acceptInvitationSchema.parse(await request.json());
    const tokenHash = hashToken(token);

    const passwordHash = body.password
      ? await bcrypt.hash(body.password, 12)
      : undefined;

    const result = await acceptInvitationUseCase.execute({
      tokenHash,
      name: body.name,
      passwordHash,
    });

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const membership = result.getValue();

    return apiSuccess({
      membershipId: membership.id,
      tenantId: membership.tenantId,
      role: membership.role,
    });
  } catch (error) {
    return apiError(error);
  }
}
