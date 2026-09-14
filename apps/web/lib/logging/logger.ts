export interface LogContext {
  requestId?: string;
  tenantId?: string | null;
  userId?: string | null;
  action?: string;
}

export function createLogger(context: LogContext = {}) {
  function write(level: string, message: string, extra: Record<string, unknown> = {}) {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      requestId: context.requestId ?? null,
      tenantId: context.tenantId ?? null,
      userId: context.userId ?? null,
      action: context.action ?? null,
      ...extra,
    };
    console.log(JSON.stringify(entry));
  }

  return {
    info: (message: string, extra?: Record<string, unknown>) =>
      write("info", message, extra),
    error: (message: string, extra?: Record<string, unknown>) =>
      write("error", message, extra),
    withContext: (extra: LogContext) =>
      createLogger({ ...context, ...extra }),
  };
}
