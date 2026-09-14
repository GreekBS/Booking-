// Intentional ADR-022 CM-4a-4 poll transport violation — must fail fitness tests.
import { ProcessChannelInboxItemUseCase } from "../../src/channels/application/ProcessChannelInboxItemUseCase";

export const forbiddenPollTransportImport = ProcessChannelInboxItemUseCase;
