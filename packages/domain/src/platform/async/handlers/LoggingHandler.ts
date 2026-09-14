import type { OutboxEntry } from "../../../shared/types/index";
import type { IOutboxEventHandler, OutboxLogFn } from "../ports/IOutboxEventHandler";

export class LoggingHandler implements IOutboxEventHandler {
  constructor(private readonly log: OutboxLogFn = () => {}) {}

  canHandle(eventType: string): boolean {
    void eventType;
    return true;
  }

  async handle(entry: OutboxEntry): Promise<void> {
    this.log(entry);
  }
}
