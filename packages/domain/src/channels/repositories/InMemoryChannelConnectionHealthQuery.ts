import type {
  ChannelReconcileJobHealthRow,
  ChannelReconciliationHealthSummary,
  IChannelConnectionHealthQuery,
} from "../ports/IChannelConnectionHealthQuery";

/**
 * In-memory health query for domain tests.
 */
export class InMemoryChannelConnectionHealthQuery implements IChannelConnectionHealthQuery {
  constructor(
    private readonly getSummary: () => ChannelReconciliationHealthSummary = () => ({
      latest: null,
      pendingCount: 0,
    }),
    private readonly getLatestReconcileJob: () => ChannelReconcileJobHealthRow | null = () =>
      null,
    private readonly getActiveImportCount: () => number = () => 0,
  ) {}

  async getReconciliationSummary(): Promise<ChannelReconciliationHealthSummary> {
    return this.getSummary();
  }

  async findLatestReconcileJob(): Promise<ChannelReconcileJobHealthRow | null> {
    return this.getLatestReconcileJob();
  }

  async countActiveChannelImports(): Promise<number> {
    return this.getActiveImportCount();
  }
}
