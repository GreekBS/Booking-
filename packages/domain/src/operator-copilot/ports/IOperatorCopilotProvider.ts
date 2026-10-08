export interface OperatorCopilotToolDeclaration {
  name: string;
  description: string;
  /** JSON Schema describing the tool arguments. */
  parameters: Record<string, unknown>;
}

export interface OperatorCopilotHistoryMessage {
  role: "operator" | "assistant" | "tool";
  content: string;
  toolName?: string | null;
  toolCallId?: string | null;
}

export interface OperatorCopilotToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /**
   * Exact Gemini `Part.thoughtSignature` when the model provided one.
   * Must be echoed on the replayed functionCall part — never invented.
   */
  thoughtSignature?: string;
  /**
   * Exact Gemini `functionCall.id` when the model provided one.
   * Must be echoed on both the replayed functionCall and the FunctionResponse.
   * Absent when the provider did not supply an id (do not fabricate on the wire).
   */
  providerCallId?: string;
}

/**
 * Server-executed tool outcome fed back to the provider on later rounds of the
 * same operator turn. `arguments` MUST be the original model-proposed args that
 * the registry already validated/authorized — never reconstructed or guessed.
 */
export interface OperatorCopilotToolResult {
  toolCallId: string;
  name: string;
  content: string;
  /** Original tool-call arguments (may be `{}`). Required for Gemini round-trips. */
  arguments: Record<string, unknown>;
  /** Echo of the model Part.thoughtSignature when present (never invented). */
  thoughtSignature?: string;
  /** Echo of the model functionCall.id when present (never invented). */
  providerCallId?: string;
}

export interface OperatorCopilotTurnRequest {
  systemPolicy: string;
  operatorRequest: string;
  /** Structured Talos context (active property, page hints). TRUSTED. */
  trustedContextJson: string;
  history: OperatorCopilotHistoryMessage[];
  tools: OperatorCopilotToolDeclaration[];
  /** Results of tool calls executed earlier in this turn. */
  toolResults?: OperatorCopilotToolResult[];
}

export type OperatorCopilotProviderOutcome =
  | {
      type: "text";
      text: string;
      provider: string;
      model: string;
      inputTokens: number | null;
      outputTokens: number | null;
      latencyMs: number;
      success: true;
      /** HTTP attempts used for this provider call (1 = no retry). Sanitized telemetry only. */
      httpAttempts?: number;
    }
  | {
      type: "tool_calls";
      toolCalls: OperatorCopilotToolCallRequest[];
      provider: string;
      model: string;
      inputTokens: number | null;
      outputTokens: number | null;
      latencyMs: number;
      success: true;
      httpAttempts?: number;
    }
  | {
      type: "failure";
      errorCode: string;
      provider: string;
      model: string;
      latencyMs: number;
      success: false;
      httpAttempts?: number;
    };

export interface IOperatorCopilotProvider {
  completeTurn(
    req: OperatorCopilotTurnRequest,
  ): Promise<OperatorCopilotProviderOutcome>;
}
