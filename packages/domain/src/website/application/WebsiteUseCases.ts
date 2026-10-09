import {
  parseWebsiteDraftContent,
  type WebsiteDraftContent,
} from "@hcp/validators";
import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type {
  ActorContext,
  PermissionChecker,
} from "../../shared/services/PermissionChecker";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IPropertyRepository } from "../../catalog/ports/ICatalogRepositories";
import { Website } from "../domain/Website";
import { WebsiteVersion } from "../domain/WebsiteVersion";
import {
  isWebsiteThemeId,
  WEBSITE_CONTENT_SCHEMA_VERSION,
  type WebsiteThemeId,
} from "../domain/WebsiteTypes";
import type {
  IWebsiteRepository,
  IWebsiteUnitOfWork,
  IWebsiteVersionRepository,
} from "../ports/IWebsiteRepository";
import {
  canEditWebsiteOnProperty,
  canPublishWebsiteOnProperty,
  canReadWebsiteOnProperty,
} from "./websiteAccess";

function parseDraftOrThrow(input: unknown): WebsiteDraftContent {
  try {
    return parseWebsiteDraftContent(input);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid website draft content";
    throw new ValidationError(message);
  }
}

export interface EnsureWebsiteCommand {
  tenantId: string;
  propertyId: string;
  themeId?: WebsiteThemeId;
}

