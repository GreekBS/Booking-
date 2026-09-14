import { ConflictError } from "../../shared/errors/DomainError";
import { ExternalReservationLink } from "../domain/ExternalReservationLink";
import type { ExternalReservationLinkProps } from "../domain/ExternalReservationLink";
import type { IExternalReservationLinkRepository } from "../ports/IExternalReservationLinkRepository";

function cloneProps(props: ExternalReservationLinkProps): ExternalReservationLinkProps {
  return {
    ...props,
    importedAt: new Date(props.importedAt),
    lastSyncedAt: props.lastSyncedAt ? new Date(props.lastSyncedAt) : null,
    archivedAt: props.archivedAt ? new Date(props.archivedAt) : null,
    createdAt: new Date(props.createdAt),
    updatedAt: new Date(props.updatedAt),
  };
}

function externalReservationKey(connectionId: string, externalReservationId: string): string {
  return `${connectionId}:${externalReservationId}`;
}

function sortByMostRecentlySynced(
  left: ExternalReservationLinkProps,
  right: ExternalReservationLinkProps,
): number {
  const leftSynced = left.lastSyncedAt?.getTime() ?? left.importedAt.getTime();
  const rightSynced = right.lastSyncedAt?.getTime() ?? right.importedAt.getTime();
  return rightSynced - leftSynced;
}

export class InMemoryExternalReservationLinkRepository implements IExternalReservationLinkRepository {
  private readonly store = new Map<string, ExternalReservationLinkProps>();

  async save(link: ExternalReservationLink): Promise<void> {
    const props = cloneProps(link.toProps());
    const key = externalReservationKey(props.connectionId, props.externalReservationId);
    for (const [id, existing] of this.store.entries()) {
      if (id === props.id) {
        continue;
      }
      if (existing.tenantId !== props.tenantId) {
        continue;
      }
      if (
        externalReservationKey(existing.connectionId, existing.externalReservationId) === key
      ) {
        throw new ConflictError("External reservation link already exists for this connection");
      }
    }
    this.store.set(props.id, props);
  }

  async findById(tenantId: string, linkId: string): Promise<ExternalReservationLink | null> {
    const props = this.store.get(linkId);
    if (!props || props.tenantId !== tenantId) {
      return null;
    }
    return ExternalReservationLink.reconstitute(cloneProps(props));
  }

  async findByExternalReservation(
    tenantId: string,
    connectionId: string,
    externalReservationId: string,
  ): Promise<ExternalReservationLink | null> {
    const match = [...this.store.values()].find(
      (props) =>
        props.tenantId === tenantId &&
        props.connectionId === connectionId &&
        props.externalReservationId === externalReservationId,
    );
    return match ? ExternalReservationLink.reconstitute(cloneProps(match)) : null;
  }

  async findByBookingId(
    tenantId: string,
    bookingId: string,
  ): Promise<ExternalReservationLink | null> {
    const links = await this.listByBookingId(tenantId, bookingId);
    return links[0] ?? null;
  }

  async listByBookingId(
    tenantId: string,
    bookingId: string,
  ): Promise<ExternalReservationLink[]> {
    return [...this.store.values()]
      .filter((props) => props.tenantId === tenantId && props.bookingId === bookingId)
      .sort(sortByMostRecentlySynced)
      .map((props) => ExternalReservationLink.reconstitute(cloneProps(props)));
  }

  async listByConnection(
    tenantId: string,
    connectionId: string,
  ): Promise<ExternalReservationLink[]> {
    return [...this.store.values()]
      .filter((props) => props.tenantId === tenantId && props.connectionId === connectionId)
      .map((props) => ExternalReservationLink.reconstitute(cloneProps(props)));
  }

  clear(): void {
    this.store.clear();
  }
}
