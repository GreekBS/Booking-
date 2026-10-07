import type {
  CopilotConversationRecord,
  CopilotConversationStatus,
  CopilotMessageRecord,
  CopilotMessageRole,
  ICopilotConversationRepository,
  ICopilotMessageRepository,
} from "@hcp/domain";
import type {
  CopilotConversation as CopilotConversationRow,
  CopilotMessage as CopilotMessageRow,
} from "@prisma/client";
import { withTenantTransaction } from "../../client";

function mapConversation(row: CopilotConversationRow): CopilotConversationRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    operatorUserId: row.operatorUserId,
    title: row.title ?? null,
    status: row.status as CopilotConversationStatus,
    activePropertyId: row.activePropertyId ?? null,
    lastMessageAt: row.lastMessageAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMessage(row: CopilotMessageRow): CopilotMessageRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    conversationId: row.conversationId,
    role: row.role as CopilotMessageRole,
    content: row.content,
    toolName: row.toolName ?? null,
    toolCallId: row.toolCallId ?? null,
    createdAt: row.createdAt,
  };
}

/** Tool messages persist `{ ok: boolean, ... }` JSON; derive success for analytics. */
function deriveToolSuccess(input: CopilotMessageRecord): boolean | null {
  if (input.role !== "tool") return null;
  try {
    const parsed = JSON.parse(input.content) as { ok?: unknown };
    return typeof parsed.ok === "boolean" ? parsed.ok : null;
  } catch {
    return null;
  }
}

export class PrismaCopilotConversationRepository
  implements ICopilotConversationRepository
{
  async create(input: CopilotConversationRecord): Promise<CopilotConversationRecord> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const row = await tx.copilotConversation.create({
        data: {
          id: input.id,
          tenantId: input.tenantId,
          operatorUserId: input.operatorUserId,
          activePropertyId: input.activePropertyId,
          status: input.status,
          title: input.title,
          lastMessageAt: input.lastMessageAt,
        },
      });
      return mapConversation(row);
    });
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<CopilotConversationRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.copilotConversation.findFirst({
        where: { id, tenantId },
      });
      return row ? mapConversation(row) : null;
    });
  }

  async listByOperator(
    tenantId: string,
    operatorUserId: string,
    opts: { status?: CopilotConversationStatus; limit: number },
  ): Promise<CopilotConversationRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.copilotConversation.findMany({
        where: {
          tenantId,
          operatorUserId,
          ...(opts.status ? { status: opts.status } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: opts.limit,
      });
      return rows.map(mapConversation);
    });
  }

  async archive(
    tenantId: string,
    id: string,
    operatorUserId: string,
  ): Promise<CopilotConversationRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const result = await tx.copilotConversation.updateMany({
        where: { id, tenantId, operatorUserId },
        data: { status: "archived" },
      });
      if (result.count === 0) return null;
      const row = await tx.copilotConversation.findFirst({
        where: { id, tenantId, operatorUserId },
      });
      return row ? mapConversation(row) : null;
    });
  }

  async touch(
    tenantId: string,
    id: string,
    patch: {
      activePropertyId?: string | null;
      lastMessageAt?: Date;
      title?: string | null;
    },
  ): Promise<CopilotConversationRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const existing = await tx.copilotConversation.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing) return null;
      const row = await tx.copilotConversation.update({
        where: { id },
        data: {
          ...(patch.activePropertyId !== undefined
            ? { activePropertyId: patch.activePropertyId }
            : {}),
          ...(patch.lastMessageAt !== undefined
            ? { lastMessageAt: patch.lastMessageAt }
            : {}),
          ...(patch.title !== undefined ? { title: patch.title } : {}),
        },
      });
      return mapConversation(row);
    });
  }
}

export class PrismaCopilotMessageRepository implements ICopilotMessageRepository {
  async append(input: CopilotMessageRecord): Promise<CopilotMessageRecord> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const row = await tx.copilotMessage.create({
        data: {
          id: input.id,
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          toolName: input.toolName,
          toolCallId: input.toolCallId,
          toolSuccess: deriveToolSuccess(input),
          createdAt: input.createdAt,
        },
      });
      return mapMessage(row);
    });
  }

  async listRecentMessages(
    tenantId: string,
    conversationId: string,
    limit: number,
  ): Promise<CopilotMessageRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.copilotMessage.findMany({
        where: { tenantId, conversationId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      });
      return rows.reverse().map(mapMessage);
    });
  }

  async listMessages(
    tenantId: string,
    conversationId: string,
  ): Promise<CopilotMessageRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.copilotMessage.findMany({
        where: { tenantId, conversationId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return rows.map(mapMessage);
    });
  }
}
