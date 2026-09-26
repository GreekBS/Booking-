import { ValidationError } from "../../shared/errors/DomainError";

export interface GuestNoteProps {
  id: string;
  tenantId: string;
  guestId: string;
  authorUserId: string;
  /** null = tenant-wide admin note */
  propertyId: string | null;
  body: string;
  createdAt: Date;
}

export class GuestNote {
  private constructor(private readonly props: GuestNoteProps) {}

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get guestId(): string {
    return this.props.guestId;
  }
  get authorUserId(): string {
    return this.props.authorUserId;
  }
  get propertyId(): string | null {
    return this.props.propertyId;
  }
  get body(): string {
    return this.props.body;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get isTenantWide(): boolean {
    return this.props.propertyId == null;
  }

  static create(input: {
    id: string;
    tenantId: string;
    guestId: string;
    authorUserId: string;
    propertyId: string | null;
    body: string;
    now?: Date;
  }): GuestNote {
    const body = input.body.trim();
    if (!body) {
      throw new ValidationError("Guest note body required");
    }
    if (body.length > 4000) {
      throw new ValidationError("Guest note body too long");
    }
    return new GuestNote({
      id: input.id,
      tenantId: input.tenantId,
      guestId: input.guestId,
      authorUserId: input.authorUserId,
      propertyId: input.propertyId,
      body,
      createdAt: input.now ?? new Date(),
    });
  }

  static reconstitute(props: GuestNoteProps): GuestNote {
    return new GuestNote(props);
  }

  toProps(): GuestNoteProps {
    return { ...this.props };
  }
}
