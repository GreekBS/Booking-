import type { OutboxEntry } from "../../shared/types/index";
import type { IOutboxEventHandler } from "../../platform/async/ports/IOutboxEventHandler";
import type { EnqueueJobUseCase } from "../../platform/async/jobs/application/EnqueueJobUseCase";
import { ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE } from "../providers/ical/inventory/icalInventoryReconcileOutboxIdentity";
import {
  buildIcalInventoryReconcilePrimaryJobKey,
} from "../providers/ical/inventory/icalInventoryReconcileJobIdentity";
import { RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";

/**
 * P1-S6b — enqueue-only bridge. Never mutates inventory.
 */
export class IcalInventoryReconcileOutboxHandler implements IOutboxEventHandler {
  constructor(private readonly enqueueJobUseCase: EnqueueJobUseCase) {}

  canHandle(eventType: string): boolean {
    return eventType === ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE;
  }

  async handle(entry: OutboxEntry): Promise<void> {
    const tenantId = entry.tenantId;
    if (!tenantId) {
      throw new Error("inventory reconcile outbox entry missing tenantId");
    }

    const payload = entry.payload;
    const connectionId = payload.connectionId;
    const cursorVersion = payload.cursorVersion;
    const semanticConfigVersion = payload.semanticConfigVersion;
    const mappingId = payload.mappingId;
    const mappingVersion = payload.mappingVersion;

    if (typeof connectionId !== "string" || connectionId.trim().length === 0) {
      throw new Error("inventory reconcile outbox payload missing connectionId");
    }
    if (typeof cursorVersion !== "number" || !Number.isInteger(cursorVersion) || cursorVersion < 1) {
      throw new Error("inventory reconcile outbox payload missing cursorVersion");
    }

    const idempotencyKey = buildIcalInventoryReconcilePrimaryJobKey({
      tenantId,
      connectionId: connectionId.trim(),
      cursorVersion,
    });

    const enqueued = await this.enqueueJobUseCase.execute({
      tenantId,
      jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
      idempotencyKey,
      payload: {
        connectionId: connectionId.trim(),
        cursorVersion,
        semanticConfigVersion,
        mappingId,
        mappingVersion,
      },
    });
    if (enqueued.isFailure) {
      throw enqueued.getError();
    }
  }
}
