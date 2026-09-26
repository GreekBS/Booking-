import { z } from "zod";
import { paginationSchema } from "./pagination";

const taskCategorySchema = z.enum([
  "HOUSEKEEPING",
  "MAINTENANCE",
  "INSPECTION",
  "GUEST_REQUEST",
  "GENERAL",
]);
const taskStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);
const taskPrioritySchema = z.enum(["NORMAL", "HIGH", "URGENT"]);

export const listTasksQuerySchema = paginationSchema.extend({
  propertyId: z.string().uuid().optional(),
  entireTenant: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  status: z.union([taskStatusSchema, z.array(taskStatusSchema)]).optional(),
  category: z.union([taskCategorySchema, z.array(taskCategorySchema)]).optional(),
  unitId: z.string().uuid().optional(),
  assignedToUserId: z.string().uuid().optional(),
  priority: z.union([taskPrioritySchema, z.array(taskPrioritySchema)]).optional(),
  bookingId: z.string().uuid().optional(),
});

export const createTaskBodySchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().nullable().optional(),
  bookingId: z.string().uuid().nullable().optional(),
  guestId: z.string().uuid().nullable().optional(),
  category: taskCategorySchema,
  title: z.string().min(1).max(255),
  description: z.string().max(4000).nullable().optional(),
  priority: taskPrioritySchema.optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

export const taskVersionBodySchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const completeTaskBodySchema = taskVersionBodySchema.extend({
  completionNote: z.string().max(2000).nullable().optional(),
});

export const assignTaskBodySchema = taskVersionBodySchema.extend({
  assignedToUserId: z.string().uuid().nullable(),
});

export const markHousekeepingBodySchema = z.object({
  propertyId: z.string().uuid(),
  expectedVersion: z.number().int().positive().optional(),
});
