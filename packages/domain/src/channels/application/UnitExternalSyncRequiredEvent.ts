import { BaseDomainEvent } from "../../shared/kernel/DomainEvent";
import {
  mutationOriginToPayload,
  type MutationOrigin,
} from "../../shared/types/MutationOrigin";
import {
  UNIT_EXTERNAL_SYNC_REQUIRED_EVENT_TYPE,
  buildUnitExternalSyncDeliveryKey,
  type ChannelUnitSyncChangeKind,
} from "../types/ChannelUnitSyncChange";

/**
 * Durable intent that a unit's externally synchronized ARI state changed.
 * Emitted from Commerce application boundaries (manual blocks / rates / rules)
 * when no Booking/Hold aggregate event already covers the change.
 */
export class UnitExternalSyncRequiredEvent extends BaseDomainEvent {
  constructor(input: {
    tenantId: string;
    unitId: string;
    propertyId: string;
    from: string;
    to: string;
    changeKinds: readonly ChannelUnitSyncChangeKind[];
    mutationOrigin: MutationOrigin | null;
    revision: number;
    sourceEventId: string;
  }) {
    super(
      UNIT_EXTERNAL_SYNC_REQUIRED_EVENT_TYPE,
      "Unit",
      input.unitId,
      input.tenantId,
      {
        unitId: input.unitId,
        propertyId: input.propertyId,
        from: input.from,
        to: input.to,
        changeKinds: [...input.changeKinds],
        mutationOrigin: mutationOriginToPayload(input.mutationOrigin),
        revision: input.revision,
        sourceEventId: input.sourceEventId,
      },
      buildUnitExternalSyncDeliveryKey({
        tenantId: input.tenantId,
        unitId: input.unitId,
        sourceEventId: input.sourceEventId,
      }),
    );
  }
}
