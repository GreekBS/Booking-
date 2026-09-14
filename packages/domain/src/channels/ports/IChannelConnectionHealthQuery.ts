export interface ChannelReconciliationHealthRow {
  readonly cursorVersion: number;
  readonly status: string;
  readonly appliedAt: Date | null;
  readonly errorCode: string | null;
  readonly completeObservedEvidence: boolean;
}

export interface ChannelReconciliationHealthSummary {
  readonly latest: ChannelReconciliationHealthRow | null;
  readonly pendingCount: number;
}

export interface ChannelReconcileJobHealthRow {
  readonly id: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly runAt: Date;
  readonly nextRetryAt: Date | null;
  readonly completedAt: Date | null;
}

/**
 * P1-S7b — focused health queries for reconciliations + reconcile jobs.
 * P1-S7c — active channel_import count.
 */
export interface IChannelConnectionHealthQuery {
  getReconciliationSummary(params: {
    tenantId: string;
    connectionId: string;
  }): Promise<ChannelReconciliationHealthSummary>;

  findLatestReconcileJob(params: {
    tenantId: string;
    connectionId: string;
  }): Promise<ChannelReconcileJobHealthRow | null>;

  countActiveChannelImports(params: {
    tenantId: string;
    connectionId: string;
  }): Promise<number>;
}
