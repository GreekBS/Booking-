import { z } from "zod";

export const csvImportDateFormatSchema = z.enum(["iso", "dmy", "mdy"]);
export const csvImportDelimiterSchema = z.enum([",", ";", "\t"]);

export const csvImportCanonicalFieldSchema = z.enum([
  "externalReference",
  "unitRef",
  "guestName",
  "guestEmail",
  "guestPhone",
  "checkIn",
  "checkOut",
  "guestCount",
  "totalAmount",
  "currency",
  "channelSource",
  "notes",
]);

export const reservationImportMissingPriceStrategySchema = z.enum([
  "undecided",
  "talos_for_all_missing",
  "per_row",
]);

export const reservationImportConflictResolutionSchema = z.enum([
  "undecided",
  "keep_existing",
  "keep_csv",
]);

export const reservationImportPriceSourceSchema = z.enum([
  "unresolved",
  "imported_csv",
  "talos_calculated",
  "operator_entered",
]);

export const updateReservationImportBatchSchema = z
  .object({
    missingPriceStrategy: reservationImportMissingPriceStrategySchema,
  })
  .strict();

export const updateReservationImportRowDecisionSchema = z
  .object({
    conflictResolution: reservationImportConflictResolutionSchema.optional(),
    priceSource: reservationImportPriceSourceSchema.optional(),
    operatorTotalAmount: z.string().min(1).nullable().optional(),
    operatorCurrency: z
      .string()
      .length(3)
      .regex(/^[A-Za-z]{3}$/)
      .transform((v) => v.toUpperCase())
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.conflictResolution !== undefined ||
      v.priceSource !== undefined ||
      v.operatorTotalAmount !== undefined ||
      v.operatorCurrency !== undefined,
    { message: "At least one decision field is required" },
  );
