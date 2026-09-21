import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type {
  IPlatformAuditRepository,
  ListPlatformAuditLogsQuery,
  PlatformAuditLogRow,
} from "../ports/IPlatformAuditRepository";
import type { PlatformPage } from "../ports/IPlatformOperationsRepository";

export interface ListPlatformAuditLogsCommand {
  page?: number;
  limit?: number;
  action?: string;
  actorId?: string;
  tenantId?: string;
  from?: string;
  to?: string;
}

function parseOptionalDate(
  value: string | undefined,
  label: string,
  endOfDay = false,
): Date | undefined {
  if (!value?.trim()) return undefined;
  const raw = value.trim();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError(`Invalid ${label} date`);
  }
  // Date-only inputs (YYYY-MM-DD) should include the full local day when used as `to`.
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    d.setHours(23, 59, 59, 999);
  }
  return d;
}

export class ListPlatformAuditLogsUseCase {
  constructor(private readonly audit: IPlatformAuditRepository) {}

  async execute(
    command: ListPlatformAuditLogsCommand = {},
  ): Promise<Result<PlatformPage<PlatformAuditLogRow>, Error>> {
    try {
      const page = command.page ?? 1;
      const limit = command.limit ?? 50;
      if (page < 1 || limit < 1 || limit > 100) {
        return Result.fail(new ValidationError("Invalid pagination"));
      }

      const from = parseOptionalDate(command.from, "from");
      const to = parseOptionalDate(command.to, "to", true);
      if (from && to && from > to) {
        return Result.fail(new ValidationError("from must be before to"));
      }

      const query: ListPlatformAuditLogsQuery = {
        page,
        limit,
        action: command.action?.trim() || undefined,
        actorId: command.actorId?.trim() || undefined,
        tenantId: command.tenantId?.trim() || undefined,
        from,
        to,
      };

      return Result.ok(await this.audit.listAuditLogs(query));
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
