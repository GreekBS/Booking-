import { z } from "zod";
import { createLeadSchema, type CreateLeadInput } from "@hcp/validators";
import type { GetStartedFormState, GetStartedStep } from "./types";

export type FieldErrors = Record<string, string>;

function humanizeZodMessage(path: string, message: string): string {
  if (path === "email" && message.toLowerCase().includes("email")) {
    return "Enter a valid email address.";
  }
  if (
    message.includes("Required") ||
    message.includes("expected") ||
    message.includes("Invalid enum") ||
    message.includes("Invalid input")
  ) {
    return "This field is required.";
  }
  if (message.includes("at least 1") || message.includes("Too small")) {
    if (path === "accommodationTypes") {
      return "Select at least one accommodation type.";
    }
    if (path === "interests") {
      return "Select at least one way Talos can help.";
    }
    if (path === "fullName" || path === "country" || path === "propertyCountry") {
      return "This field is required.";
    }
    return "Please complete this field.";
  }
  if (message.includes("String must contain at least")) {
    if (path === "fullName" || path === "country" || path === "propertyCountry") {
      return "This field is required.";
    }
    return "Please enter a bit more detail.";
  }
  return "Please check this field.";
}

function zodToFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] != null ? String(issue.path[0]) : "_form";
    if (!out[key]) {
      out[key] = humanizeZodMessage(key, issue.message);
    }
  }
  return out;
}

/** Build API payload from wizard state (empty optionals → null / omitted). */
export function toCreateLeadPayload(
  state: GetStartedFormState,
): CreateLeadInput {
  return createLeadSchema.parse({
    submissionId: state.submissionId,
    fullName: state.fullName,
    email: state.email,
    phone: state.phone || null,
    country: state.country,
    relationship: state.relationship,
    portfolioSize: state.portfolioSize,
    accommodationTypes: state.accommodationTypes,
    propertyCountry: state.propertyCountry,
    propertyCity: state.propertyCity || null,
    operatingState: state.operatingState,
    channels: state.channels,
    tools: state.tools,
    softwareName: state.softwareName || null,
    hasWebsite: state.hasWebsite,
    acceptsDirectBookings: state.acceptsDirectBookings,
    revenueRange: state.revenueRange || null,
    interests: state.interests,
    message: state.message || null,
    source: state.source,
    utmSource: state.utmSource,
    utmMedium: state.utmMedium,
    utmCampaign: state.utmCampaign,
  });
}

const step1Schema = z.object({
  fullName: createLeadSchema.shape.fullName,
  email: createLeadSchema.shape.email,
  phone: createLeadSchema.shape.phone,
  country: createLeadSchema.shape.country,
  relationship: createLeadSchema.shape.relationship,
});

const step2Schema = z.object({
  portfolioSize: createLeadSchema.shape.portfolioSize,
  accommodationTypes: createLeadSchema.shape.accommodationTypes,
  propertyCountry: createLeadSchema.shape.propertyCountry,
  propertyCity: createLeadSchema.shape.propertyCity,
  operatingState: createLeadSchema.shape.operatingState,
});

const step3Schema = z.object({
  channels: createLeadSchema.shape.channels,
  tools: createLeadSchema.shape.tools,
  softwareName: createLeadSchema.shape.softwareName,
  hasWebsite: createLeadSchema.shape.hasWebsite,
  acceptsDirectBookings: createLeadSchema.shape.acceptsDirectBookings,
});

const step4Schema = z.object({
  revenueRange: createLeadSchema.shape.revenueRange,
});

const step5Schema = z.object({
  interests: createLeadSchema.shape.interests,
  message: createLeadSchema.shape.message,
});

function stepPayload(state: GetStartedFormState, step: GetStartedStep) {
  switch (step) {
    case 1:
      return {
        fullName: state.fullName,
        email: state.email,
        phone: state.phone || null,
        country: state.country,
        relationship: state.relationship || undefined,
      };
    case 2:
      return {
        portfolioSize: state.portfolioSize || undefined,
        accommodationTypes: state.accommodationTypes,
        propertyCountry: state.propertyCountry,
        propertyCity: state.propertyCity || null,
        operatingState: state.operatingState || undefined,
      };
    case 3:
      return {
        channels: state.channels,
        tools: state.tools,
        softwareName: state.softwareName || null,
        hasWebsite: state.hasWebsite,
        acceptsDirectBookings: state.acceptsDirectBookings,
      };
    case 4:
      return {
        revenueRange: state.revenueRange || null,
      };
    case 5:
      return {
        interests: state.interests,
        message: state.message || null,
      };
  }
}

export function validateStep(
  state: GetStartedFormState,
  step: GetStartedStep,
): FieldErrors {
  const schemas = {
    1: step1Schema,
    2: step2Schema,
    3: step3Schema,
    4: step4Schema,
    5: step5Schema,
  } as const;

  const result = schemas[step].safeParse(stepPayload(state, step));
  if (result.success) return {};
  return zodToFieldErrors(result.error);
}

export function validateFullForm(state: GetStartedFormState): {
  ok: true;
  data: CreateLeadInput;
} | {
  ok: false;
  errors: FieldErrors;
} {
  try {
    return { ok: true, data: toCreateLeadPayload(state) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, errors: zodToFieldErrors(error) };
    }
    return { ok: false, errors: { _form: "Please check your details and try again." } };
  }
}
