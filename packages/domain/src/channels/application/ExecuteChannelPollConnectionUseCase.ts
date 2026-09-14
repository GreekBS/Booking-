import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelPollCursorRepository } from "../ports/IChannelPollCursorRepository";
import type { IChannelPollInventoryCommitStore } from "../ports/IChannelPollInventoryCommitStore";
import type { ChannelPollConnectionCommand } from "../types/ChannelPollConnectionCommand";
import type { ChannelPollConnectionResult } from "../types/ChannelPollConnectionResult";
import type { ReceiveChannelPollBatchUseCase } from "./ReceiveChannelPollBatchUseCase";
import { isChannelInventoryApplyEnabled } from "./channelInventoryApplyGate";
import {
  advanceCursorWithReconciliation,
  buildPollConnectionNotFoundResult,
  mapBatchToPollConnectionResult,
} from "./ChannelPollTransportSupport";

/**
 * Provider-neutral poll connection orchestration.
 * Loads committed cursor, delegates to ReceiveChannelPollBatchUseCase,
 * and commits proposedNextCursor only after durable Receive success and CAS.
 *
 * P1-S6a: when CHANNELS_INVENTORY_APPLY_ENABLED and iCal availability_block_feed,
 * TX1 commits cursor + generation + outbox atomically via IChannelPollInventoryCommitStore.
 * Flag OFF preserves P1-S5 cursor-only CAS.
 */
export class ExecuteChannelPollConnectionUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly cursorRepository: IChannelPollCursorRepository,
    private readonly pollBatchUseCase: ReceiveChannelPollBatchUseCase,
    private readonly inventoryCommitStore: IChannelPollInventoryCommitStore | null = null,
  ) {}

  async execute(command: ChannelPollConnectionCommand): Promise<ChannelPollConnectionResult> {
    const tenantId = command.tenantId.trim();
    const connectionId = command.connectionId.trim();

    const connection = await this.connectionRepository.findById(tenantId, connectionId);
    if (!connection) {
      return buildPollConnectionNotFoundResult(0);
    }

    const observedSemanticConfigVersion = connection.semanticConfigVersion;
    const loadedCursor = await this.cursorRepository.getCursor(tenantId, connectionId);
    const loadedCursorVersion = loadedCursor?.version ?? 0;
    const cursorPayload = loadedCursor?.payload ?? null;

    const batchResult = await this.pollBatchUseCase.execute({
      tenantId,
      connectionId,
      provider: connection.provider,
      cursorPayload,
    });

    if (!batchResult.ackAllowed) {
      return mapBatchToPollConnectionResult(
        batchResult,
        loadedCursorVersion,
        "not_applicable",
        false,
        false,
        "none",
        null,
      );
    }

    if (batchResult.proposedNextCursor === null) {
      return mapBatchToPollConnectionResult(
        batchResult,
        loadedCursorVersion,
        "not_applicable",
        false,
        false,
        "none",
        null,
      );
    }

    const inventoryApply =
      isChannelInventoryApplyEnabled() &&
      connection.inventoryApplyEnabled === true &&
      connection.provider === "ical" &&
      connection.semanticMode === "availability_block_feed" &&
      this.inventoryCommitStore !== null;

    if (!inventoryApply) {
      return advanceCursorWithReconciliation({
        tenantId,
        connectionId,
        proposedNextCursor: batchResult.proposedNextCursor,
        observedSemanticConfigVersion,
        expectedCursorVersion: loadedCursorVersion,
        cursorRepository: this.cursorRepository,
        batch: batchResult,
        loadedCursorVersion,
      });
    }

    if (batchResult.inventoryProjectionFailureCode) {
      return {
        ...mapBatchToPollConnectionResult(
          batchResult,
          loadedCursorVersion,
          "not_applicable",
          false,
          false,
          "none",
          null,
        ),
        errorMessage: `inventory_snapshot_${batchResult.inventoryProjectionFailureCode.toLowerCase()}`,
      };
    }

    const snapshot = batchResult.inventoryActionableSnapshot;
    if (!snapshot) {
      return {
        ...mapBatchToPollConnectionResult(
          batchResult,
          loadedCursorVersion,
          "not_applicable",
          false,
          false,
          "none",
          null,
        ),
        errorMessage: "inventory_snapshot_missing",
      };
    }

    const commitResult = await this.inventoryCommitStore.commit({
      tenantId,
      connectionId,
      provider: connection.provider,
      observedSemanticConfigVersion,
      expectedCursorVersion: loadedCursorVersion,
      proposedNextCursor: batchResult.proposedNextCursor,
      inventorySnapshot: snapshot,
      batch: batchResult,
      loadedCursorVersion,
    });

    return commitResult.pollResult;
  }
}
