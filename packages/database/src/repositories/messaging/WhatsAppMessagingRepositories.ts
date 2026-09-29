import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type {
  BookingMessagingProfileRecord,
  MessagingAutomationRunRecord,
  MessagingContactTokenRecord,
  MessagingUnmatchedInboundRecord,
  PlatformMessagingConnectionRecord,
  PropertyMessagingSettingsRecord,
  IBookingMessagingProfileRepository,
  IMessagingAutomationRunRepository,
  IMessagingContactTokenRepository,
  IMessagingSecretVault,
  IMessagingUnmatchedInboundRepository,
  IMessagingWaIdentityRouteWriter,
  IPlatformMessagingConnectionRepository,
  IPropertyMessagingSettingsRepository,
  IWhatsAppCloudApiAdapter,
  WhatsAppOutboundSendRequest,
  WhatsAppOutboundSendResult,
} from "@hcp/domain";
import { prisma, withTenantTransaction, clearTenantContext } from "../../client";
import {
  parseChannelsCredentialsMasterKey,
  sealUtf8Payload,
  unsealUtf8Payload,
} from "../channels/channelCredentialCrypto";

function mapPlatform(row: {
  id: string;
  channel: string;
  provider: string;
  externalAccountId: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  credentialRef: string | null;
  webhookVerificationRef: string | null;
  status: string;
  configJson: unknown;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PlatformMessagingConnectionRecord {
  return {
    id: row.id,
    channel: "whatsapp",
    provider: row.provider,
    externalAccountId: row.externalAccountId,
    phoneNumberId: row.phoneNumberId,
    displayPhoneNumber: row.displayPhoneNumber,
    credentialRef: row.credentialRef,
    webhookVerificationRef: row.webhookVerificationRef,
    status: row.status as PlatformMessagingConnectionRecord["status"],
    configJson: (row.configJson as Record<string, unknown>) ?? {},
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaPlatformMessagingConnectionRepository
  implements IPlatformMessagingConnectionRepository
{
  async findConnectedWhatsApp(): Promise<PlatformMessagingConnectionRecord | null> {
    await clearTenantContext(prisma);
    const row = await prisma.platformMessagingConnection.findFirst({
      where: { channel: "whatsapp", status: "connected" },
    });
    return row ? mapPlatform(row) : null;
  }

  async findByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<PlatformMessagingConnectionRecord | null> {
    await clearTenantContext(prisma);
    const row = await prisma.platformMessagingConnection.findFirst({
      where: { phoneNumberId },
    });
    return row ? mapPlatform(row) : null;
  }

  async upsertConnected(
    input: PlatformMessagingConnectionRecord,
  ): Promise<PlatformMessagingConnectionRecord> {
    await clearTenantContext(prisma);
    const row = await prisma.platformMessagingConnection.upsert({
      where: { id: input.id },
      create: {
        id: input.id,
        channel: "whatsapp",
        provider: input.provider,
        externalAccountId: input.externalAccountId,
        phoneNumberId: input.phoneNumberId,
        displayPhoneNumber: input.displayPhoneNumber,
        credentialRef: input.credentialRef,
        webhookVerificationRef: input.webhookVerificationRef,
        status: input.status,
        configJson: input.configJson as object,
        lastError: input.lastError,
      },
      update: {
        externalAccountId: input.externalAccountId,
        phoneNumberId: input.phoneNumberId,
        displayPhoneNumber: input.displayPhoneNumber,
        credentialRef: input.credentialRef,
        webhookVerificationRef: input.webhookVerificationRef,
        status: input.status,
        configJson: input.configJson as object,
        lastError: input.lastError,
      },
    });
    return mapPlatform(row);
  }
}

export class PrismaMessagingSecretVault implements IMessagingSecretVault {
  private masterKey: Buffer | undefined;
  private readonly masterKeyRaw: string | undefined;

  constructor(
    masterKeyRaw: string | undefined = process.env.MESSAGING_CREDENTIALS_MASTER_KEY ??
      process.env.CHANNELS_CREDENTIALS_MASTER_KEY,
  ) {
    this.masterKeyRaw = masterKeyRaw;
  }

  private getMasterKey(): Buffer {
    if (!this.masterKey) {
      this.masterKey = parseChannelsCredentialsMasterKey(this.masterKeyRaw);
    }
    return this.masterKey;
  }

  async putPlatformCredential(material: Record<string, string>): Promise<string> {
    await clearTenantContext(prisma);
    const id = randomUUID();
    const sealed = sealUtf8Payload(this.getMasterKey(), JSON.stringify(material));
    await prisma.messagingSecretRecord.create({
      data: {
        id,
        ownerKind: "platform",
        tenantId: null,
        kind: "credential",
        ciphertext: new Uint8Array(sealed.ciphertext),
        keyVersion: sealed.keyVersion,
      },
    });
    return `platform/${id}`;
  }

  async putPlatformWebhookVerification(secret: string): Promise<string> {
    await clearTenantContext(prisma);
    const id = randomUUID();
    const sealed = sealUtf8Payload(
      this.getMasterKey(),
      JSON.stringify({ secret }),
    );
    await prisma.messagingSecretRecord.create({
      data: {
        id,
        ownerKind: "platform",
        tenantId: null,
        kind: "webhook_verification",
        ciphertext: new Uint8Array(sealed.ciphertext),
        keyVersion: sealed.keyVersion,
      },
    });
    return `platform/${id}`;
  }

  async resolvePlatformCredential(ref: string): Promise<Record<string, string>> {
    const plaintext = await this.loadPlatform(ref, "credential");
    return JSON.parse(plaintext) as Record<string, string>;
  }

  async resolvePlatformWebhookVerification(ref: string): Promise<string> {
    const plaintext = await this.loadPlatform(ref, "webhook_verification");
    const parsed = JSON.parse(plaintext) as { secret: string };
    return parsed.secret;
  }

  private async loadPlatform(ref: string, kind: string): Promise<string> {
    await clearTenantContext(prisma);
    const id = ref.includes("/") ? ref.split("/")[1]! : ref;
    const row = await prisma.messagingSecretRecord.findFirst({
      where: { id, ownerKind: "platform", kind, deletedAt: null },
    });
    if (!row) throw new Error(`Messaging secret not found: ${kind}`);
    return unsealUtf8Payload(this.getMasterKey(), Buffer.from(row.ciphertext));
  }
}

function mapSettings(row: {
  id: string;
  tenantId: string;
  propertyId: string;
  whatsappEnabled: boolean;
  welcomeEmailEnabled?: boolean;
  welcomeEnabled: boolean;
  welcomeTemplateName: string | null;
  welcomeTemplateLanguage: string;
  arrivalEnabled: boolean;
  arrivalTemplateName: string | null;
  arrivalTemplateLanguage: string;
  arrivalTimingMode: string;
  arrivalLocalTime: string;
  arrivalOffsetDays: number;
  arrivalOffsetHours: number;
  createdAt: Date;
  updatedAt: Date;
}): PropertyMessagingSettingsRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    whatsappEnabled: row.whatsappEnabled,
    welcomeEmailEnabled: row.welcomeEmailEnabled ?? true,
    welcomeEnabled: row.welcomeEnabled,
    welcomeTemplateName: row.welcomeTemplateName,
    welcomeTemplateLanguage: row.welcomeTemplateLanguage,
    arrivalEnabled: row.arrivalEnabled,
    arrivalTemplateName: row.arrivalTemplateName,
    arrivalTemplateLanguage: row.arrivalTemplateLanguage,
    arrivalTimingMode: row.arrivalTimingMode as PropertyMessagingSettingsRecord["arrivalTimingMode"],
    arrivalLocalTime: row.arrivalLocalTime,
    arrivalOffsetDays: row.arrivalOffsetDays,
    arrivalOffsetHours: row.arrivalOffsetHours,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaPropertyMessagingSettingsRepository
  implements IPropertyMessagingSettingsRepository
{
  async get(
    tenantId: string,
    propertyId: string,
  ): Promise<PropertyMessagingSettingsRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.propertyMessagingSettings.findFirst({
        where: { tenantId, propertyId },
      });
      return row ? mapSettings(row) : null;
    });
  }

  async upsert(
    input: PropertyMessagingSettingsRecord,
  ): Promise<PropertyMessagingSettingsRecord> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const row = await tx.propertyMessagingSettings.upsert({
        where: { propertyId: input.propertyId },
        create: { ...input },
        update: {
          whatsappEnabled: input.whatsappEnabled,
          welcomeEmailEnabled: input.welcomeEmailEnabled,
          welcomeEnabled: input.welcomeEnabled,
          welcomeTemplateName: input.welcomeTemplateName,
          welcomeTemplateLanguage: input.welcomeTemplateLanguage,
          arrivalEnabled: input.arrivalEnabled,
          arrivalTemplateName: input.arrivalTemplateName,
          arrivalTemplateLanguage: input.arrivalTemplateLanguage,
          arrivalTimingMode: input.arrivalTimingMode,
          arrivalLocalTime: input.arrivalLocalTime,
          arrivalOffsetDays: input.arrivalOffsetDays,
          arrivalOffsetHours: input.arrivalOffsetHours,
        },
      });
      return mapSettings(row);
    });
  }
}

