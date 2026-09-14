import { ValidationError } from "../../../../shared/errors/DomainError";
import { ChannelInboxDeduplicationKey } from "../../../domain/value-objects/ChannelInboxDeduplicationKey";
import type { ChannelProviderMessage } from "../../../types/ChannelProviderMessage";
import { buildReservationUnknownMessage } from "../../../types/buildReservationUnknownMessage";
import type { IcalMappedRecord } from "../map/icalEvidenceTypes";
import { ICAL_EVIDENCE_PAYLOAD_KEYS } from "./icalEvidencePayloadKeys";
import {
  assignIcalIngressOccurrenceOrdinals,
  buildIcalIngressDedupDigestHex,
  buildIcalIngressDedupKeyV1,
  buildIcalIngressMessageIdV1,
  contentFingerprintForRecord,
  type IcalIngressSemanticIdentity,
} from "./icalIngressIdentityCodec";

export interface IcalInboundIngressItem {
  readonly message: ChannelProviderMessage;
  readonly deduplicationKey: ChannelInboxDeduplicationKey;
}

export function buildIcalInboundIngressItems(
  records: readonly IcalMappedRecord[],
  connectionId: string,
): readonly IcalInboundIngressItem[] {
  const ordinals = assignIcalIngressOccurrenceOrdinals(records);
  const items: IcalInboundIngressItem[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const occurrenceOrdinal = ordinals[index]!;
    const contentFingerprintHex = contentFingerprintForRecord(record);
    const semanticIdentity: IcalIngressSemanticIdentity = {
      connectionId,
      change: record.change,
      identityKey: record.identityKey,
      contentFingerprintHex,
      occurrenceOrdinal,
    };
    const dedupDigestHex = buildIcalIngressDedupDigestHex(semanticIdentity);
    const deduplicationKey = buildIcalIngressDedupKeyV1(semanticIdentity);
    const messageId = buildIcalIngressMessageIdV1(dedupDigestHex);

    const evidencePayload: Record<string, unknown> = {
      [ICAL_EVIDENCE_PAYLOAD_KEYS.IDENTITY_KEY]: record.identityKey,
      [ICAL_EVIDENCE_PAYLOAD_KEYS.CHANGE]: record.change,
      [ICAL_EVIDENCE_PAYLOAD_KEYS.EVIDENCE_KIND]: record.evidenceKind,
      [ICAL_EVIDENCE_PAYLOAD_KEYS.REASON_CODES]: [...record.reasonCodes],
      [ICAL_EVIDENCE_PAYLOAD_KEYS.INGRESS_DEDUP_DIGEST_HEX]: dedupDigestHex,
    };
    if (record.providerEventId !== null) {
      evidencePayload.providerEventId = record.providerEventId;
    }
    if (record.change === "removed") {
      evidencePayload[ICAL_EVIDENCE_PAYLOAD_KEYS.PREVIOUS_ENTRY_CONTENT_HASH] =
        record.previousEntryContentHash;
    } else {
      evidencePayload[ICAL_EVIDENCE_PAYLOAD_KEYS.ENTRY_CONTENT_HASH] = record.entryContentHash;
      if (record.interval !== null) {
        evidencePayload[ICAL_EVIDENCE_PAYLOAD_KEYS.INTERVAL] = record.interval;
      }
    }

    const primaryCategory = record.primaryCategory;
    if (primaryCategory === null) {
      throw new ValidationError("iCal mapped record primaryCategory is required");
    }
    const reasonCode = record.reasonCodes[0];
    if (reasonCode === undefined || reasonCode.trim().length === 0) {
      throw new ValidationError("iCal mapped record requires at least one reason code");
    }

    const messageResult = buildReservationUnknownMessage({
      messageId,
      connectionId,
      provider: "ical",
      classification: {
        taxonomyVersion: 1,
        category: primaryCategory,
        reasonCode,
        reclassifiable: true,
      },
      evidencePayload,
    });
    if (messageResult.isFailure) {
      throw messageResult.getError();
    }

    items.push({
      message: messageResult.getValue(),
      deduplicationKey,
    });
  }

  return items;
}
