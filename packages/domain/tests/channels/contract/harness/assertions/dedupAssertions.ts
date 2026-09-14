import { expect } from "vitest";
import { ChannelInboxDeduplicationKey } from "../../../../../src/channels/domain/value-objects/ChannelInboxDeduplicationKey";
import type { ChannelProviderMessage } from "../../../../../src/channels/types/ChannelProviderMessage";

export function assertCreateDedupKey(connectionId: string, externalReservationId: string): void {
  expect(
    ChannelInboxDeduplicationKey.forCreate(connectionId, externalReservationId).value,
  ).toBe(`ingress:create:${connectionId}:${externalReservationId}`);
}

export function assertModifyDedupKey(
  connectionId: string,
  externalReservationId: string,
  revision: string,
): void {
  expect(
    ChannelInboxDeduplicationKey.forModify(connectionId, externalReservationId, revision).value,
  ).toBe(`ingress:modify:${connectionId}:${externalReservationId}:${revision}`);
}

export function assertCancelDedupKey(
  connectionId: string,
  externalReservationId: string,
  revision: string,
): void {
  expect(
    ChannelInboxDeduplicationKey.forCancel(connectionId, externalReservationId, revision).value,
  ).toBe(`ingress:cancel:${connectionId}:${externalReservationId}:${revision}`);
}

export function assertUnknownDedupKey(connectionId: string, eventId: string): void {
  expect(ChannelInboxDeduplicationKey.forUnknown(connectionId, eventId).value).toBe(
    `ingress:unknown:${connectionId}:${eventId}`,
  );
}

export function assertMaintenanceDedupKey(
  connectionId: string,
  kind: string,
  eventId: string,
): void {
  expect(ChannelInboxDeduplicationKey.forMaintenanceEvent(connectionId, kind, eventId).value).toBe(
    `ingress:maintenance:${connectionId}:${kind}:${eventId}`,
  );
}

export function assertCrossTransportDedupKeyParity(
  connectionId: string,
  message: ChannelProviderMessage,
): void {
  const key = ChannelInboxDeduplicationKey.forIngressMessage(connectionId, message).value;
  expect(key.length).toBeGreaterThan(0);
  expect(key).toContain(connectionId);
}

export function assertColonInIdentifierAccepted(connectionId: string, externalId: string): void {
  expect(
    ChannelInboxDeduplicationKey.forCreate(connectionId, externalId).value,
  ).toContain(externalId);
}

export function assertConnectionIsolation(
  connectionA: string,
  connectionB: string,
  externalReservationId: string,
): void {
  const keyA = ChannelInboxDeduplicationKey.forCreate(connectionA, externalReservationId).value;
  const keyB = ChannelInboxDeduplicationKey.forCreate(connectionB, externalReservationId).value;
  expect(keyA).not.toBe(keyB);
}
