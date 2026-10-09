import { Entity } from "../../shared/kernel/Entity";
import { ValidationError } from "../../shared/errors/DomainError";
import {
  isWebsiteVersionState,
  type WebsiteVersionState,
  WEBSITE_CONTENT_SCHEMA_VERSION,
} from "./WebsiteTypes";

export interface WebsiteVersionProps {
  id: string;
  tenantId: string;
  websiteId: string;
  versionNumber: number;
  locale: string;
  sections: unknown;
  seo: unknown;
  state: WebsiteVersionState;
  publishedAt: Date | null;
  publishedBy: string | null;
  createdAt: Date;
}

export interface CreateWebsiteVersionInput {
  id: string;
  tenantId: string;
  websiteId: string;
  versionNumber: number;
  locale?: string;
  sections?: unknown;
  seo?: unknown;
  now?: Date;
}

export class WebsiteVersion extends Entity<WebsiteVersionProps> {
  private constructor(props: WebsiteVersionProps) {
    super(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get websiteId(): string {
    return this.props.websiteId;
  }

  get versionNumber(): number {
    return this.props.versionNumber;
  }

  get locale(): string {
    return this.props.locale;
  }

  get sections(): unknown {
    return this.props.sections;
  }

  get seo(): unknown {
    return this.props.seo;
  }

  get state(): WebsiteVersionState {
    return this.props.state;
  }

  get publishedAt(): Date | null {
    return this.props.publishedAt;
  }

  get publishedBy(): string | null {
    return this.props.publishedBy;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get isDraft(): boolean {
    return this.props.state === "draft";
  }

  get isPublished(): boolean {
    return this.props.state === "published";
  }

  static create(input: CreateWebsiteVersionInput): WebsiteVersion {
    if (!Number.isInteger(input.versionNumber) || input.versionNumber < 1) {
      throw new ValidationError("versionNumber must be a positive integer");
    }
    const locale = (input.locale ?? "el").trim();
    if (!locale || locale.length > 16) {
      throw new ValidationError("locale is required (max 16)");
    }
    const now = input.now ?? new Date();
    return new WebsiteVersion({
      id: input.id,
      tenantId: input.tenantId,
      websiteId: input.websiteId,
      versionNumber: input.versionNumber,
      locale,
      sections: input.sections ?? [],
      seo: input.seo ?? {},
      state: "draft",
      publishedAt: null,
      publishedBy: null,
      createdAt: now,
    });
  }

  static reconstitute(props: WebsiteVersionProps): WebsiteVersion {
    if (!isWebsiteVersionState(props.state)) {
      throw new ValidationError(`Invalid website version state: ${props.state}`);
    }
    return new WebsiteVersion(props);
  }

  /**
   * Replace draft snapshot content. Rejects mutation of published/superseded rows
   * so publish history stays immutable.
   */
  replaceDraftContent(input: {
    locale: string;
    sections: unknown;
    seo: unknown;
  }): void {
    if (this.props.state !== "draft") {
      throw new ValidationError("Only draft versions can be edited");
    }
    const locale = input.locale.trim();
    if (!locale || locale.length > 16) {
      throw new ValidationError("locale is required (max 16)");
    }
    this.props.locale = locale;
    this.props.sections = input.sections;
    this.props.seo = input.seo;
  }

  markPublished(actorUserId: string, now = new Date()): void {
    if (this.props.state !== "draft") {
      throw new ValidationError("Only draft versions can be published");
    }
    this.props.state = "published";
    this.props.publishedAt = now;
    this.props.publishedBy = actorUserId;
  }

  markSuperseded(): void {
    if (this.props.state !== "published") {
      throw new ValidationError("Only published versions can be superseded");
    }
    this.props.state = "superseded";
  }

  /** Content schema expected by this snapshot (mirrors Website.contentSchemaVersion). */
  get expectedContentSchemaVersion(): typeof WEBSITE_CONTENT_SCHEMA_VERSION {
    return WEBSITE_CONTENT_SCHEMA_VERSION;
  }
}
