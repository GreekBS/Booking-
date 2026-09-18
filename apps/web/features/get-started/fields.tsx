"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export function FieldLabel({
  htmlFor,
  children,
  optional,
}: {
  htmlFor: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-sm font-medium text-[var(--talos-ink)]"
    >
      {children}
      {optional ? (
        <span className="ml-1 font-normal text-[var(--talos-muted)]">(optional)</span>
      ) : null}
    </label>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm text-[#8b3a2a]">
      {message}
    </p>
  );
}

export function TextInput({
  id,
  label,
  error,
  optional,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div>
      <FieldLabel htmlFor={id} optional={optional}>
        {label}
      </FieldLabel>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "mt-2 w-full rounded-sm border border-[var(--talos-line)] bg-white px-3 py-3 text-base text-[var(--talos-ink)] outline-none transition-colors placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-forest)]",
          error && "border-[#8b3a2a]",
          className,
        )}
        {...props}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function TextTextarea({
  id,
  label,
  error,
  optional,
  className,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div>
      <FieldLabel htmlFor={id} optional={optional}>
        {label}
      </FieldLabel>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "mt-2 w-full rounded-sm border border-[var(--talos-line)] bg-white px-3 py-3 text-base text-[var(--talos-ink)] outline-none transition-colors placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-forest)]",
          error && "border-[#8b3a2a]",
          className,
        )}
        {...props}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function TextSelect({
  id,
  label,
  error,
  optional,
  children,
  className,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div>
      <FieldLabel htmlFor={id} optional={optional}>
        {label}
      </FieldLabel>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "mt-2 w-full rounded-sm border border-[var(--talos-line)] bg-white px-3 py-3 text-base text-[var(--talos-ink)] outline-none focus:border-[var(--talos-forest)]",
          error && "border-[#8b3a2a]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function ChoiceCardGroup({
  legend,
  error,
  optional,
  children,
}: {
  legend: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  const errorId = useId();
  return (
    <fieldset>
      <legend className="text-sm font-medium text-[var(--talos-ink)]">
        {legend}
        {optional ? (
          <span className="ml-1 font-normal text-[var(--talos-muted)]">(optional)</span>
        ) : null}
      </legend>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}

export function ChoiceChip({
  selected,
  onSelect,
  children,
  type = "button",
  name,
  value,
  multi,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  type?: "button" | "checkbox" | "radio";
  name?: string;
  value?: string;
  multi?: boolean;
}) {
  if (type === "checkbox" || type === "radio") {
    return (
      <label
        className={cn(
          "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border px-3 py-2.5 text-sm font-medium transition-colors",
          selected
            ? "border-[var(--talos-forest)] bg-[var(--talos-forest)]/8 text-[var(--talos-ink)]"
            : "border-[var(--talos-line)] bg-white text-[var(--talos-ink-soft)] hover:border-[var(--talos-ink)]/30",
        )}
      >
        <input
          type={type}
          name={name}
          value={value}
          checked={selected}
          onChange={onSelect}
          className="h-4 w-4 accent-[var(--talos-forest)]"
        />
        <span>{children}</span>
      </label>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-sm border px-3 py-2.5 text-sm font-medium transition-colors",
        selected
          ? "border-[var(--talos-forest)] bg-[var(--talos-forest)]/8 text-[var(--talos-ink)]"
          : "border-[var(--talos-line)] bg-white text-[var(--talos-ink-soft)] hover:border-[var(--talos-ink)]/30",
        multi && "min-w-[4.5rem]",
      )}
    >
      {children}
    </button>
  );
}
