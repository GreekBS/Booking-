"use client";

import Link from "next/link";
import { useCallback, useId, useState } from "react";
import type { LeadInterest, LeadSource } from "@hcp/domain";
import { RegisterForm } from "@/features/auth/RegisterForm";
import { LEAD_COUNTRY_OPTIONS } from "@/lib/marketing/countries";
import {
  ChoiceCardGroup,
  ChoiceChip,
  TextInput,
  TextSelect,
  TextTextarea,
} from "./fields";
import {
  ACCOMMODATION_OPTIONS,
  CHANNEL_OPTIONS,
  INTEREST_OPTIONS,
  OPERATING_STATE_OPTIONS,
  PORTFOLIO_OPTIONS,
  RELATIONSHIP_OPTIONS,
  REVENUE_OPTIONS,
  TOOL_OPTIONS,
} from "./options";
import {
  createEmptyFormState,
  STEP_META,
  type GetStartedFormState,
  type GetStartedStep,
} from "./types";
import {
  validateFullForm,
  validateStep,
  type FieldErrors,
} from "./validation";

type Props = {
  source: LeadSource;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  preselectManaged: boolean;
  /** Overlay presentation hides redundant chrome and enables close callbacks. */
  presentation?: "page" | "overlay";
  onRequestClose?: () => void;
};

type SubmitPhase =
  | "idle"
  | "submitting"
  | "success"
  | "register"
  | "demo-confirmed"
  | "error";

function toggleInList<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function firstNameFrom(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part || "there";
}

function successCopy(interests: LeadInterest[]): string {
  const set = new Set(interests);
  if (set.has("managed") && (set.has("run") || set.has("grow"))) {
    return "We will use them to understand whether software, managed service, or a blend is the right fit.";
  }
  if (set.has("managed")) {
    return "They will help us start a managed-service conversation — no account was created yet.";
  }
  if (set.has("run") || set.has("grow")) {
    return "We will use them to help you explore the Talos platform path that fits.";
  }
  return "We will help you understand which Talos setup makes sense.";
}

