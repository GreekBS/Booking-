import { Result } from "../../shared/kernel/Result";
import type { Lead } from "../../marketing/domain/Lead";
import type { Tenant } from "../domain/Tenant";
import type { ILeadRepository } from "../../marketing/ports/ILeadRepository";
import type { ITenantRepository } from "../ports/ITenantRepository";
import type { IPlatformDirectoryRepository } from "../ports/IPlatformDirectoryRepository";
import type { IPlatformOperationsRepository } from "../ports/IPlatformOperationsRepository";

export interface PlatformOverviewAttentionItem {
  kind:
    | "new_leads"
    | "demo_requests"
    | "suspended_tenants"
    | "channel_errors"
    | "failed_jobs"
    | "dead_letter_outbox"
    | "inbox_attention";
  count: number;
  href: string;
  label: string;
}

export interface PlatformOverviewResult {
  tenants: {
    total: number;
    active: number;
    suspended: number;
  };
  leads: {
    total: number;
    newCount: number;
    demoRequestedCount: number;
  };
  properties: {
    total: number;
  };
  users: {
    total: number;
  };
  recentLeads: Lead[];
  recentTenants: Tenant[];
  needsAttention: PlatformOverviewAttentionItem[];
}

/**
 * Aggregates truthful Platform Control Center overview metrics.
 * Uses count queries + small recent windows — no decorative fake data.
 */
export class GetPlatformOverviewUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly leadRepository: ILeadRepository,
    private readonly directoryRepository: IPlatformDirectoryRepository,
    private readonly operationsRepository: IPlatformOperationsRepository,
  ) {}

  async execute(): Promise<Result<PlatformOverviewResult, Error>> {
    try {
      const [
        tenantCounts,
        leadCounts,
        propertyTotal,
        userTotal,
        recentLeadsPage,
        recentTenantsPage,
        opsAttention,
      ] = await Promise.all([
        this.tenantRepository.countSummary(),
        this.leadRepository.countSummary(),
        this.directoryRepository.countProperties(),
        this.directoryRepository.countUsers(),
        this.leadRepository.list({
          page: 1,
          limit: 8,
          prioritizeOperational: false,
        }),
        this.tenantRepository.findAll({ page: 1, limit: 8 }),
        this.operationsRepository.getAttentionSignals(),
      ]);

      const needsAttention: PlatformOverviewAttentionItem[] = [];
      if (leadCounts.newCount > 0) {
        needsAttention.push({
          kind: "new_leads",
          count: leadCounts.newCount,
          href: "/platform/leads?status=new",
          label: "New leads awaiting action",
        });
      }
      if (leadCounts.demoRequestedCount > 0) {
        needsAttention.push({
          kind: "demo_requests",
          count: leadCounts.demoRequestedCount,
          href: "/platform/leads?demo=1",
          label: "Demo requests",
        });
      }
      if (tenantCounts.suspended > 0) {
        needsAttention.push({
          kind: "suspended_tenants",
          count: tenantCounts.suspended,
          href: "/platform/tenants",
          label: "Suspended tenants",
        });
      }
      if (opsAttention.connectionsError > 0) {
        needsAttention.push({
          kind: "channel_errors",
          count: opsAttention.connectionsError,
          href: "/platform/channels?status=error",
          label: "Channel connections in error",
        });
      }
      const failedJobs =
        opsAttention.jobsDeadLetter + opsAttention.jobsFailedPending;
      if (failedJobs > 0) {
        needsAttention.push({
          kind: "failed_jobs",
          count: failedJobs,
          href: "/platform/operations?tab=jobs&status=dead_letter",
          label: "Background jobs requiring attention",
        });
      }
      if (opsAttention.outboxDeadLetter > 0) {
        needsAttention.push({
          kind: "dead_letter_outbox",
          count: opsAttention.outboxDeadLetter,
          href: "/platform/operations?tab=outbox&status=dead_letter",
          label: "Dead-letter outbox events",
        });
      }
      const inboxAttention =
        opsAttention.inboxFailed + opsAttention.inboxDeadLetter;
      if (inboxAttention > 0) {
        needsAttention.push({
          kind: "inbox_attention",
          count: inboxAttention,
          href: "/platform/operations?tab=inbox&status=failed",
          label: "Inbox items requiring attention",
        });
      }

      return Result.ok({
        tenants: {
          total: tenantCounts.total,
          active: tenantCounts.active,
          suspended: tenantCounts.suspended,
        },
        leads: {
          total: leadCounts.total,
          newCount: leadCounts.newCount,
          demoRequestedCount: leadCounts.demoRequestedCount,
        },
        properties: { total: propertyTotal },
        users: { total: userTotal },
        recentLeads: recentLeadsPage.data,
        recentTenants: recentTenantsPage.data,
        needsAttention,
      });
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
