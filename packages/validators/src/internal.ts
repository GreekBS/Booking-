import { z } from "zod";

export const dispatchOutboxSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const runJobsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  jobTypes: z.array(z.string().min(1).max(100)).optional(),
});

export const enqueueJobSchema = z.object({
  jobType: z.string().min(1).max(100),
  payload: z.record(z.unknown()).optional().default({}),
  idempotencyKey: z.string().min(1).max(255).optional(),
  runAt: z.string().datetime().optional(),
  priority: z.coerce.number().int().min(-100).max(100).optional(),
  maxAttempts: z.coerce.number().int().min(1).max(20).optional(),
  tenantId: z.string().uuid().nullable().optional(),
});
