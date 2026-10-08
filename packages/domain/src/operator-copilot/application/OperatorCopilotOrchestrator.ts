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
import type { IAiUsageRepository } from "../../messaging/ports/IMessagingRepositories";
import type { AiUsageRecord } from "../../messaging/domain/MessagingTypes";
import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  MAX_TOOL_CALLS_PER_TURN,
  MAX_TOOL_RESULT_CHARS,
  OPERATOR_COPILOT_OPS,
  PROVIDER_TIMEOUT_MS,
  type CopilotMessageRecord,
  type CopilotOperatorContext,
  type CopilotPageContext,
} from "../domain/OperatorCopilotTypes";
import type {
  IOperatorCopilotProvider,
  OperatorCopilotHistoryMessage,
  OperatorCopilotProviderOutcome,
  OperatorCopilotToolResult,
} from "../ports/IOperatorCopilotProvider";
import type {
  ICopilotConversationRepository,
  ICopilotMessageRepository,
} from "../ports/IOperatorCopilotRepositories";
import {
  OPERATOR_COPILOT_SYSTEM_POLICY,
  buildTrustedContextJson,
} from "./OperatorCopilotPolicy";
import type { OperatorCopilotToolRegistry } from "./OperatorCopilotToolRegistry";
import {
  buildCopilotRoundClassification,
  buildCopilotTurnClassification,
} from "./OperatorCopilotTelemetry";
import { truncateJson } from "./tools/minimizeDtos";

export const COPILOT_FRIENDLY_FAILURE_MESSAGE =
  "Sorry, I couldn't complete that request right now. Please try again in a moment. / " +
  "Λυπάμαι, δεν μπόρεσα να ολοκληρώσω το αίτημα αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγο.";

const MAX_TITLE_CHARS = 60;
const TOOL_USAGE_PROVIDER = "talos";

export interface RunOperatorCopilotTurnInput {
  tenantId: string;
  conversationId: string;
  operatorUserId: string;
  actor: ActorContext;
  activePropertyId: string | null;
  pageContext: CopilotPageContext | null;
  message: string;
}

export interface RunOperatorCopilotTurnResult {
  conversationId: string;
  operatorMessage: CopilotMessageRecord;
  assistantMessage: CopilotMessageRecord;
  toolMessages: CopilotMessageRecord[];
  toolCallCount: number;
  /** True when the provider failed and a friendly fallback message was persisted. */
  failed: boolean;
  errorCode: string | null;
}

interface TurnAccumulator {
  inputTokens: number | null;
  outputTokens: number | null;
  provider: string;
  model: string;
  /** Wall-clock start (ms since epoch) for the provider/tool loop. */
  wallStartedAt: number;
  /** Gemini rounds observed (including failed rounds). */
  geminiRounds: number;
  /** Sum of HTTP attempts across rounds (including retries). */
  httpAttemptsTotal: number;
  /** Sum of provider-reported Gemini latencies (ms). */
  geminiLatencyMs: number;
  /** Aggregate tool execution duration (ms). */
  toolLatencyMs: number;
  /** Domain tools executed this turn. */
  toolCallCount: number;
}

