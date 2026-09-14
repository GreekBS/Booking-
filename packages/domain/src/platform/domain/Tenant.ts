import { AggregateRoot } from "../../shared/kernel/Entity";
import { TenantId } from "../../shared/value-objects/Ids";
import { TenantSlug } from "../../shared/value-objects/Slug";
import { TenantSettings } from "../../shared/value-objects/Policies";
import type { TenantStatus } from "../../shared/types/index";
import {
  TenantActivatedEvent,
  TenantCreatedEvent,
  TenantSettingsUpdatedEvent,
  TenantSuspendedEvent,
} from "./events/TenantEvents";

export interface TenantProps {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateTenantProps {
  id: string;
  name: string;
  slug: string;
  settings?: TenantSettings;
}

export class Tenant extends AggregateRoot<TenantProps> {
  private constructor(props: TenantProps) {
    super(props);
  }

  get tenantId(): TenantId {
    return TenantId.create(this.props.id);
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): TenantSlug {
    return TenantSlug.create(this.props.slug);
  }

  get status(): TenantStatus {
    return this.props.status;
  }

  get settings(): TenantSettings {
    return this.props.settings;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  get isActive(): boolean {
    return this.props.status === "active" && this.props.deletedAt === null;
  }

  static create(props: CreateTenantProps): Tenant {
    const now = new Date();
    const tenant = new Tenant({
      id: props.id,
      name: props.name.trim(),
      slug: props.slug,
      status: "active",
      settings: props.settings ?? TenantSettings.create(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    tenant.addDomainEvent(
      new TenantCreatedEvent(props.id, {
        name: props.name,
        slug: props.slug,
      }),
    );

    return tenant;
  }

  static reconstitute(props: TenantProps): Tenant {
    return new Tenant(props);
  }

  suspend(reason?: string): void {
    if (this.props.status === "suspended") {
      return;
    }
    this.props.status = "suspended";
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new TenantSuspendedEvent(this.props.id, { reason }),
    );
  }

  activate(): void {
    if (this.props.status === "active") {
      return;
    }
    this.props.status = "active";
    this.props.updatedAt = new Date();
    this.addDomainEvent(new TenantActivatedEvent(this.props.id));
  }

  updateSettings(settings: TenantSettings): void {
    this.props.settings = settings;
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new TenantSettingsUpdatedEvent(this.props.id, {
        changedFields: ["settings"],
      }),
    );
  }

  updateName(name: string): void {
    this.props.name = name.trim();
    this.props.updatedAt = new Date();
  }

  toProps(): TenantProps {
    return { ...this.props };
  }
}
