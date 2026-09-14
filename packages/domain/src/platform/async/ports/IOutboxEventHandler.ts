import type { OutboxEntry } from "../../../shared/types/index";

export interface IOutboxEventHandler {
  canHandle(eventType: string): boolean;
  handle(entry: OutboxEntry): Promise<void>;
}

export type OutboxLogFn = (entry: OutboxEntry) => void;