function mapProfile(row: {
  id: string;
  tenantId: string;
  propertyId: string;
  bookingId: string;
  guestId: string | null;
  conversationId: string | null;
  whatsappPhone: string | null;
  whatsappPhoneNormalized: string | null;
  guestChannelIdentity: string | null;
  contactSource: string;
  contactConfirmedAt: Date | null;
  messagingEnabled: boolean;
  identityStatus: string;
  cswOpenUntil: Date | null;
  lastGuestInboundAt: Date | null;
  welcomeEmailStatus?: string;
  welcomeEmailTo?: string | null;
  welcomeEmailSentAt?: Date | null;
  welcomeEmailLastError?: string | null;
  welcomeEmailOccurrenceKey?: string | null;
  activeContactTokenId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): BookingMessagingProfileRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    bookingId: row.bookingId,
    guestId: row.guestId,
    conversationId: row.conversationId,
    whatsappPhone: row.whatsappPhone,
    whatsappPhoneNormalized: row.whatsappPhoneNormalized,
    guestChannelIdentity: row.guestChannelIdentity,
    contactSource: row.contactSource as BookingMessagingProfileRecord["contactSource"],
    contactConfirmedAt: row.contactConfirmedAt,
    messagingEnabled: row.messagingEnabled,
    identityStatus: row.identityStatus as BookingMessagingProfileRecord["identityStatus"],
    cswOpenUntil: row.cswOpenUntil,
    lastGuestInboundAt: row.lastGuestInboundAt,
    welcomeEmailStatus: (row.welcomeEmailStatus ??
      "none") as BookingMessagingProfileRecord["welcomeEmailStatus"],
    welcomeEmailTo: row.welcomeEmailTo ?? null,
    welcomeEmailSentAt: row.welcomeEmailSentAt ?? null,
    welcomeEmailLastError: row.welcomeEmailLastError ?? null,
    welcomeEmailOccurrenceKey: row.welcomeEmailOccurrenceKey ?? null,
    activeContactTokenId: row.activeContactTokenId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaBookingMessagingProfileRepository
  implements IBookingMessagingProfileRepository
{
  async findByBookingId(
    tenantId: string,
    bookingId: string,
  ): Promise<BookingMessagingProfileRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.bookingMessagingProfile.findFirst({
        where: { tenantId, bookingId },
      });
      return row ? mapProfile(row) : null;
    });
  }

  async findEnabledByIdentity(
    guestChannelIdentity: string,
  ): Promise<BookingMessagingProfileRecord[]> {
    await clearTenantContext(prisma);
    const routes = await prisma.messagingWaIdentityRoute.findMany({
      where: { guestChannelIdentity, messagingEnabled: true },
    });
    const out: BookingMessagingProfileRecord[] = [];
    for (const route of routes) {
      const profile = await this.findByBookingId(route.tenantId, route.bookingId);
      if (profile && profile.messagingEnabled && profile.conversationId) {
        out.push(profile);
      }
    }
    return out;
  }

  async upsert(
    input: BookingMessagingProfileRecord,
  ): Promise<BookingMessagingProfileRecord> {
    const saved = await withTenantTransaction(input.tenantId, async (tx) => {
      const row = await tx.bookingMessagingProfile.upsert({
        where: { bookingId: input.bookingId },
        create: { ...input },
        update: {
          guestId: input.guestId,
          conversationId: input.conversationId,
          whatsappPhone: input.whatsappPhone,
          whatsappPhoneNormalized: input.whatsappPhoneNormalized,
          guestChannelIdentity: input.guestChannelIdentity,
          contactSource: input.contactSource,
          contactConfirmedAt: input.contactConfirmedAt,
          messagingEnabled: input.messagingEnabled,
          identityStatus: input.identityStatus,
          cswOpenUntil: input.cswOpenUntil,
          lastGuestInboundAt: input.lastGuestInboundAt,
          welcomeEmailStatus: input.welcomeEmailStatus,
          welcomeEmailTo: input.welcomeEmailTo,
          welcomeEmailSentAt: input.welcomeEmailSentAt,
          welcomeEmailLastError: input.welcomeEmailLastError,
          welcomeEmailOccurrenceKey: input.welcomeEmailOccurrenceKey,
          activeContactTokenId: input.activeContactTokenId,
        },
      });
      return mapProfile(row);
    });

    if (saved.guestChannelIdentity) {
      await clearTenantContext(prisma);
      await prisma.messagingWaIdentityRoute.upsert({
        where: {
          guestChannelIdentity_bookingId: {
            guestChannelIdentity: saved.guestChannelIdentity,
            bookingId: saved.bookingId,
          },
        },
        create: {
          guestChannelIdentity: saved.guestChannelIdentity,
          tenantId: saved.tenantId,
          propertyId: saved.propertyId,
          bookingId: saved.bookingId,
          profileId: saved.id,
          conversationId: saved.conversationId,
          messagingEnabled: saved.messagingEnabled,
        },
        update: {
          tenantId: saved.tenantId,
          propertyId: saved.propertyId,
          profileId: saved.id,
          conversationId: saved.conversationId,
          messagingEnabled: saved.messagingEnabled,
        },
      });
    }
    return saved;
  }

  async update(
    tenantId: string,
    id: string,
    patch: Partial<BookingMessagingProfileRecord>,
  ): Promise<BookingMessagingProfileRecord> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.bookingMessagingProfile.update({
        where: { id },
        data: {
          ...(patch.guestId !== undefined ? { guestId: patch.guestId } : {}),
          ...(patch.conversationId !== undefined
            ? { conversationId: patch.conversationId }
            : {}),
          ...(patch.whatsappPhone !== undefined
            ? { whatsappPhone: patch.whatsappPhone }
            : {}),
          ...(patch.whatsappPhoneNormalized !== undefined
            ? { whatsappPhoneNormalized: patch.whatsappPhoneNormalized }
            : {}),
          ...(patch.guestChannelIdentity !== undefined
            ? { guestChannelIdentity: patch.guestChannelIdentity }
            : {}),
          ...(patch.contactSource !== undefined
            ? { contactSource: patch.contactSource }
            : {}),
          ...(patch.contactConfirmedAt !== undefined
            ? { contactConfirmedAt: patch.contactConfirmedAt }
            : {}),
          ...(patch.messagingEnabled !== undefined
            ? { messagingEnabled: patch.messagingEnabled }
            : {}),
          ...(patch.identityStatus !== undefined
            ? { identityStatus: patch.identityStatus }
            : {}),
          ...(patch.cswOpenUntil !== undefined
            ? { cswOpenUntil: patch.cswOpenUntil }
            : {}),
          ...(patch.lastGuestInboundAt !== undefined
            ? { lastGuestInboundAt: patch.lastGuestInboundAt }
            : {}),
          ...(patch.welcomeEmailStatus !== undefined
            ? { welcomeEmailStatus: patch.welcomeEmailStatus }
            : {}),
          ...(patch.welcomeEmailTo !== undefined
            ? { welcomeEmailTo: patch.welcomeEmailTo }
            : {}),
          ...(patch.welcomeEmailSentAt !== undefined
            ? { welcomeEmailSentAt: patch.welcomeEmailSentAt }
            : {}),
          ...(patch.welcomeEmailLastError !== undefined
            ? { welcomeEmailLastError: patch.welcomeEmailLastError }
            : {}),
          ...(patch.welcomeEmailOccurrenceKey !== undefined
            ? { welcomeEmailOccurrenceKey: patch.welcomeEmailOccurrenceKey }
            : {}),
          ...(patch.activeContactTokenId !== undefined
            ? { activeContactTokenId: patch.activeContactTokenId }
            : {}),
        },
      });
      return mapProfile(row);
    });
  }
}

