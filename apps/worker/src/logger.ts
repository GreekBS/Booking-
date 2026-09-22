/**
 * Restrained structured logging for the Talos async worker.
 * Never log secrets, credentials, feed URLs, raw provider payloads, or auth headers.
 */

export type WorkerLogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: "info" | "warn" | "error", event: string, fields?: WorkerLogFields): void {
  const line = {
    level,
    component: "talos-async-worker",
    event,
    ...fields,
    timestamp: new Date().toISOString(),
  };
  const serialized = JSON.stringify(line);
  if (level === "error") {
    console.error(serialized);
  } else if (level === "warn") {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
}

export const workerLog = {
  info: (event: string, fields?: WorkerLogFields) => emit("info", event, fields),
  warn: (event: string, fields?: WorkerLogFields) => emit("warn", event, fields),
  error: (event: string, fields?: WorkerLogFields) => emit("error", event, fields),
};