export function GetStartedWizard({
  source,
  utmSource,
  utmMedium,
  utmCampaign,
  preselectManaged,
  presentation = "page",
  onRequestClose,
}: Props) {
  const progressId = useId();
  const [step, setStep] = useState<GetStartedStep>(1);
  const [form, setForm] = useState<GetStartedFormState>(() =>
    createEmptyFormState({
      source,
      utmSource,
      utmMedium,
      utmCampaign,
      preselectManaged,
    }),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoSubmitting, setDemoSubmitting] = useState(false);

  const patch = useCallback((partial: Partial<GetStartedFormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  function goNext() {
    const stepErrors = validateStep(form, step);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    if (step < 5) setStep((s) => (s + 1) as GetStartedStep);
  }

  function goBack() {
    setErrors({});
    setSubmitError(null);
    if (step > 1) setStep((s) => (s - 1) as GetStartedStep);
  }

  async function submit() {
    if (phase === "submitting") return;

    const stepErrors = validateStep(form, 5);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }

    const full = validateFullForm(form);
    if (!full.ok) {
      setErrors(full.errors);
      setSubmitError("Please review the highlighted fields.");
      return;
    }

    setPhase("submitting");
    setSubmitError(null);

    try {
      const res = await fetch("/api/marketing/v1/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(full.data),
      });

      const data = (await res.json().catch(() => null)) as {
        id?: string;
        error?: { message?: string };
      } | null;

      if (!res.ok) {
        setPhase("error");
        setSubmitError(
          data?.error?.message ??
            "We could not save your details. Please try again.",
        );
        return;
      }

      if (!data?.id) {
        setPhase("error");
        setSubmitError("We could not confirm your submission. Please try again.");
        return;
      }

      setLeadId(data.id);
      setPhase("success");
      setErrors({});
    } catch {
      setPhase("error");
      setSubmitError("Network error. Please try again — your answers are still here.");
    }
  }

  async function requestDemo() {
    if (!leadId || demoSubmitting) return;
    setDemoSubmitting(true);
    setDemoError(null);

    try {
      const res = await fetch(`/api/marketing/v1/leads/${leadId}/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => null)) as {
        demoRequestedAt?: string;
        error?: { message?: string };
      } | null;

      if (!res.ok || !data?.demoRequestedAt) {
        setDemoError(
          data?.error?.message ??
            "We could not record your demo request. Please try again.",
        );
        return;
      }

      setPhase("demo-confirmed");
    } catch {
      setDemoError("Network error. Please try again — your inquiry is still saved.");
    } finally {
      setDemoSubmitting(false);
    }
  }

  function startFresh() {
    setForm(
      createEmptyFormState({
        source,
        utmSource,
        utmMedium,
        utmCampaign,
        preselectManaged,
      }),
    );
    setStep(1);
    setErrors({});
    setSubmitError(null);
    setLeadId(null);
    setDemoError(null);
    setPhase("idle");
  }

  if (phase === "register" && leadId) {
    return (
      <div className="rounded-sm border border-[var(--talos-line)] bg-white p-8 md:p-10">
        <RegisterForm
          variant="marketing"
          initialName={form.fullName}
          initialEmail={form.email}
          onBackToLogin={() => setPhase("success")}
        />
        <button
          type="button"
          onClick={() => setPhase("success")}
          className="mt-6 text-sm text-[var(--talos-muted)] underline underline-offset-4 hover:text-[var(--talos-ink)]"
        >
          Back to next steps
        </button>
      </div>
    );
  }

  if (phase === "demo-confirmed") {
    return (
      <div className="rounded-sm border border-[var(--talos-line)] bg-white p-8 md:p-10">
        <p className="talos-kicker">Demo request</p>
        <h2 className="talos-display mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Your demo request is in.
        </h2>
        <p className="mt-4 text-[var(--talos-muted)] leading-relaxed">
          A Talos representative will contact you soon to arrange the next step.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {onRequestClose ? (
            <button
              type="button"
              onClick={onRequestClose}
              className="inline-flex items-center justify-center rounded-sm bg-[var(--talos-forest)] px-5 py-3 text-sm font-semibold text-[var(--talos-paper)] hover:bg-[var(--talos-forest-deep)]"
            >
              Close
            </button>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-sm bg-[var(--talos-forest)] px-5 py-3 text-sm font-semibold text-[var(--talos-paper)] hover:bg-[var(--talos-forest-deep)]"
            >
              Return home
            </Link>
          )}
          <button
            type="button"
            onClick={() => setPhase("success")}
            className="inline-flex items-center justify-center rounded-sm border border-[var(--talos-ink)]/20 px-5 py-3 text-sm font-semibold text-[var(--talos-ink)] hover:border-[var(--talos-ink)]/45"
          >
            Back to choices
          </button>
        </div>
      </div>
    );
  }

  if (phase === "success" && leadId) {
    return (
      <div className="rounded-sm border border-[var(--talos-line)] bg-white p-8 md:p-10">
        <p className="talos-kicker">Received</p>
        <h2 className="talos-display mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Thanks, {firstNameFrom(form.fullName)}.
        </h2>
        <p className="mt-4 text-[var(--talos-muted)] leading-relaxed">
          We have your details.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--talos-ink-soft)]">
          {successCopy(form.interests)}
        </p>
        <p className="mt-6 text-sm font-medium text-[var(--talos-ink)]">
          What would you like to do next?
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            data-testid="get-started-create-account"
            onClick={() => setPhase("register")}
            className="inline-flex items-center justify-center rounded-sm bg-[var(--talos-forest)] px-5 py-3 text-sm font-semibold text-[var(--talos-paper)] hover:bg-[var(--talos-forest-deep)]"
          >
            Create Account
          </button>
          <button
            type="button"
            data-testid="get-started-book-demo"
            onClick={() => void requestDemo()}
            disabled={demoSubmitting}
            className="inline-flex items-center justify-center rounded-sm border border-[var(--talos-ink)]/20 px-5 py-3 text-sm font-semibold text-[var(--talos-ink)] hover:border-[var(--talos-ink)]/45 disabled:opacity-60"
          >
            {demoSubmitting ? "Sending…" : "Book a Demo"}
          </button>
        </div>
        {demoError ? (
          <p role="alert" className="mt-4 text-sm text-[#8b3a2a]">
            {demoError}
          </p>
        ) : null}
        {presentation === "page" ? (
          <Link
            href="/"
            className="mt-8 inline-flex text-sm font-medium text-[var(--talos-ink-soft)] hover:text-[var(--talos-ink)]"
          >
            Return home
          </Link>
        ) : onRequestClose ? (
          <button
            type="button"
            onClick={onRequestClose}
            className="mt-8 text-sm font-medium text-[var(--talos-ink-soft)] hover:text-[var(--talos-ink)]"
          >
            Close
          </button>
        ) : null}
        <button
          type="button"
          onClick={startFresh}
          className="mt-6 block text-sm text-[var(--talos-muted)] underline underline-offset-4 hover:text-[var(--talos-ink)]"
        >
          Start another inquiry
        </button>
      </div>
    );
  }

  const meta = STEP_META[step];
  const submitting = phase === "submitting";

  return (
    <div className="rounded-sm border border-[var(--talos-line)] bg-white p-6 sm:p-8 md:p-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="talos-kicker">Step {step} of 5</p>
          <h2 className="talos-display mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
            {meta.title}
          </h2>
        </div>
        <p
          id={progressId}
          className="text-sm text-[var(--talos-muted)]"
          aria-live="polite"
        >
          {step} / 5
        </p>
      </div>

      <ol
        className="mt-5 flex gap-1.5"
        aria-label="Progress"
        aria-describedby={progressId}
      >
        {([1, 2, 3, 4, 5] as GetStartedStep[]).map((n) => (
          <li
            key={n}
            className={`h-1 flex-1 rounded-full ${
              n <= step ? "bg-[var(--talos-forest)]" : "bg-[var(--talos-sand)]"
            }`}
            aria-current={n === step ? "step" : undefined}
          >
            <span className="sr-only">
              Step {n}
              {n === step ? " (current)" : n < step ? " (completed)" : ""}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-5 text-sm leading-relaxed text-[var(--talos-muted)] md:text-base">
        {meta.lede}
      </p>

      <form
        className="mt-8 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 5) goNext();
          else void submit();
        }}
        noValidate
      >
        {step === 1 ? (
          <div className="space-y-5">
            <TextInput
              id="gs-fullName"
              label="Full name"
              autoComplete="name"
              value={form.fullName}
              error={errors.fullName}
              onChange={(e) => patch({ fullName: e.target.value })}
            />
            <TextInput
              id="gs-email"
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={form.email}
              error={errors.email}
              onChange={(e) => patch({ email: e.target.value })}
            />
            <TextInput
              id="gs-phone"
              label="Phone"
              type="tel"
              autoComplete="tel"
              optional
              value={form.phone}
              error={errors.phone}
              onChange={(e) => patch({ phone: e.target.value })}
            />
            <TextSelect
              id="gs-country"
              label="Country"
              value={form.country}
              error={errors.country}
              onChange={(e) => patch({ country: e.target.value })}
            >
              <option value="">Select country</option>
              {LEAD_COUNTRY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </TextSelect>
            <ChoiceCardGroup legend="Your relationship to the business" error={errors.relationship}>
              {RELATIONSHIP_OPTIONS.map((opt) => (
                <ChoiceChip
                  key={opt.value}
                  type="radio"
                  name="relationship"
                  value={opt.value}
                  selected={form.relationship === opt.value}
                  onSelect={() => patch({ relationship: opt.value })}
                >
                  {opt.label}
                </ChoiceChip>
              ))}
            </ChoiceCardGroup>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <ChoiceCardGroup legend="Portfolio size" error={errors.portfolioSize}>
              {PORTFOLIO_OPTIONS.map((opt) => (
                <ChoiceChip
                  key={opt.value}
                  type="radio"
                  name="portfolioSize"
                  value={opt.value}
                  selected={form.portfolioSize === opt.value}
                  onSelect={() => patch({ portfolioSize: opt.value })}
                >
                  {opt.label}
                </ChoiceChip>
              ))}
            </ChoiceCardGroup>
            <ChoiceCardGroup
              legend="Accommodation types"
              error={errors.accommodationTypes}
            >
              {ACCOMMODATION_OPTIONS.map((opt) => (
                <ChoiceChip
                  key={opt.value}
                  type="checkbox"
                  name="accommodationTypes"
                  value={opt.value}
                  selected={form.accommodationTypes.includes(opt.value)}
                  onSelect={() =>
                    patch({
                      accommodationTypes: toggleInList(
                        form.accommodationTypes,
                        opt.value,
                      ),
                    })
                  }
                >
                  {opt.label}
                </ChoiceChip>
              ))}
            </ChoiceCardGroup>
            <TextSelect
              id="gs-propertyCountry"
              label="Property country"
              value={form.propertyCountry}
              error={errors.propertyCountry}
              onChange={(e) => patch({ propertyCountry: e.target.value })}
            >
              <option value="">Select country</option>
              {LEAD_COUNTRY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </TextSelect>
            <TextInput
              id="gs-propertyCity"
              label="Property city"
              optional
              autoComplete="address-level2"
              value={form.propertyCity}
              error={errors.propertyCity}
              onChange={(e) => patch({ propertyCity: e.target.value })}
            />
            <ChoiceCardGroup legend="Operating state" error={errors.operatingState}>
              {OPERATING_STATE_OPTIONS.map((opt) => (
                <ChoiceChip
                  key={opt.value}
                  type="radio"
                  name="operatingState"
                  value={opt.value}
                  selected={form.operatingState === opt.value}
                  onSelect={() => patch({ operatingState: opt.value })}
                >
                  {opt.label}
                </ChoiceChip>
              ))}
            </ChoiceCardGroup>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <ChoiceCardGroup legend="Channels you use today" optional>
              {CHANNEL_OPTIONS.map((opt) => (
                <ChoiceChip
                  key={opt.value}
                  type="checkbox"
                  name="channels"
                  value={opt.value}
                  selected={form.channels.includes(opt.value)}
                  onSelect={() =>
                    patch({ channels: toggleInList(form.channels, opt.value) })
                  }
                >
                  {opt.label}
                </ChoiceChip>
              ))}
            </ChoiceCardGroup>
            <ChoiceCardGroup legend="Tools in use" optional>
              {TOOL_OPTIONS.map((opt) => (
                <ChoiceChip
                  key={opt.value}
                  type="checkbox"
                  name="tools"
                  value={opt.value}
                  selected={form.tools.includes(opt.value)}
                  onSelect={() =>
                    patch({ tools: toggleInList(form.tools, opt.value) })
                  }
                >
                  {opt.label}
                </ChoiceChip>
              ))}
            </ChoiceCardGroup>
            <TextInput
              id="gs-softwareName"
              label="Software name"
              optional
              placeholder="If you use a PMS or other system"
              value={form.softwareName}
              onChange={(e) => patch({ softwareName: e.target.value })}
            />
            <ChoiceCardGroup legend="Do you have a website?" optional>
              {[
                { label: "Yes", value: true as const },
                { label: "No", value: false as const },
              ].map((opt) => (
                <ChoiceChip
                  key={String(opt.value)}
                  type="radio"
                  name="hasWebsite"
                  value={String(opt.value)}
                  selected={form.hasWebsite === opt.value}
                  onSelect={() => patch({ hasWebsite: opt.value })}
                >
                  {opt.label}
                </ChoiceChip>
              ))}
            </ChoiceCardGroup>
            <ChoiceCardGroup legend="Do you accept direct bookings?" optional>
              {[
                { label: "Yes", value: true as const },
                { label: "No", value: false as const },
              ].map((opt) => (
                <ChoiceChip
                  key={String(opt.value)}
                  type="radio"
                  name="acceptsDirectBookings"
                  value={String(opt.value)}
                  selected={form.acceptsDirectBookings === opt.value}
                  onSelect={() => patch({ acceptsDirectBookings: opt.value })}
                >
                  {opt.label}
                </ChoiceChip>
              ))}
            </ChoiceCardGroup>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-5">
            <ChoiceCardGroup
              legend="Approximate annual revenue"
              optional
              error={errors.revenueRange}
            >
              {REVENUE_OPTIONS.map((opt) => (
                <ChoiceChip
                  key={opt.value}
                  type="radio"
                  name="revenueRange"
                  value={opt.value}
                  selected={form.revenueRange === opt.value}
                  onSelect={() => patch({ revenueRange: opt.value })}
                >
                  {opt.label}
                </ChoiceChip>
              ))}
            </ChoiceCardGroup>
            <p className="text-sm text-[var(--talos-muted)]">
              You can skip this step. Exact revenue is never required.
            </p>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-5">
            <fieldset>
              <legend className="text-sm font-medium text-[var(--talos-ink)]">
                What are you interested in?
              </legend>
              <div className="mt-3 grid gap-3">
                {INTEREST_OPTIONS.map((opt) => {
                  const selected = form.interests.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer gap-3 rounded-sm border p-4 transition-colors ${
                        selected
                          ? "border-[var(--talos-forest)] bg-[var(--talos-forest)]/5"
                          : "border-[var(--talos-line)] bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-[var(--talos-forest)]"
                        checked={selected}
                        onChange={() =>
                          patch({
                            interests: toggleInList(form.interests, opt.value),
                          })
                        }
                      />
                      <span>
                        <span className="block font-semibold text-[var(--talos-ink)]">
                          {opt.label}
                        </span>
                        <span className="mt-1 block text-sm text-[var(--talos-muted)]">
                          {opt.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.interests ? (
                <p role="alert" className="mt-2 text-sm text-[#8b3a2a]">
                  {errors.interests}
                </p>
              ) : null}
            </fieldset>
            <TextTextarea
              id="gs-message"
              label="Anything else we should know?"
              optional
              rows={4}
              maxLength={1000}
              value={form.message}
              error={errors.message}
              onChange={(e) => patch({ message: e.target.value })}
            />
            <p className="text-sm leading-relaxed text-[var(--talos-muted)]">
              By submitting, you share business details with Talos so we can understand your
              needs. See our{" "}
              <Link href="/privacy" className="underline underline-offset-4">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        ) : null}

        {submitError ? (
          <p role="alert" className="text-sm text-[#8b3a2a]">
            {submitError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-[var(--talos-line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 1 || submitting}
            className="min-h-11 rounded-sm px-4 py-2.5 text-sm font-medium text-[var(--talos-ink-soft)] hover:text-[var(--talos-ink)] disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="min-h-11 rounded-sm bg-[var(--talos-forest)] px-6 py-3 text-sm font-semibold text-[var(--talos-paper)] hover:bg-[var(--talos-forest-deep)] disabled:opacity-60"
          >
            {submitting
              ? "Sending…"
              : step < 5
                ? "Continue"
                : phase === "error"
                  ? "Try again"
                  : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
