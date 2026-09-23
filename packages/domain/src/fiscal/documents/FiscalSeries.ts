import { AggregateRoot } from "../../shared/kernel/Entity";
import { ValidationError } from "../../shared/errors/DomainError";
import type { FiscalDocumentKind } from "./FiscalDocumentKinds";
import { FISCAL_DOCUMENT_KINDS } from "./FiscalDocumentKinds";

export interface FiscalSeriesProps {
  id: string;
  tenantId: string;
  /** Establishment / property scope for series isolation. */
  propertyId: string;
  documentKind: FiscalDocumentKind;
  seriesCode: string;
  /** Next sequence to allocate (1-based). Only advanced on successful issue commit. */
  nextSequence: number;
  active: boolean;
  label: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class FiscalSeries extends AggregateRoot<FiscalSeriesProps> {
  private constructor(props: FiscalSeriesProps) {
    super(props);
  }

  static create(
    input: Omit<FiscalSeriesProps, "createdAt" | "updatedAt" | "nextSequence"> & {
      nextSequence?: number;
      now?: Date;
    },
  ): FiscalSeries {
    const now = input.now ?? new Date();
    const code = input.seriesCode.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(code)) {
      throw new ValidationError("Invalid fiscal series code");
    }
    if (!FISCAL_DOCUMENT_KINDS.includes(input.documentKind)) {
      throw new ValidationError(`Unsupported document kind: ${input.documentKind}`);
    }
    const next = input.nextSequence ?? 1;
    if (!Number.isInteger(next) || next < 1) {
      throw new ValidationError("nextSequence must be a positive integer");
    }
    return new FiscalSeries({
      ...input,
      seriesCode: code,
      nextSequence: next,
      label: input.label?.trim() || null,
      metadata: { ...input.metadata },
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: FiscalSeriesProps): FiscalSeries {
    return new FiscalSeries({
      ...props,
      metadata: { ...props.metadata },
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
    });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }
  get propertyId(): string {
    return this.props.propertyId;
  }
  get documentKind(): FiscalDocumentKind {
    return this.props.documentKind;
  }
  get seriesCode(): string {
    return this.props.seriesCode;
  }
  get nextSequence(): number {
    return this.props.nextSequence;
  }
  get active(): boolean {
    return this.props.active;
  }

  toProps(): FiscalSeriesProps {
    return {
      ...this.props,
      metadata: { ...this.props.metadata },
      createdAt: new Date(this.props.createdAt),
      updatedAt: new Date(this.props.updatedAt),
    };
  }

  activate(): void {
    this.props.active = true;
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.active = false;
    this.props.updatedAt = new Date();
  }

  rename(label: string | null): void {
    this.props.label = label?.trim() || null;
    this.props.updatedAt = new Date();
  }

  /** Domain-side peek only — real allocation is PostgreSQL-authoritative. */
  assertReadyToAllocate(): void {
    if (!this.props.active) {
      throw new ValidationError("FiscalSeries is inactive");
    }
  }
}
