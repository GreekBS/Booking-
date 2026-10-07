import { PERMISSIONS } from "@hcp/permissions";
import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type {
  ActorContext,
  PermissionChecker,
} from "../../shared/services/PermissionChecker";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type {
  CopilotConversationRecord,
  CopilotConversationStatus,
  CopilotMessageRecord,
  CopilotPageContext,
} from "../domain/OperatorCopilotTypes";
import type {
  ICopilotConversationRepository,
  ICopilotMessageRepository,
} from "../ports/IOperatorCopilotRepositories";
import type {
  OperatorCopilotOrchestrator,
  RunOperatorCopilotTurnResult,
} from "./OperatorCopilotOrchestrator";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;
const MAX_TITLE_CHARS = 120;

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Operators need at least read access to properties (tenant-wide or assigned)
 * to use the copilot; tool-level ACLs still apply on top.
 */
function canUseCopilot(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
): boolean {
  return (
    permissionChecker.hasPermission(actor, PERMISSIONS.PROPERTY_READ_TENANT, tenantId) ||
    permissionChecker.hasPermission(actor, PERMISSIONS.PROPERTY_READ_ASSIGNED, tenantId)
  );
}

/** Non-owners get NotFound so conversation existence never leaks across operators. */
async function loadOwnedConversation(
  conversations: ICopilotConversationRepository,
  tenantId: string,
  conversationId: string,
  actor: ActorContext,
): Promise<CopilotConversationRecord> {
  const conversation = await conversations.findById(tenantId, conversationId);
  if (
    !conversation ||
    conversation.tenantId !== tenantId ||
    conversation.operatorUserId !== actor.userId
  ) {
    throw new NotFoundError("Copilot conversation", conversationId);
  }
  return conversation;
}

export class CreateCopilotConversationUseCase {
  constructor(
    private readonly conversations: ICopilotConversationRepository,
    private readonly ids: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    input: {
      tenantId: string;
      activePropertyId?: string | null;
      title?: string | null;
    },
    actor: ActorContext,
  ): Promise<Result<CopilotConversationRecord, Error>> {
    try {
      if (!canUseCopilot(this.permissionChecker, actor, input.tenantId)) {
        return Result.fail(new ForbiddenError());
      }
      const activePropertyId = input.activePropertyId?.trim() || null;
      if (
        activePropertyId &&
        !this.permissionChecker.canAccessProperty(
          actor,
          input.tenantId,
          activePropertyId,
          "property:read",
        )
      ) {
        return Result.fail(new ForbiddenError("Property access denied"));
      }
      const title = input.title?.replace(/\s+/g, " ").trim() || null;
      if (title && title.length > MAX_TITLE_CHARS) {
        return Result.fail(new ValidationError("Title is too long"));
      }

      const now = this.now();
      const record = await this.conversations.create({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        operatorUserId: actor.userId,
        title,
        status: "active",
        activePropertyId,
        lastMessageAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return Result.ok(record);
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export class ListCopilotConversationsUseCase {
  constructor(
    private readonly conversations: ICopilotConversationRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: {
      tenantId: string;
      status?: CopilotConversationStatus;
      limit?: number;
    },
    actor: ActorContext,
  ): Promise<Result<CopilotConversationRecord[], Error>> {
    try {
      if (!canUseCopilot(this.permissionChecker, actor, input.tenantId)) {
        return Result.fail(new ForbiddenError());
      }
      const requested = input.limit ?? DEFAULT_LIST_LIMIT;
      const limit = Math.min(
        Math.max(Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_LIST_LIMIT, 1),
        MAX_LIST_LIMIT,
      );
      const rows = await this.conversations.listByOperator(
        input.tenantId,
        actor.userId,
        { ...(input.status ? { status: input.status } : {}), limit },
      );
      // Belt and braces: never return another operator's rows.
      return Result.ok(
        rows.filter(
          (c) => c.tenantId === input.tenantId && c.operatorUserId === actor.userId,
        ),
      );
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export class GetCopilotConversationUseCase {
  constructor(
    private readonly conversations: ICopilotConversationRepository,
    private readonly messages: ICopilotMessageRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; conversationId: string },
    actor: ActorContext,
  ): Promise<
    Result<
      { conversation: CopilotConversationRecord; messages: CopilotMessageRecord[] },
      Error
    >
  > {
    try {
      if (!canUseCopilot(this.permissionChecker, actor, input.tenantId)) {
        return Result.fail(new ForbiddenError());
      }
      const conversation = await loadOwnedConversation(
        this.conversations,
        input.tenantId,
        input.conversationId,
        actor,
      );
      const messages = await this.messages.listMessages(
        input.tenantId,
        conversation.id,
      );
      return Result.ok({ conversation, messages });
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export class ArchiveCopilotConversationUseCase {
  constructor(
    private readonly conversations: ICopilotConversationRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; conversationId: string },
    actor: ActorContext,
  ): Promise<Result<CopilotConversationRecord, Error>> {
    try {
      if (!canUseCopilot(this.permissionChecker, actor, input.tenantId)) {
        return Result.fail(new ForbiddenError());
      }
      const conversation = await loadOwnedConversation(
        this.conversations,
        input.tenantId,
        input.conversationId,
        actor,
      );
      const archived = await this.conversations.archive(
        input.tenantId,
        conversation.id,
        actor.userId,
      );
      if (!archived) {
        return Result.fail(
          new NotFoundError("Copilot conversation", input.conversationId),
        );
      }
      return Result.ok(archived);
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export class SendCopilotMessageUseCase {
  constructor(
    private readonly orchestrator: OperatorCopilotOrchestrator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: {
      tenantId: string;
      conversationId: string;
      message: string;
      activePropertyId?: string | null;
      pageContext?: CopilotPageContext | null;
    },
    actor: ActorContext,
  ): Promise<Result<RunOperatorCopilotTurnResult, Error>> {
    try {
      if (!canUseCopilot(this.permissionChecker, actor, input.tenantId)) {
        return Result.fail(new ForbiddenError());
      }
      return await this.orchestrator.runTurn({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        operatorUserId: actor.userId,
        actor,
        activePropertyId: input.activePropertyId ?? null,
        pageContext: input.pageContext ?? null,
        message: input.message,
      });
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}
