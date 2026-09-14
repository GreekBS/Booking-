import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type {
  ChannelInventoryApplyResult,
  IChannelInventoryReconciliationApplyStore,
} from "../ports/IChannelInventoryReconciliationApplyStore";

export interface ReconcileIcalImportedInventoryCommand {
  tenantId: string;
  connectionId: string;
  cursorVersion: number;
  observedSemanticConfigVersion?: number;
  observedMappingId?: string;
  observedMappingVersion?: number;
}

export type ReconcileIcalImportedInventoryResult = ChannelInventoryApplyResult;

/**
 * P1-S6b — apply one durable inventory reconciliation generation via TX2.
 */
export class ReconcileIcalImportedInventoryUseCase {
  constructor(
    private readonly applyStore: IChannelInventoryReconciliationApplyStore,
  ) {}

  async execute(
    command: ReconcileIcalImportedInventoryCommand,
  ): Promise<Result<ReconcileIcalImportedInventoryResult, Error>> {
    try {
      const tenantId = command.tenantId.trim();
      const connectionId = command.connectionId.trim();
      if (!tenantId) {
        return Result.fail(new ValidationError("tenantId is required"));
      }
      if (!connectionId) {
        return Result.fail(new ValidationError("connectionId is required"));
      }
      if (!Number.isInteger(command.cursorVersion) || command.cursorVersion < 1) {
        return Result.fail(new ValidationError("cursorVersion must be a positive integer"));
      }

      const result = await this.applyStore.apply({
        tenantId,
        connectionId,
        cursorVersion: command.cursorVersion,
        observedSemanticConfigVersion: command.observedSemanticConfigVersion,
        observedMappingId: command.observedMappingId,
        observedMappingVersion: command.observedMappingVersion,
      });
      return Result.ok(result);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
