import { NextRequest } from "next/server";
import { UnauthorizedError } from "@hcp/domain";
import { scheduleIcalPollsUseCase } from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { createLogger } from "@/lib/logging/logger";

export const runtime = "nodejs";

const logger = createLogger({ action: "channels.schedule_ical_polls" });

/**
 * P1-S7b — internal iCal poll scheduler.
 * Auth: Authorization: Bearer ${BACKGROUND_JOBS_SECRET}
 *
 * Does NOT run production cron itself. External cadence is owned by P1-S7c.
 * No provider I/O — enqueue only.
 */
export async function POST(request: NextRequest) {
  try {
    const jobsSecret = process.env.BACKGROUND_JOBS_SECRET;
    const authHeader = request.headers.get("authorization");

    if (!jobsSecret || authHeader !== `Bearer ${jobsSecret}`) {
      throw new UnauthorizedError();
    }

    const result = await scheduleIcalPollsUseCase.execute();
    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const value = result.getValue();
    logger.info("ical poll schedule completed", {
      examined: value.examined,
      enqueuedPolls: value.enqueuedPolls,
      skipped: value.skipped,
      enqueuedSweep: value.enqueuedSweep,
    });

    return apiSuccess({
      examined: value.examined,
      enqueuedPolls: value.enqueuedPolls,
      skipped: value.skipped,
      enqueuedSweep: value.enqueuedSweep,
    });
  } catch (error) {
    return apiError(error);
  }
}
