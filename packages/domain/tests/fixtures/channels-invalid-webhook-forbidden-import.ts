// Intentional ADR-022 CM-4a-3 webhook transport violation — must fail fitness tests.
import { ProcessChannelInboxItemUseCase } from "../../src/channels/application/ProcessChannelInboxItemUseCase";

export const forbiddenWebhookTransportImport = ProcessChannelInboxItemUseCase;