export class EnsureWebsiteUseCase {
  constructor(
    private readonly websites: IWebsiteRepository,
    private readonly versions: IWebsiteVersionRepository,
    private readonly unitOfWork: IWebsiteUnitOfWork,
    private readonly properties: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    command: EnsureWebsiteCommand,
    actor: ActorContext,
  ): Promise<Result<{ website: Website; draft: WebsiteVersion }, Error>> {
    try {
      if (
        !canEditWebsiteOnProperty(
          this.permissionChecker,
          actor,
          command.tenantId,
          command.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const property = await this.properties.findById(
        command.tenantId,
        command.propertyId,
      );
      if (!property || property.deletedAt) {
        return Result.fail(new NotFoundError("Property", command.propertyId));
      }

      const existing = await this.websites.findByPropertyId(
        command.tenantId,
        command.propertyId,
      );
      if (existing) {
        existing.assertSameTenant(command.tenantId);
        let draft: WebsiteVersion | null = null;
        if (existing.draftVersionId) {
          draft = await this.versions.findById(
            command.tenantId,
            existing.draftVersionId,
          );
        }
        if (!draft) {
          return Result.fail(
            new ValidationError("Website exists without a draft version"),
          );
        }
        return Result.ok({ website: existing, draft });
      }

      const website = Website.create({
        id: this.idGenerator.generate(),
        tenantId: command.tenantId,
        propertyId: command.propertyId,
        themeId: command.themeId,
      });
      const draft = WebsiteVersion.create({
        id: this.idGenerator.generate(),
        tenantId: command.tenantId,
        websiteId: website.id,
        versionNumber: 1,
        locale: "el",
        sections: [],
        seo: {},
      });
      website.pointDraftVersion(draft.id);
      await this.unitOfWork.saveDraft({ website, draft });
      return Result.ok({ website, draft });
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

export interface GetWebsiteCommand {
  tenantId: string;
  propertyId: string;
}

export class GetWebsiteUseCase {
  constructor(
    private readonly websites: IWebsiteRepository,
    private readonly versions: IWebsiteVersionRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: GetWebsiteCommand,
    actor: ActorContext,
  ): Promise<
    Result<
      {
        website: Website;
        draft: WebsiteVersion | null;
        published: WebsiteVersion | null;
      },
      Error
    >
  > {
    try {
      if (
        !canReadWebsiteOnProperty(
          this.permissionChecker,
          actor,
          command.tenantId,
          command.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const website = await this.websites.findByPropertyId(
        command.tenantId,
        command.propertyId,
      );
      if (!website) {
        return Result.fail(new NotFoundError("Website", command.propertyId));
      }
      website.assertSameTenant(command.tenantId);
      website.assertSameProperty(command.propertyId);

      const draft = website.draftVersionId
        ? await this.versions.findById(command.tenantId, website.draftVersionId)
        : null;
      const published = website.publishedVersionId
        ? await this.versions.findById(
            command.tenantId,
            website.publishedVersionId,
          )
        : null;

      return Result.ok({ website, draft, published });
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

export interface SaveWebsiteDraftCommand {
  tenantId: string;
  propertyId: string;
  /** Raw payload — validated via contentSchemaVersion=1 Zod contract. */
  content: unknown;
}

export class SaveWebsiteDraftUseCase {
  constructor(
    private readonly websites: IWebsiteRepository,
    private readonly versions: IWebsiteVersionRepository,
    private readonly unitOfWork: IWebsiteUnitOfWork,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    command: SaveWebsiteDraftCommand,
    actor: ActorContext,
  ): Promise<Result<{ website: Website; draft: WebsiteVersion }, Error>> {
    try {
      if (
        !canEditWebsiteOnProperty(
          this.permissionChecker,
          actor,
          command.tenantId,
          command.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const parsed = parseDraftOrThrow(command.content);
      if (parsed.contentSchemaVersion !== WEBSITE_CONTENT_SCHEMA_VERSION) {
        return Result.fail(
          new ValidationError(
            `Unsupported contentSchemaVersion: ${parsed.contentSchemaVersion}`,
          ),
        );
      }

      const website = await this.websites.findByPropertyId(
        command.tenantId,
        command.propertyId,
      );
      if (!website) {
        return Result.fail(new NotFoundError("Website", command.propertyId));
      }
      website.assertSameTenant(command.tenantId);

      let draft: WebsiteVersion | null = website.draftVersionId
        ? await this.versions.findById(command.tenantId, website.draftVersionId)
        : null;

      if (draft && draft.isDraft) {
        draft.replaceDraftContent({
          locale: parsed.locale,
          sections: parsed.sections,
          seo: parsed.seo,
        });
      } else {
        // Published draft pointer missing or frozen → allocate a new draft row
        // so live published content stays untouched (draft/published coexistence).
        const versionNumber = await this.versions.nextVersionNumber(
          command.tenantId,
          website.id,
        );
        draft = WebsiteVersion.create({
          id: this.idGenerator.generate(),
          tenantId: command.tenantId,
          websiteId: website.id,
          versionNumber,
          locale: parsed.locale,
          sections: parsed.sections,
          seo: parsed.seo,
        });
        website.pointDraftVersion(draft.id);
      }

      website.setTheme(parsed.themeId);
      await this.unitOfWork.saveDraft({ website, draft });
      return Result.ok({ website, draft });
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

export interface UpdateWebsiteThemeCommand {
  tenantId: string;
  propertyId: string;
  themeId: string;
}

export class UpdateWebsiteThemeUseCase {
  constructor(
    private readonly websites: IWebsiteRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: UpdateWebsiteThemeCommand,
    actor: ActorContext,
  ): Promise<Result<Website, Error>> {
    try {
      if (
        !canEditWebsiteOnProperty(
          this.permissionChecker,
          actor,
          command.tenantId,
          command.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      if (!isWebsiteThemeId(command.themeId)) {
        return Result.fail(
          new ValidationError(`Unknown themeId: ${command.themeId}`),
        );
      }

      const website = await this.websites.findByPropertyId(
        command.tenantId,
        command.propertyId,
      );
      if (!website) {
        return Result.fail(new NotFoundError("Website", command.propertyId));
      }
      website.assertSameTenant(command.tenantId);
      website.setTheme(command.themeId);
      await this.websites.save(website);
      return Result.ok(website);
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

export interface PublishWebsiteCommand {
  tenantId: string;
  propertyId: string;
}

/**
 * Domain publish transition only — no DNS, public host routing, or CDN.
 * Freezes the current draft as published, supersedes the prior published
 * version (if any), and allocates a new draft that copies the published
 * snapshot so operators can keep editing without mutating the live row.
 *
 * Persistence must be atomic via {@link IWebsiteUnitOfWork.publish}. After a
 * failed Result, discard in-memory aggregates and reload.
 */
export class PublishWebsiteUseCase {
  constructor(
    private readonly websites: IWebsiteRepository,
    private readonly versions: IWebsiteVersionRepository,
    private readonly unitOfWork: IWebsiteUnitOfWork,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    command: PublishWebsiteCommand,
    actor: ActorContext,
  ): Promise<
    Result<{ website: Website; published: WebsiteVersion; draft: WebsiteVersion }, Error>
  > {
    try {
      if (
        !canPublishWebsiteOnProperty(
          this.permissionChecker,
          actor,
          command.tenantId,
          command.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const website = await this.websites.findByPropertyId(
        command.tenantId,
        command.propertyId,
      );
      if (!website) {
        return Result.fail(new NotFoundError("Website", command.propertyId));
      }
      website.assertSameTenant(command.tenantId);
      website.assertSameProperty(command.propertyId);

      if (!website.draftVersionId) {
        return Result.fail(new ValidationError("No draft version to publish"));
      }
      const draft = await this.versions.findById(
        command.tenantId,
        website.draftVersionId,
      );
      if (!draft || !draft.isDraft) {
        return Result.fail(new ValidationError("Draft version is not editable"));
      }
      if (draft.websiteId !== website.id || draft.tenantId !== website.tenantId) {
        return Result.fail(
          new ValidationError("Draft version does not belong to this website"),
        );
      }

      // Re-validate frozen payload before any state transition.
      parseDraftOrThrow({
        contentSchemaVersion: website.contentSchemaVersion,
        locale: draft.locale,
        sections: draft.sections,
        seo: draft.seo,
        themeId: website.themeId,
      });

      // Prepare next draft row before mutating publish pointers.
      const nextNumber = await this.versions.nextVersionNumber(
        command.tenantId,
        website.id,
      );
      const nextDraft = WebsiteVersion.create({
        id: this.idGenerator.generate(),
        tenantId: command.tenantId,
        websiteId: website.id,
        versionNumber: nextNumber,
        locale: draft.locale,
        sections: draft.sections,
        seo: draft.seo,
      });

      let superseded: WebsiteVersion | null = null;
      if (website.publishedVersionId) {
        superseded = await this.versions.findById(
          command.tenantId,
          website.publishedVersionId,
        );
        if (superseded && !superseded.isPublished) {
          return Result.fail(
            new ValidationError(
              "Published pointer does not reference a published version",
            ),
          );
        }
      }

      if (superseded) {
        superseded.markSuperseded();
      }
      draft.markPublished(actor.userId);
      website.pointPublishedVersion(draft.id);
      website.pointDraftVersion(nextDraft.id);

      await this.unitOfWork.publish({
        website,
        published: draft,
        superseded,
        nextDraft,
      });

      return Result.ok({ website, published: draft, draft: nextDraft });
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