function mapRun(row: {
  id: string;
  tenantId: string;
  propertyId: string;
  bookingId: string;
  conversationId: string | null;
  trigger: string;
  occurrenceKey: string;
  status: string;
  scheduledFor: Date | null;
  messageId: string | null;
  jobId: string | null;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}): MessagingAutomationRunRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    bookingId: row.bookingId,
    conversationId: row.conversationId,
    trigger: row.trigger as MessagingAutomationRunRecord["trigger"],
    occurrenceKey: row.occurrenceKey,
    status: row.status as MessagingAutomationRunRecord["status"],
    scheduledFor: row.scheduledFor,
    messageId: row.messageId,
    jobId: row.jobId,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

export class PrismaMessagingAutomationRunRepository
  implements IMessagingAutomationRunRepository
{
  async findByBookingTriggerOccurrence(
    tenantId: string,
    bookingId: string,
    trigger: string,
    occurrenceKey: string,
  ): Promise<MessagingAutomationRunRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.messagingAutomationRun.findFirst({
        where: { tenantId, bookingId, trigger, occurrenceKey },
      });
      return row ? mapRun(row) : null;
    });
  }

  async listByBooking(
    tenantId: string,
    bookingId: string,
  ): Promise<MessagingAutomationRunRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.messagingAutomationRun.findMany({
        where: { tenantId, bookingId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapRun);
    });
  }

  async create(
    input: MessagingAutomationRunRecord,
  ): Promise<MessagingAutomationRunRecord> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const row = await tx.messagingAutomationRun.create({ data: { ...input } });
      return mapRun(row);
    });
  }

  async update(
    tenantId: string,
    id: string,
    patch: Partial<MessagingAutomationRunRecord>,
  ): Promise<MessagingAutomationRunRecord> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.messagingAutomationRun.update({
        where: { id },
        data: {
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.scheduledFor !== undefined
            ? { scheduledFor: patch.scheduledFor }
            : {}),
          ...(patch.conversationId !== undefined
            ? { conversationId: patch.conversationId }
            : {}),
          ...(patch.messageId !== undefined ? { messageId: patch.messageId } : {}),
          ...(patch.jobId !== undefined ? { jobId: patch.jobId } : {}),
          ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
          ...(patch.completedAt !== undefined
            ? { completedAt: patch.completedAt }
            : {}),
        },
      });
      return mapRun(row);
    });
  }

  async cancelPendingArrival(
    tenantId: string,
    bookingId: string,
  ): Promise<number> {
    return withTenantTransaction(tenantId, async (tx) => {
      const result = await tx.messagingAutomationRun.updateMany({
        where: {
          tenantId,
          bookingId,
          trigger: "arrival",
          status: { in: ["scheduled", "enqueued"] },
        },
        data: { status: "cancelled", completedAt: new Date() },
      });
      return result.count;
    });
  }
}

