import { ValidationError } from "../../shared/errors/DomainError";

export interface GuestTagProps {
  id: string;
  tenantId: string;
  name: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class GuestTag {
  private constructor(private readonly props: GuestTagProps) {}

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get name(): string {
    return this.props.name;
  }
  get archivedAt(): Date | null {
    return this.props.archivedAt;
  }
  get isActive(): boolean {
    return this.props.archivedAt == null;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(input: {
    id: string;
    tenantId: string;
    name: string;
    now?: Date;
  }): GuestTag {
    const name = input.name.trim();
    if (!name) throw new ValidationError("Guest tag name required");
    if (name.length > 64) throw new ValidationError("Guest tag name too long");
    const now = input.now ?? new Date();
    return new GuestTag({
      id: input.id,
      tenantId: input.tenantId,
      name,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: GuestTagProps): GuestTag {
    return new GuestTag(props);
  }

  rename(name: string, now: Date = new Date()): void {
    if (!this.isActive) throw new ValidationError("Cannot rename archived Guest tag");
    const trimmed = name.trim();
    if (!trimmed) throw new ValidationError("Guest tag name required");
    if (trimmed.length > 64) throw new ValidationError("Guest tag name too long");
    this.props.name = trimmed;
    this.props.updatedAt = now;
  }

  archive(now: Date = new Date()): void {
    if (this.props.archivedAt) return;
    this.props.archivedAt = now;
    this.props.updatedAt = now;
  }

  toProps(): GuestTagProps {
    return { ...this.props };
  }
}
