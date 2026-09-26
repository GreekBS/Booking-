import { AggregateRoot } from "../../shared/kernel/Entity";
import { ConflictError } from "../../shared/errors/DomainError";
import { HousekeepingStateMachine } from "./HousekeepingStateMachine";
import type {
  UnitHousekeepingSource,
  UnitHousekeepingStatusValue,
} from "./TaskTypes";

export interface UnitHousekeepingStatusProps {
  tenantId: string;
  propertyId: string;
  unitId: string;
  status: UnitHousekeepingStatusValue;
  source: UnitHousekeepingSource;
  updatedByUserId: string | null;
  updatedAt: Date;
  version: number;
}

export interface CreateUnitHousekeepingStatusInput {
  tenantId: string;
  propertyId: string;
  unitId: string;
  status?: UnitHousekeepingStatusValue;
  source?: UnitHousekeepingSource;
  updatedByUserId?: string | null;
  now?: Date;
}

export class UnitHousekeepingStatus extends AggregateRoot<{
  id: string;
} & UnitHousekeepingStatusProps> {
  private constructor(props: { id: string } & UnitHousekeepingStatusProps) {
    super(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }
  get propertyId(): string {
    return this.props.propertyId;
  }
  get unitId(): string {
    return this.props.unitId;
  }
  get status(): UnitHousekeepingStatusValue {
    return this.props.status;
  }
  get source(): UnitHousekeepingSource {
    return this.props.source;
  }
  get updatedByUserId(): string | null {
    return this.props.updatedByUserId;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get version(): number {
    return this.props.version;
  }

  toProps(): UnitHousekeepingStatusProps {
    const { id: _id, ...rest } = this.props;
    return { ...rest };
  }

  static create(input: CreateUnitHousekeepingStatusInput): UnitHousekeepingStatus {
    const now = input.now ?? new Date();
    return new UnitHousekeepingStatus({
      id: input.unitId,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      unitId: input.unitId,
      status: input.status ?? "CLEAN",
      source: input.source ?? "INIT",
      updatedByUserId: input.updatedByUserId ?? null,
      updatedAt: now,
      version: 1,
    });
  }

  static reconstitute(
    props: UnitHousekeepingStatusProps,
  ): UnitHousekeepingStatus {
    return new UnitHousekeepingStatus({ id: props.unitId, ...props });
  }

  assertExpectedVersion(expectedVersion: number): void {
    if (this.props.version !== expectedVersion) {
      throw new ConflictError(
        "Unit housekeeping version conflict",
        "housekeeping_version_conflict",
      );
    }
  }

  markDirty(
    expectedVersion: number,
    source: UnitHousekeepingSource,
    updatedByUserId: string | null,
    at: Date = new Date(),
  ): boolean {
    this.assertExpectedVersion(expectedVersion);
    if (HousekeepingStateMachine.isNoOp(this.props.status, "DIRTY")) {
      return false;
    }
    HousekeepingStateMachine.assertCanTransition(this.props.status, "DIRTY");
    this.props.status = "DIRTY";
    this.props.source = source;
    this.props.updatedByUserId = updatedByUserId;
    this.props.version += 1;
    this.props.updatedAt = at;
    return true;
  }

  markClean(
    expectedVersion: number,
    source: UnitHousekeepingSource,
    updatedByUserId: string | null,
    at: Date = new Date(),
  ): boolean {
    this.assertExpectedVersion(expectedVersion);
    if (HousekeepingStateMachine.isNoOp(this.props.status, "CLEAN")) {
      return false;
    }
    HousekeepingStateMachine.assertCanTransition(this.props.status, "CLEAN");
    this.props.status = "CLEAN";
    this.props.source = source;
    this.props.updatedByUserId = updatedByUserId;
    this.props.version += 1;
    this.props.updatedAt = at;
    return true;
  }
}