export class PrismaMessagingUnmatchedInboundRepository
  implements IMessagingUnmatchedInboundRepository
{
  async create(
    input: MessagingUnmatchedInboundRecord,
  ): Promise<MessagingUnmatchedInboundRecord> {
    await clearTenantContext(prisma);
    const row = await prisma.messagingUnmatchedInbound.create({
      data: {
        id: input.id,
        platformConnectionId: input.platformConnectionId,
        guestChannelIdentity: input.guestChannelIdentity,
        externalMessageId: input.externalMessageId,
        bodyPreview: input.bodyPreview,
        rawMetaJson: input.rawMetaJson as object,
        status: input.status,
      },
    });
    return {
      id: row.id,
      platformConnectionId: row.platformConnectionId,
      guestChannelIdentity: row.guestChannelIdentity,
      externalMessageId: row.externalMessageId,
      bodyPreview: row.bodyPreview,
      rawMetaJson: (row.rawMetaJson as Record<string, unknown>) ?? {},
      status: row.status as MessagingUnmatchedInboundRecord["status"],
      createdAt: row.createdAt,
    };
  }

  async findByExternalMessageId(
    externalMessageId: string,
  ): Promise<MessagingUnmatchedInboundRecord | null> {
    await clearTenantContext(prisma);
    const row = await prisma.messagingUnmatchedInbound.findFirst({
      where: { externalMessageId },
    });
    if (!row) return null;
    return {
      id: row.id,
      platformConnectionId: row.platformConnectionId,
      guestChannelIdentity: row.guestChannelIdentity,
      externalMessageId: row.externalMessageId,
      bodyPreview: row.bodyPreview,
      rawMetaJson: (row.rawMetaJson as Record<string, unknown>) ?? {},
      status: row.status as MessagingUnmatchedInboundRecord["status"],
      createdAt: row.createdAt,
    };
  }
}

