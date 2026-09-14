import type { ChannelPollResult, ChannelProviderMessage } from "../types/ChannelProviderMessage";
import type { ChannelPollExecutionContext } from "../types/ChannelTransportExecutionContext";
import type { IChannelPollingProvider } from "../ports/providers/IChannelPollingProvider";

export class TestChannelPollingProvider implements IChannelPollingProvider {
  constructor(private readonly fixtures: Map<string, ChannelProviderMessage[]> = new Map()) {}

  seedCursorMessages(cursor: string | null, messages: ChannelProviderMessage[]): void {
    this.fixtures.set(cursor ?? "__null__", messages);
  }

  async poll(
    connectionId: string,
    cursor: string | null,
    context: ChannelPollExecutionContext,
  ): Promise<ChannelPollResult> {
    void connectionId;
    void context;
    const messages = this.fixtures.get(cursor ?? "__null__") ?? [];
    const nextCursor = cursor == null ? "cursor-1" : `${cursor}-next`;
    return {
      messages: messages.map((message) => ({
        ...message,
        receivedAt:
          message.receivedAt instanceof Date
            ? message.receivedAt
            : new Date(String(message.receivedAt)),
      })),
      nextCursor,
    };
  }
}
