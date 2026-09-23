import { BaseDomainEvent } from "../../../shared/kernel/DomainEvent";

/** F5 transmission boundary — F3 emits only; does not transmit externally. */
export class FiscalDocumentIssuedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    tenantId: string,
    payload: Record<string, unknown>,
  ) {
    super(
      "FiscalDocumentIssued",
      "FiscalDocument",
      aggregateId,
      tenantId,
      payload,
      `fiscal-document-issued:${tenantId}:${aggregateId}`,
    );
  }
}
