import { ValueObject } from "../kernel/ValueObject";
import { ValidationError } from "../errors/DomainError";

interface SlugProps {
  value: string;
}

export class Slug extends ValueObject<SlugProps> {
  protected constructor(value: string) {
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static create(raw: string): Slug {
    const value = raw.trim().toLowerCase();

    if (value.length < 3 || value.length > 63) {
      throw new ValidationError("Slug must be between 3 and 63 characters");
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      throw new ValidationError(
        "Slug must be lowercase alphanumeric with hyphens",
      );
    }

    return new Slug(value);
  }

  static fromName(name: string): Slug {
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (slug.length < 3) {
      return Slug.create(`${slug}-org`.slice(0, 63));
    }

    return Slug.create(slug.slice(0, 63));
  }
}

export class TenantSlug extends Slug {
  static override create(raw: string): TenantSlug {
    return super.create(raw) as TenantSlug;
  }

  static override fromName(name: string): TenantSlug {
    return super.fromName(name) as TenantSlug;
  }
}

export class PropertySlug extends Slug {
  static override create(raw: string): PropertySlug {
    return super.create(raw) as PropertySlug;
  }

  static override fromName(name: string): PropertySlug {
    return super.fromName(name) as PropertySlug;
  }
}
