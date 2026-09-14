import type { IOutboxEventHandler } from "../ports/IOutboxEventHandler";

export class OutboxHandlerRegistry {
  private readonly handlers: IOutboxEventHandler[] = [];

  register(handler: IOutboxEventHandler): void {
    this.handlers.push(handler);
  }

  resolve(eventType: string): IOutboxEventHandler | undefined {
    return this.handlers.find((handler) => handler.canHandle(eventType));
  }
}
