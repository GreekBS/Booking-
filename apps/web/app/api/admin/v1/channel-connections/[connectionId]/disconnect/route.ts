import { NextRequest } from "next/server";
import { disconnectChannelConnectionUseCase } from "@/lib/di/container";
import { handleChannelConnectionLifecyclePost } from "@/lib/channels/lifecycle-route";

type RouteContext = { params: Promise<{ connectionId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  return handleChannelConnectionLifecyclePost(
    request,
    context,
    disconnectChannelConnectionUseCase,
  );
}