function addTokens(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function wallClockMs(acc: TurnAccumulator, nowMs: number = Date.now()): number {
  return Math.max(0, nowMs - acc.wallStartedAt);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("provider_timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Orchestrates one Operator Copilot turn: persist → provider ↔ read-only tools → persist.
 *
 * Security notes:
 * - Never logs prompts, tool payloads or provider output (guest PII may be present).
 * - activePropertyId and page-context property hints are re-authorized here; tool
 *   arguments are re-authorized again inside the registry.
 * - Usage rows store no content, only provider/model/op/latency/error metadata.
 */
export class OperatorCopilotOrchestrator {
  constructor(
    private readonly provider: IOperatorCopilotProvider,
    private readonly registry: OperatorCopilotToolRegistry,
    private readonly conversations: ICopilotConversationRepository,
    private readonly messages: ICopilotMessageRepository,
    private readonly usage: IAiUsageRepository,
    private readonly ids: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runTurn(
    input: RunOperatorCopilotTurnInput,
  ): Promise<Result<RunOperatorCopilotTurnResult, Error>> {
    try {
      const { tenantId, actor } = input;

      // 1. Ownership
      const conversation = await this.conversations.findById(
        tenantId,
        input.conversationId,
      );
      if (!conversation) {
        return Result.fail(new NotFoundError("Copilot conversation", input.conversationId));
      }
      if (
        conversation.tenantId !== tenantId ||
        conversation.operatorUserId !== input.operatorUserId ||
        actor.userId !== input.operatorUserId
      ) {
        return Result.fail(new ForbiddenError());
      }
      if (conversation.status !== "active") {
        return Result.fail(new ValidationError("Conversation is archived"));
      }

      // 2. Message validation
      const message = input.message.trim();
      if (!message) {
        return Result.fail(new ValidationError("Message is required"));
      }
      if (message.length > MAX_MESSAGE_CHARS) {
        return Result.fail(new ValidationError("Message is too long"));
      }

      // 3. Property authorization (fail closed)
      const activePropertyId = input.activePropertyId?.trim() || null;
      if (activePropertyId && !this.canReadProperty(actor, tenantId, activePropertyId)) {
        return Result.fail(new ForbiddenError("Property access denied"));
      }
      const pageContext = this.sanitizePageContext(
        input.pageContext,
        actor,
        tenantId,
      );

      const ctx: CopilotOperatorContext = {
        userId: actor.userId,
        tenantId,
        role: actor.role,
        propertyIds: actor.propertyIds,
        isSuperAdmin: actor.isSuperAdmin,
        activePropertyId,
        pageContext,
      };

      // 4. Persist operator message
      const operatorMessage = await this.messages.append({
        id: this.ids.generate(),
        tenantId,
        conversationId: conversation.id,
        role: "operator",
        content: message,
        toolName: null,
        toolCallId: null,
        createdAt: this.now(),
      });

      // 5. Bounded history (excluding the message just persisted)
      const history = await this.loadHistory(tenantId, conversation.id, operatorMessage.id);

      const result = await this.runProviderLoop({
        ctx,
        actor,
        conversationId: conversation.id,
        message,
        history,
        operatorMessage,
      });

      // 7. Touch conversation
      await this.conversations.touch(tenantId, conversation.id, {
        activePropertyId,
        lastMessageAt: this.now(),
        ...(conversation.title ? {} : { title: this.deriveTitle(message) }),
      });

      return Result.ok(result);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // -------------------------------------------------------------------------

  private async runProviderLoop(args: {
    ctx: CopilotOperatorContext;
    actor: ActorContext;
    conversationId: string;
    message: string;
    history: OperatorCopilotHistoryMessage[];
    operatorMessage: CopilotMessageRecord;
  }): Promise<RunOperatorCopilotTurnResult> {
    const { ctx, actor, conversationId, message, history, operatorMessage } = args;
    const trustedContextJson = buildTrustedContextJson(ctx);
    const declarations = this.registry.listDeclarations();
    const toolResults: OperatorCopilotToolResult[] = [];
    const toolMessages: CopilotMessageRecord[] = [];
    const acc: TurnAccumulator = {
      inputTokens: null,
      outputTokens: null,
      provider: "unknown",
      model: "unknown",
      wallStartedAt: Date.now(),
      geminiRounds: 0,
      httpAttemptsTotal: 0,
      geminiLatencyMs: 0,
      toolLatencyMs: 0,
      toolCallCount: 0,
    };

    // MAX_TOOL_CALLS_PER_TURN tool rounds + 1 final answer round.
    for (let round = 0; round <= MAX_TOOL_CALLS_PER_TURN; round += 1) {
      const finalRound = round === MAX_TOOL_CALLS_PER_TURN;
      const outcome = await this.callProvider({
        systemPolicy: OPERATOR_COPILOT_SYSTEM_POLICY,
        operatorRequest: message,
        trustedContextJson,
        history,
        // Last round: no tools, forcing a text answer.
        tools: finalRound ? [] : declarations,
        ...(toolResults.length > 0 ? { toolResults: [...toolResults] } : {}),
      });

      acc.provider = outcome.provider;
      acc.model = outcome.model;
      acc.geminiRounds += 1;
      acc.geminiLatencyMs += Math.max(0, outcome.latencyMs);
      const roundHttp =
        typeof outcome.httpAttempts === "number" && Number.isFinite(outcome.httpAttempts)
          ? Math.max(0, Math.floor(outcome.httpAttempts))
          : 0;
      acc.httpAttemptsTotal += roundHttp;

      await this.recordRoundUsage(ctx, {
        roundIndex1Based: acc.geminiRounds,
        httpAttempts: roundHttp,
        latencyMs: Math.max(0, outcome.latencyMs),
        provider: outcome.provider,
        model: outcome.model,
        inputTokens: outcome.type === "failure" ? null : outcome.inputTokens,
        outputTokens: outcome.type === "failure" ? null : outcome.outputTokens,
        success: outcome.type !== "failure",
        errorCode: outcome.type === "failure" ? outcome.errorCode : null,
      });

      if (outcome.type === "failure") {
        return this.finishWithFailure(
          ctx,
          conversationId,
          operatorMessage,
          toolMessages,
          acc,
          outcome.errorCode,
        );
      }

      acc.inputTokens = addTokens(acc.inputTokens, outcome.inputTokens);
      acc.outputTokens = addTokens(acc.outputTokens, outcome.outputTokens);

      if (outcome.type === "text") {
        const text = outcome.text.trim();
        if (!text) {
          return this.finishWithFailure(
            ctx,
            conversationId,
            operatorMessage,
            toolMessages,
            acc,
            "empty_response",
          );
        }
        const assistantMessage = await this.messages.append({
          id: this.ids.generate(),
          tenantId: ctx.tenantId,
          conversationId,
          role: "assistant",
          content: text.slice(0, MAX_MESSAGE_CHARS * 2),
          toolName: null,
          toolCallId: null,
          createdAt: this.now(),
        });
        await this.recordTurnUsage(ctx, acc, { success: true, errorCode: null });
        return {
          conversationId,
          operatorMessage,
          assistantMessage,
          toolMessages,
          toolCallCount: acc.toolCallCount,
          failed: false,
          errorCode: null,
        };
      }

      // tool_calls
      if (finalRound || outcome.toolCalls.length === 0) {
        return this.finishWithFailure(
          ctx,
          conversationId,
          operatorMessage,
          toolMessages,
          acc,
          "tool_loop_exceeded",
        );
      }

      for (const call of outcome.toolCalls) {
        const providerCallId = call.providerCallId?.trim() || undefined;
        const toolCallId =
          providerCallId || call.id?.trim() || this.ids.generate();
        let content: string;
        let ok = false;
        let errorCode: string | null = null;
        const started = Date.now();

        if (acc.toolCallCount >= MAX_TOOL_CALLS_PER_TURN) {
          // Over the cap: tell the model, do not execute.
          errorCode = "tool_call_limit";
          content = truncateJson({ ok: false, errorCode }, MAX_TOOL_RESULT_CHARS);
        } else {
          acc.toolCallCount += 1;
          const result = await this.registry.execute(
            call.name,
            call.arguments ?? {},
            ctx,
            actor,
          );
          ok = result.ok;
          errorCode = result.ok ? null : (result.errorCode ?? "tool_error");
          content = truncateJson(
            result.ok
              ? { ok: true, data: result.data }
              : { ok: false, errorCode },
            MAX_TOOL_RESULT_CHARS,
          );
        }

        const toolLatencyMs = Math.max(0, Date.now() - started);
        if (errorCode !== "tool_call_limit") {
          acc.toolLatencyMs += toolLatencyMs;
        }

        const toolMessage = await this.messages.append({
          id: this.ids.generate(),
          tenantId: ctx.tenantId,
          conversationId,
          role: "tool",
          content,
          toolName: call.name.slice(0, 64),
          toolCallId,
          createdAt: this.now(),
        });
        toolMessages.push(toolMessage);
        toolResults.push({
          toolCallId,
          name: call.name,
          content,
          arguments: call.arguments ?? {},
          ...(typeof call.thoughtSignature === "string" &&
          call.thoughtSignature.length > 0
            ? { thoughtSignature: call.thoughtSignature }
            : {}),
          ...(providerCallId ? { providerCallId } : {}),
        });

        await this.recordToolUsage(ctx, {
          toolName: call.name.slice(0, 64),
          latencyMs: toolLatencyMs,
          success: ok,
          errorCode,
        });
      }
    }

    // Unreachable (final round always returns), kept for type completeness.
    return this.finishWithFailure(
      ctx,
      conversationId,
      operatorMessage,
      toolMessages,
      acc,
      "tool_loop_exceeded",
    );
  }

  private async callProvider(
    req: Parameters<IOperatorCopilotProvider["completeTurn"]>[0],
  ): Promise<OperatorCopilotProviderOutcome> {
    const started = Date.now();
    try {
      return await withTimeout(this.provider.completeTurn(req), PROVIDER_TIMEOUT_MS);
    } catch (error) {
      const timedOut = error instanceof Error && error.message === "provider_timeout";
      return {
        type: "failure",
        errorCode: timedOut ? "provider_timeout" : "provider_exception",
        provider: "unknown",
        model: "unknown",
        latencyMs: Date.now() - started,
        success: false,
        httpAttempts: 0,
      };
    }
  }

  private async finishWithFailure(
    ctx: CopilotOperatorContext,
    conversationId: string,
    operatorMessage: CopilotMessageRecord,
    toolMessages: CopilotMessageRecord[],
    acc: TurnAccumulator,
    errorCode: string,
  ): Promise<RunOperatorCopilotTurnResult> {
    const assistantMessage = await this.messages.append({
      id: this.ids.generate(),
      tenantId: ctx.tenantId,
      conversationId,
      role: "assistant",
      content: COPILOT_FRIENDLY_FAILURE_MESSAGE,
      toolName: null,
      toolCallId: null,
      createdAt: this.now(),
    });
    await this.recordTurnUsage(ctx, acc, { success: false, errorCode });
    return {
      conversationId,
      operatorMessage,
      assistantMessage,
      toolMessages,
      toolCallCount: acc.toolCallCount,
      failed: true,
      errorCode,
    };
  }

  /** Turn row: wall-clock latency + compact sanitized counters. */
  private async recordTurnUsage(
    ctx: CopilotOperatorContext,
    acc: TurnAccumulator,
    outcome: { success: boolean; errorCode: string | null },
  ): Promise<void> {
    const classification = buildCopilotTurnClassification({
      geminiRounds: acc.geminiRounds,
      httpAttemptsTotal: acc.httpAttemptsTotal,
      toolCallCount: acc.toolCallCount,
      toolLatencyMs: acc.toolLatencyMs,
      geminiLatencyMs: acc.geminiLatencyMs,
    });
    await this.persistUsage({
      tenantId: ctx.tenantId,
      propertyId: ctx.activePropertyId,
      provider: acc.provider,
      model: acc.model,
      operation: OPERATOR_COPILOT_OPS.TURN,
      classification,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      latencyMs: wallClockMs(acc),
      success: outcome.success,
      errorCode: outcome.errorCode,
    });
  }

  /** One row per Gemini generateContent round. */
  private async recordRoundUsage(
    ctx: CopilotOperatorContext,
    input: {
      roundIndex1Based: number;
      httpAttempts: number;
      latencyMs: number;
      provider: string;
      model: string;
      inputTokens: number | null;
      outputTokens: number | null;
      success: boolean;
      errorCode: string | null;
    },
  ): Promise<void> {
    await this.persistUsage({
      tenantId: ctx.tenantId,
      propertyId: ctx.activePropertyId,
      provider: input.provider,
      model: input.model.slice(0, 64),
      operation: OPERATOR_COPILOT_OPS.ROUND,
      classification: buildCopilotRoundClassification(
        input.roundIndex1Based,
        input.httpAttempts,
      ),
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      latencyMs: input.latencyMs,
      success: input.success,
      errorCode: input.errorCode,
    });
  }

  private async recordToolUsage(
    ctx: CopilotOperatorContext,
    input: {
      toolName: string;
      latencyMs: number;
      success: boolean;
      errorCode: string | null;
    },
  ): Promise<void> {
    await this.persistUsage({
      tenantId: ctx.tenantId,
      propertyId: ctx.activePropertyId,
      provider: TOOL_USAGE_PROVIDER,
      model: input.toolName,
      operation: OPERATOR_COPILOT_OPS.TOOL,
      classification: input.toolName,
      inputTokens: null,
      outputTokens: null,
      latencyMs: input.latencyMs,
      success: input.success,
      errorCode: input.errorCode,
    });
  }

  /** Usage is best-effort telemetry: a failure here must never fail the turn. */
  private async persistUsage(input: {
    tenantId: string;
    propertyId: string | null;
    provider: string;
    model: string;
    operation: string;
    classification: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number;
    success: boolean;
    errorCode: string | null;
  }): Promise<void> {
    const record: AiUsageRecord = {
      id: this.ids.generate(),
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      // Copilot conversations are not guest conversations; avoid cross-table linkage.
      conversationId: null,
      provider: input.provider.slice(0, 32),
      model: input.model.slice(0, 64),
      operation: input.operation.slice(0, 32),
      classification: input.classification
        ? input.classification.slice(0, 32)
        : null,
      autoAnswered: false,
      escalated: false,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      latencyMs: input.latencyMs,
      success: input.success,
      errorCode: input.errorCode,
      estimatedCostMinor: null,
      createdAt: this.now(),
    };
    try {
      await this.usage.record(record);
    } catch {
      // swallow: telemetry only
    }
  }

  private async loadHistory(
    tenantId: string,
    conversationId: string,
    excludeMessageId: string,
  ): Promise<OperatorCopilotHistoryMessage[]> {
    const recent = await this.messages.listRecentMessages(
      tenantId,
      conversationId,
      MAX_HISTORY_MESSAGES + 1,
    );
    const prior = recent
      .filter((m) => m.id !== excludeMessageId)
      .slice(-MAX_HISTORY_MESSAGES);
    // Drop orphaned leading tool results (their calls fell outside the window).
    let start = 0;
    while (start < prior.length && prior[start]!.role === "tool") start += 1;
    return prior.slice(start).map((m) => ({
      role: m.role,
      content: m.content,
      toolName: m.toolName,
      toolCallId: m.toolCallId,
    }));
  }

  private canReadProperty(
    actor: ActorContext,
    tenantId: string,
    propertyId: string,
  ): boolean {
    return this.permissionChecker.canAccessProperty(
      actor,
      tenantId,
      propertyId,
      "property:read",
    );
  }

  /** Page context is client-supplied: drop an unauthorized propertyId hint. */
  private sanitizePageContext(
    page: CopilotPageContext | null,
    actor: ActorContext,
    tenantId: string,
  ): CopilotPageContext | null {
    if (!page) return null;
    const out: CopilotPageContext = { ...page };
    if (out.propertyId && !this.canReadProperty(actor, tenantId, out.propertyId)) {
      delete out.propertyId;
    }
    return out;
  }

  private deriveTitle(message: string): string {
    const single = message.replace(/\s+/g, " ").trim();
    return single.length > MAX_TITLE_CHARS
      ? `${single.slice(0, MAX_TITLE_CHARS - 1)}…`
      : single;
  }
}
