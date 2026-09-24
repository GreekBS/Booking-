import { BaseDomainEvent } from "../../../shared/kernel/DomainEvent";

/** F5 transmission boundary — F3 emits only; does not transmit externally. */
export class FiscalDocumentIssuedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    tenantId: string,
    payload: Record<string, unknown>,
  ) {
    // delivery_key is CHAR(64). Pure TS — no node:crypto (domain stays browser-safe).
    // Concatenate UUID hex forms (32+32) for a stable, unique 64-char key.
    const deliveryKey = `${tenantId.replace(/-/g, "")}${aggregateId.replace(/-/g, "")}`;
    super(
      "FiscalDocumentIssued",
      "FiscalDocument",
      aggregateId,
      tenantId,
      payload,
      deliveryKey,
    );
  }
}
