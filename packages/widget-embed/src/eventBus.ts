import type { WidgetEvent } from "@hcp/storefront-sdk";
import { isWidgetEvent } from "@hcp/storefront-sdk";
import type { WidgetEventType } from "@hcp/storefront-sdk";

type EmbedEventHandler = (event: WidgetEvent) => void;

const listeners = new Map<WidgetEventType | "*", Set<EmbedEventHandler>>();

export function subscribeWidgetEvent(
  type: WidgetEventType | "*",
  handler: EmbedEventHandler,
): () => void {
  if (!listeners.has(type)) {
    listeners.set(type, new Set());
  }
  listeners.get(type)!.add(handler);
  return () => listeners.get(type)?.delete(handler);
}

export function emitWidgetEvent(event: WidgetEvent): void {
  if (!isWidgetEvent(event)) {
    return;
  }
  listeners.get(event.type)?.forEach((fn) => fn(event));
  listeners.get("*")?.forEach((fn) => fn(event));
}
