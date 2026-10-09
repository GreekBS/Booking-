import { AggregateRoot } from "../../shared/kernel/Entity";
import { ValidationError } from "../../shared/errors/DomainError";
import {
  isWebsiteStatus,
  isWebsiteThemeId,
  WEBSITE_CONTENT_SCHEMA_VERSION,
  type WebsiteStatus,
  type WebsiteThemeId,
} from "./WebsiteTypes";

export interface WebsiteProps {
  id: string;
  tenantId: string;
  propertyId: string;
  status: WebsiteStatus;
  themeId: WebsiteThemeId;
  contentSchemaVersion: number;
  draftVersionId: string | null;
  publishedVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWebsiteInput {
  id: string;
  tenantId: string;
  propertyId: string;
  themeId?: WebsiteThemeId;
  now?: Date;
}

export class Website extends AggregateRoot<WebsiteProps> {
  private constructor(props: WebsiteProps) {
    super(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get propertyId(): string {
    return this.props.propertyId;
  }

  get status(): WebsiteStatus {
    return this.props.status;
  }

  get themeId(): WebsiteThemeId {
    return this.props.themeId;
  }

  get contentSchemaVersion(): number {
    return this.props.contentSchemaVersion;
  }

  get draftVersionId(): string | null {
    return this.props.draftVersionId;
  }

  get publishedVersionId(): string | null {
    return this.props.publishedVersionId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(input: CreateWebsiteInput): Website {
    const now = input.now ?? new Date();
    const themeId = input.themeId ?? "unset";
    if (!isWebsiteThemeId(themeId)) {
      throw new ValidationError(`Unknown themeId: ${themeId}`);
    }
    return new Website({
      id: input.id,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      status: "draft",
      themeId,
      contentSchemaVersion: WEBSITE_CONTENT_SCHEMA_VERSION,
      draftVersionId: null,
      publishedVersionId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: WebsiteProps): Website {
    if (!isWebsiteStatus(props.status)) {
      throw new ValidationError(`Invalid website status: ${props.status}`);
    }
    if (!isWebsiteThemeId(props.themeId)) {
      throw new ValidationError(`Unknown themeId: ${props.themeId}`);
    }
    if (props.contentSchemaVersion < 1) {
      throw new ValidationError("contentSchemaVersion must be >= 1");
    }
    return new Website(props);
  }

  setTheme(themeId: WebsiteThemeId, now = new Date()): void {
    if (!isWebsiteThemeId(themeId)) {
      throw new ValidationError(`Unknown themeId: ${themeId}`);
    }
    this.props.themeId = themeId;
    this.props.updatedAt = now;
  }

  /**
   * Point draft at a version that belongs to this website (DB FK enforces
   * tenant+website+version; domain keeps pointers coherent).
   */
  pointDraftVersion(versionId: string | null, now = new Date()): void {
    this.props.draftVersionId = versionId;
    this.props.updatedAt = now;
  }

  /**
   * Promote a published version pointer and mark site published.
   * Caller must have frozen the version and superseded the previous published row.
   */
  pointPublishedVersion(versionId: string, now = new Date()): void {
    this.props.publishedVersionId = versionId;
    this.props.status = "published";
    this.props.updatedAt = now;
  }

  unpublish(now = new Date()): void {
    this.props.status = "unpublished";
    this.props.updatedAt = now;
  }

  assertSameTenant(tenantId: string): void {
    if (this.props.tenantId !== tenantId) {
      throw new ValidationError("Website tenant mismatch");
    }
  }

  assertSameProperty(propertyId: string): void {
    if (this.props.propertyId !== propertyId) {
      throw new ValidationError("Website property mismatch");
    }
  }
}
