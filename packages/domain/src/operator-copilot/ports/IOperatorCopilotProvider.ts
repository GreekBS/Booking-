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
    }
  | {
      type: "failure";
      errorCode: string;
      provider: string;
      model: string;
      latencyMs: number;
      success: false;
    };

export interface IOperatorCopilotProvider {
  completeTurn(
    req: OperatorCopilotTurnRequest,
  ): Promise<OperatorCopilotProviderOutcome>;
}
