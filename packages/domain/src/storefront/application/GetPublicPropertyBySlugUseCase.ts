import { Result } from "../../shared/kernel/Result";
import { NotFoundError } from "../../shared/errors/DomainError";
import type { IStorefrontCatalogPort, PublicPropertyReadModel } from "../ports/StorefrontPorts";

export class GetPublicPropertyBySlugUseCase {
  constructor(private readonly catalog: IStorefrontCatalogPort) {}

  async execute(
    tenantId: string,
    slug: string,
  ): Promise<Result<PublicPropertyReadModel, Error>> {
    try {
      const property = await this.catalog.getPublishedPropertyBySlug(tenantId, slug);
      if (!property) {
        return Result.fail(new NotFoundError("Property", slug));
      }
      return Result.ok(property);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
