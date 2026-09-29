import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import {
  extendCustomerServiceWindow,
  extractContactTokenFromText,
  whatsappChannelIdentityFromSender,
} from "@hcp/domain";
import {
  activateWhatsAppFromContactTokenUseCase,
  conversationRepository,
  ingestGuestMessageUseCase,
  loadPropertyAmenities,
  messagingUnmatchedInboundRepository,
  platformMessagingConnectionRepository,
  routeWhatsAppInboundUseCase,
} from "@/lib/di/container";
import { createLogger } from "@/lib/logging/logger";

export const runtime = "nodejs";

const logger = createLogger({ action: "messaging.whatsapp.webhook" });

function isWhatsAppWebhookEnabled(): boolean {
  return process.env.MESSAGING_WHATSAPP_WEBHOOK_ENABLED?.trim() === "true";
}

/**
 * Meta webhook verification (GET).
 */
export async function GET(request: NextRequest) {
  if (!isWhatsAppWebhookEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected =
    process.env.MESSAGING_WHATSAPP_VERIFY_TOKEN?.trim() ||
    process.env.META_WHATSAPP_VERIFY_TOKEN?.trim();
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * Meta WhatsApp inbound + status webhooks (POST).
 * First-contact: opaque contact token → Booking binding (workerless).
 * Subsequent: identity route → Conversation.
 */
export async function POST(request: NextRequest) {
  if (!isWhatsAppWebhookEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret =
    process.env.MESSAGING_WHATSAPP_APP_SECRET?.trim() ||
    process.env.META_APP_SECRET?.trim();

  if (!appSecret || !verifySignature(rawBody, signature, appSecret)) {
    logger.error("whatsapp webhook signature rejected");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return new NextResponse(null, { status: 200 });
  }

  const root = payload as {
    object?: string;
    entry?: Array<{
      changes?: Array<{
        field?: string;
        value?: {
          metadata?: { phone_number_id?: string };
          statuses?: Array<{ id?: string; status?: string }>;
          messages?: Array<{
            id?: string;
            from?: string;
            type?: string;
            text?: { body?: string };
          }>;
        };
      }>;
    }>;
  };

  if (root?.object !== "whatsapp_business_account") {
    return new NextResponse(null, { status: 200 });
  }

  try {
    for (const entry of root.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages") continue;
        const value = change.value ?? {};
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const connection =
          await platformMessagingConnectionRepository.findByPhoneNumberId(
            phoneNumberId,
          );
        if (!connection || connection.status !== "connected") {
          logger.info("whatsapp webhook unknown phone_number_id", {
            phoneNumberId,
          });
          continue;
        }

        for (const status of value.statuses ?? []) {
          logger.info("whatsapp status event", {
            id: status.id,
            status: status.status,
          });
        }

        for (const message of value.messages ?? []) {
          if (message.type !== "text") continue;
          const wamid = String(message.id ?? "");
          const from = String(message.from ?? "");
          const body = String(message.text?.body ?? "").trim();
          if (!wamid || !from || !body) continue;

          const identity = whatsappChannelIdentityFromSender(from);
          if (!identity) continue;

          const actor = {
            userId: "00000000-0000-4000-8000-000000000001",
            role: "admin" as const,
            propertyIds: null,
            isSuperAdmin: true,
          };

          // PRIMARY first-contact: opaque email contact token (authoritative).
          let tenantId: string | null = null;
          let propertyId: string | null = null;
          let conversationId: string | null = null;
          let ingestBody = body;

          if (extractContactTokenFromText(body)) {
            const activation =
              await activateWhatsAppFromContactTokenUseCase.execute({
                rawMessageBody: body,
                senderWaId: from,
              });
            if (activation.outcome === "activated") {
              tenantId = activation.profile.tenantId;
              propertyId = activation.profile.propertyId;
              conversationId = activation.conversation.id;
              ingestBody = activation.redactedBody || "Hello";
            } else {
              // Invalid/expired/revoked token → no disclosure, no AI.
              const existing =
                await messagingUnmatchedInboundRepository.findByExternalMessageId(
                  wamid,
                );
              if (!existing) {
                await messagingUnmatchedInboundRepository.create({
                  id: randomUUID(),
                  platformConnectionId: connection.id,
                  guestChannelIdentity: identity,
                  externalMessageId: wamid,
                  bodyPreview: "contact-token-rejected",
                  rawMetaJson: { phoneNumberId, reason: "token_rejected" },
                  status: "open",
                  createdAt: new Date(),
                });
              }
              continue;
            }
          } else {
            const route = await routeWhatsAppInboundUseCase.execute({
              guestChannelIdentity: identity,
            });

            if (route.outcome === "unmatched") {
              const existing =
                await messagingUnmatchedInboundRepository.findByExternalMessageId(
                  wamid,
                );
              if (!existing) {
                await messagingUnmatchedInboundRepository.create({
                  id: randomUUID(),
                  platformConnectionId: connection.id,
                  guestChannelIdentity: identity,
                  externalMessageId: wamid,
                  bodyPreview: body.slice(0, 280),
                  rawMetaJson: { phoneNumberId },
                  status: "open",
                  createdAt: new Date(),
                });
              }
              continue;
            }

            if (route.outcome === "ambiguous") {
              for (const profile of route.profiles) {
                if (!profile.conversationId) continue;
                await conversationRepository.updateMeta(
                  profile.tenantId,
                  profile.conversationId,
                  { routingStatus: "ambiguous" },
                );
              }
              logger.info("whatsapp inbound ambiguous", { identity });
              continue;
            }

            const profile = route.profile;
            if (!profile.conversationId) continue;
            tenantId = profile.tenantId;
            propertyId = profile.propertyId;
            conversationId = profile.conversationId;
          }

          if (!tenantId || !propertyId || !conversationId) continue;

          const amenities = await loadPropertyAmenities(tenantId, propertyId);

          await conversationRepository.updateMeta(tenantId, conversationId, {
            lastGuestInboundAt: new Date(),
            cswOpenUntil: extendCustomerServiceWindow(),
            routingStatus: "ok",
          });

          await ingestGuestMessageUseCase.execute(
            {
              tenantId,
              conversationId,
              body: ingestBody,
              externalMessageId: wamid,
              amenities,
              whatsappPhoneNumberId: phoneNumberId,
            },
            actor,
          );
        }
      }
    }
  } catch (error) {
    logger.error("whatsapp webhook processing error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return new NextResponse(null, { status: 200 });
}

function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const actual = signatureHeader.slice("sha256=".length);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(actual, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
