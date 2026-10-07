import type {
  CopilotConversationRecord,
  CopilotConversationStatus,
  CopilotMessageRecord,
} from "../domain/OperatorCopilotTypes";

export interface ICopilotConversationRepository {
  create(input: CopilotConversationRecord): Promise<CopilotConversationRecord>;
  findById(
    tenantId: string,
    id: string,
  ): Promise<CopilotConversationRecord | null>;
  listByOperator(
    tenantId: string,
    operatorUserId: string,
    opts: { status?: CopilotConversationStatus; limit: number },
  ): Promise<CopilotConversationRecord[]>;
  /** Archives only when the conversation belongs to `operatorUserId`. */
  archive(
    tenantId: string,
    id: string,
    operatorUserId: string,
  ): Promise<CopilotConversationRecord | null>;
  touch(
    tenantId: string,
    id: string,
    patch: {
      activePropertyId?: string | null;
      lastMessageAt?: Date;
      title?: string | null;
    },
  ): Promise<CopilotConversationRecord | null>;
}

export interface ICopilotMessageRepository {
  append(input: CopilotMessageRecord): Promise<CopilotMessageRecord>;
  /** Most recent `limit` messages, returned in chronological (ascending) order. */
  listRecentMessages(
    tenantId: string,
    conversationId: string,
    limit: number,
  ): Promise<CopilotMessageRecord[]>;
  /** Full chronological transcript. */
  listMessages(
    tenantId: string,
    conversationId: string,
  ): Promise<CopilotMessageRecord[]>;
}
