import type { FiscalSeries } from "../documents/FiscalSeries";
import type {
  FiscalDocument,
  FiscalDocumentWithLines,
} from "../documents/FiscalDocument";
import type { FiscalDocumentLine } from "../documents/FiscalDocumentLine";
import type { FiscalLineAllocation } from "../documents/FiscalAllocation";
import type { FiscalDocumentKind } from "../documents/FiscalDocumentKinds";
import type { DomainEvent } from "../../shared/kernel/DomainEvent";
import type { AuditEntry } from "../../shared/types/index";

export interface IFiscalSeriesRepository {
  save(series: FiscalSeries): Promise<void>;
  findById(tenantId: string, id: string): Promise<FiscalSeries | null>;
  findActive(
    tenantId: string,
    propertyId: string,
    documentKind: FiscalDocumentKind,
  ): Promise<FiscalSeries[]>;
  listByTenant(tenantId: string): Promise<FiscalSeries[]>;
}

export interface IssueFiscalDocumentCommand {
  document: FiscalDocument;
  lines: FiscalDocumentLine[];
  allocations: FiscalLineAllocation[];
  issuanceIdempotencyKey: string;
  domainEvents: DomainEvent[];
  auditEntry: AuditEntry;
}

export interface IssueFiscalDocumentResult {
  document: FiscalDocument;
  lines: FiscalDocumentLine[];
  /** True when idempotent retry returned the already-issued document. */
  alreadyIssued: boolean;
}

/**
 * Atomic issue: lock series → allocate sequence → insert ISSUED doc+lines+allocations
 * → outbox + audit — ONE PostgreSQL transaction.
 */
export interface IFiscalDocumentRepository {
  saveDraft(
    document: FiscalDocument,
    lines: FiscalDocumentLine[],
  ): Promise<void>;
  findById(
    tenantId: string,
    id: string,
  ): Promise<FiscalDocumentWithLines | null>;
  findByIssuanceIdempotencyKey(
    tenantId: string,
    key: string,
  ): Promise<FiscalDocumentWithLines | null>;
  listByTenant(
    tenantId: string,
    opts?: { propertyId?: string; limit?: number },
  ): Promise<FiscalDocument[]>;
  listCreditsAgainst(
    tenantId: string,
    originalDocumentId: string,
  ): Promise<FiscalDocument[]>;
  /**
   * Atomically issue. On unique idempotency conflict, returns existing ISSUED doc.
   * Sequence allocation rolls back with the transaction on failure.
   */
  issueAtomic(command: IssueFiscalDocumentCommand): Promise<IssueFiscalDocumentResult>;
}

export interface IFiscalAllocationRepository {
  listByFolioLineIds(
    tenantId: string,
    folioLineIds: string[],
  ): Promise<FiscalLineAllocation[]>;
  listByFolioId(
    tenantId: string,
    folioId: string,
  ): Promise<FiscalLineAllocation[]>;
  sumAllocatedForFolioLine(
    tenantId: string,
    folioLineId: string,
  ): Promise<string>;
}