/**
 * Meta Cloud API adapter. Uses fetch; injectable for tests via subclass/mock.
 */
export class MetaWhatsAppCloudApiAdapter implements IWhatsAppCloudApiAdapter {
  constructor(
    private readonly graphVersion: string = process.env.META_GRAPH_API_VERSION?.trim() ||
      "v21.0",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  verifyWebhookSignature(params: {
    rawBody: Buffer;
    signatureHeader: string | null;
    appSecret: string;
  }): boolean {
    if (!params.signatureHeader?.startsWith("sha256=")) return false;
    const expected = createHmac("sha256", params.appSecret)
      .update(params.rawBody)
      .digest("hex");
    const actual = params.signatureHeader.slice("sha256=".length);
    try {
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(actual, "hex");
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  async send(
    request: WhatsAppOutboundSendRequest,
  ): Promise<WhatsAppOutboundSendResult> {
    const url = `https://graph.facebook.com/${this.graphVersion}/${request.phoneNumberId}/messages`;
    const body =
      request.kind === "template"
        ? {
            messaging_product: "whatsapp",
            to: request.toE164.replace(/^\+/, ""),
            type: "template",
            template: {
              name: request.templateName,
              language: { code: request.templateLanguage ?? "en" },
              components: [
                {
                  type: "body",
                  parameters: (request.templateBodyParameters ?? []).map(
                    (text) => ({ type: "text", text }),
                  ),
                },
              ],
            },
          }
        : {
            messaging_product: "whatsapp",
            to: request.toE164.replace(/^\+/, ""),
            type: "text",
            text: { body: request.textBody ?? "" },
            ...(request.clientMessageId
              ? { biz_opaque_callback_data: request.clientMessageId.slice(0, 512) }
              : {}),
          };

    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${request.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
        error?: { code?: number; message?: string };
      };
      if (!res.ok) {
        return {
          success: false,
          externalMessageId: null,
          errorCode: String(json.error?.code ?? res.status),
          httpStatus: res.status,
        };
      }
      return {
        success: true,
        externalMessageId: json.messages?.[0]?.id ?? null,
        errorCode: null,
        httpStatus: res.status,
      };
    } catch {
      return {
        success: false,
        externalMessageId: null,
        errorCode: "network_error",
        httpStatus: null,
      };
    }
  }
}

/** Test double — records sends, never calls Meta. */
export class FakeWhatsAppCloudApiAdapter implements IWhatsAppCloudApiAdapter {
  readonly sent: WhatsAppOutboundSendRequest[] = [];
  failNext = false;
  nextWamid = "wamid.fake.test";

  verifyWebhookSignature(): boolean {
    return true;
  }

  async send(
    request: WhatsAppOutboundSendRequest,
  ): Promise<WhatsAppOutboundSendResult> {
    this.sent.push(request);
    if (this.failNext) {
      this.failNext = false;
      return {
        success: false,
        externalMessageId: null,
        errorCode: "fake_fail",
        httpStatus: 500,
      };
    }
    return {
      success: true,
      externalMessageId: this.nextWamid,
      errorCode: null,
      httpStatus: 200,
    };
  }
}

function mapToken(row: {
  id: string;
  tenantId: string;
  propertyId: string;
  bookingId: string;
  guestId: string | null;
  profileId: string | null;
  tokenHash: string;
  status: string;
  expiresAt: Date;
  activatedAt: Date | null;
  activatedConversationId: string | null;
  activatedWaIdentity: string | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MessagingContactTokenRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    bookingId: row.bookingId,
    guestId: row.guestId,
    profileId: row.profileId,
    tokenHash: row.tokenHash,
    status: row.status as MessagingContactTokenRecord["status"],
    expiresAt: row.expiresAt,
    activatedAt: row.activatedAt,
    activatedConversationId: row.activatedConversationId,
    activatedWaIdentity: row.activatedWaIdentity,
    revokedAt: row.revokedAt,
    revokeReason: row.revokeReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaMessagingContactTokenRepository
  implements IMessagingContactTokenRepository
{
  async create(
    input: MessagingContactTokenRecord,
  ): Promise<MessagingContactTokenRecord> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const row = await tx.messagingContactToken.create({ data: { ...input } });
      return mapToken(row);
    });
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<MessagingContactTokenRecord | null> {
    // Webhook path: no tenant GUC - hash is unguessable; RLS FORCE requires clear context.
    await clearTenantContext(prisma);
    const row = await prisma.messagingContactToken.findUnique({
      where: { tokenHash },
    });
    return row ? mapToken(row) : null;
  }

  async findActiveByBooking(
    tenantId: string,
    bookingId: string,
  ): Promise<MessagingContactTokenRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.messagingContactToken.findFirst({
        where: { tenantId, bookingId, status: "active" },
        orderBy: { createdAt: "desc" },
      });
      return row ? mapToken(row) : null;
    });
  }

  async update(
    tenantId: string,
    id: string,
    patch: Partial<MessagingContactTokenRecord>,
  ): Promise<MessagingContactTokenRecord> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.messagingContactToken.update({
        where: { id },
        data: {
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.activatedAt !== undefined
            ? { activatedAt: patch.activatedAt }
            : {}),
          ...(patch.activatedConversationId !== undefined
            ? { activatedConversationId: patch.activatedConversationId }
            : {}),
          ...(patch.activatedWaIdentity !== undefined
            ? { activatedWaIdentity: patch.activatedWaIdentity }
            : {}),
          ...(patch.revokedAt !== undefined ? { revokedAt: patch.revokedAt } : {}),
          ...(patch.revokeReason !== undefined
            ? { revokeReason: patch.revokeReason }
            : {}),
          ...(patch.profileId !== undefined ? { profileId: patch.profileId } : {}),
        },
      });
      return mapToken(row);
    });
  }

  async revokeActiveForBooking(
    tenantId: string,
    bookingId: string,
    reason: string,
  ): Promise<number> {
    return withTenantTransaction(tenantId, async (tx) => {
      const result = await tx.messagingContactToken.updateMany({
        where: { tenantId, bookingId, status: "active" },
        data: {
          status: "revoked",
          revokedAt: new Date(),
          revokeReason: reason.slice(0, 64),
        },
      });
      return result.count;
    });
  }
}

export class PrismaMessagingWaIdentityRouteWriter
  implements IMessagingWaIdentityRouteWriter
{
  async upsertRoute(input: {
    guestChannelIdentity: string;
    tenantId: string;
    propertyId: string;
    bookingId: string;
    profileId: string;
    conversationId: string | null;
    messagingEnabled: boolean;
  }): Promise<void> {
    await clearTenantContext(prisma);
    await prisma.messagingWaIdentityRoute.upsert({
      where: {
        guestChannelIdentity_bookingId: {
          guestChannelIdentity: input.guestChannelIdentity,
          bookingId: input.bookingId,
        },
      },
      create: { ...input },
      update: {
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        profileId: input.profileId,
        conversationId: input.conversationId,
        messagingEnabled: input.messagingEnabled,
      },
    });
  }
}
