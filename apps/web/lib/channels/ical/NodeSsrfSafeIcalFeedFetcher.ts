import * as dns from "node:dns";
import * as https from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { IcalFeedFetchError } from "./icalFeedFetchErrors";
import { classifyGloballyRoutableIp, type ClassifiedIp } from "./isGloballyRoutableIp";
import type { IcalFeedFetchResult, IcalFeedFetcher, ValidatedIcalFeedUrl } from "./icalFeedFetchTypes";
import { validateIcalFeedUrl } from "./validateIcalFeedUrl";

const FETCH_BUDGET_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_HEADER_BYTES = 16_384;
const MAX_REDIRECTS = 3;
const USER_AGENT = "HCP-ChannelIcal/1.0";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const ALLOWED_CONTENT_TYPES = new Set([
  "text/calendar",
  "application/calendar",
  "text/plain",
  "application/octet-stream",
]);

export type IcalDnsLookupResult = ReadonlyArray<{ address: string; family: number }>;

export type IcalFeedDnsLookup = (hostname: string) => Promise<IcalDnsLookupResult>;

/**
 * Optional remap of the validated connect peer (tests only).
 * Production must leave this unset so TCP targets the classified IP.
 */
export type IcalFeedConnectRemap = (
  ip: string,
  port: number,
) => { connectHost: string; connectPort: number };

export interface NodeSsrfSafeIcalFeedFetcherOptions {
  lookup?: IcalFeedDnsLookup;
  now?: () => number;
  remapConnect?: IcalFeedConnectRemap;
  /**
   * Test-only: allow self-signed peers when remapping to a local server.
   * Ignored / rejected when NODE_ENV === "production".
   */
  allowInsecureTlsForTests?: boolean;
}

type HopOutcome =
  | { kind: "result"; result: IcalFeedFetchResult }
  | { kind: "redirect"; next: ValidatedIcalFeedUrl };

function remainingMs(deadline: number, now: () => number): number {
  return deadline - now();
}

function assertNotTimedOut(deadline: number, now: () => number, redirectHop?: number): void {
  if (remainingMs(deadline, now) <= 0) {
    throw new IcalFeedFetchError("ICAL_FEED_TIMEOUT", "Feed fetch timed out", { redirectHop });
  }
}

function normalizeContentType(header: string | undefined): string | null {
  if (header == null) {
    return null;
  }
  const trimmed = header.trim();
  if (trimmed === "") {
    return null;
  }
  const media = trimmed.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return media === "" ? null : media;
}

function assertAllowedContentType(contentType: string | null): void {
  if (contentType === null) {
    return;
  }
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new IcalFeedFetchError(
      "ICAL_FEED_CONTENT_TYPE_REJECTED",
      "Feed response content type is not allowed",
    );
  }
}

function assertAllowedContentEncoding(header: string | undefined): void {
  if (header == null || header.trim() === "") {
    return;
  }
  const tokens = header
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  if (tokens.length === 0) {
    return;
  }
  if (tokens.length === 1 && tokens[0] === "identity") {
    return;
  }
  throw new IcalFeedFetchError(
    "ICAL_FEED_CONTENT_ENCODING_REJECTED",
    "Feed response content encoding is not allowed",
  );
}

function parseContentLength(header: string | undefined): number | null {
  if (header == null || header.trim() === "") {
    return null;
  }
  if (!/^\d+$/.test(header.trim())) {
    throw new IcalFeedFetchError(
      "ICAL_FEED_INCOMPLETE_RESPONSE",
      "Feed response content length is invalid",
    );
  }
  const value = Number(header.trim());
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new IcalFeedFetchError(
      "ICAL_FEED_INCOMPLETE_RESPONSE",
      "Feed response content length is invalid",
    );
  }
  return value;
}

function compareIp(a: ClassifiedIp, b: ClassifiedIp): number {
  if (a.family !== b.family) {
    return a.family === 6 ? -1 : 1;
  }
  return a.address < b.address ? -1 : a.address > b.address ? 1 : 0;
}

function selectPinnedAddress(results: IcalDnsLookupResult): ClassifiedIp {
  const classified: ClassifiedIp[] = [];
  const seen = new Set<string>();

  for (const entry of results) {
    const classifiedIp = classifyGloballyRoutableIp(entry.address);
    if (!classifiedIp) {
      throw new IcalFeedFetchError(
        "ICAL_FEED_SSRF_REJECTED",
        "Feed destination is not allowed",
      );
    }
    const key = `${classifiedIp.family}/${classifiedIp.address}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    classified.push(classifiedIp);
  }

  if (classified.length === 0) {
    throw new IcalFeedFetchError("ICAL_FEED_NETWORK_FAILURE", "Feed DNS resolution failed");
  }

  classified.sort(compareIp);
  return classified[0]!;
}

function destroyMessage(res: IncomingMessage): void {
  res.resume();
  res.destroy();
}

function defaultLookup(hostname: string): Promise<IcalDnsLookupResult> {
  return dns.promises.lookup(hostname, { all: true, verbatim: true });
}

function rebuildHref(url: ValidatedIcalFeedUrl): string {
  return `https://${url.hostname}${url.requestPath}`;
}

/**
 * Node SSRF-safe iCal feed fetcher (P1-S2).
 * Infrastructure-local — not wired into IcalPollingProvider.poll().
 */
export class NodeSsrfSafeIcalFeedFetcher implements IcalFeedFetcher {
  private readonly lookup: IcalFeedDnsLookup;
  private readonly now: () => number;
  private readonly remapConnect: IcalFeedConnectRemap;
  private readonly rejectUnauthorized: boolean;

  constructor(options: NodeSsrfSafeIcalFeedFetcherOptions = {}) {
    this.lookup = options.lookup ?? defaultLookup;
    this.now = options.now ?? (() => performance.now());
    this.remapConnect =
      options.remapConnect ?? ((ip, port) => ({ connectHost: ip, connectPort: port }));
    if (options.allowInsecureTlsForTests === true && process.env.NODE_ENV === "production") {
      throw new Error("allowInsecureTlsForTests is not permitted in production");
    }
    this.rejectUnauthorized = options.allowInsecureTlsForTests === true ? false : true;
  }

  async fetch(feedUrl: string): Promise<IcalFeedFetchResult> {
    const deadline = this.now() + FETCH_BUDGET_MS;
    let current = validateIcalFeedUrl(feedUrl);

    for (let hop = 0; ; hop += 1) {
      assertNotTimedOut(deadline, this.now, hop);
      const outcome = await this.fetchHop(current, deadline, hop);
      if (outcome.kind === "result") {
        return outcome.result;
      }
      if (hop + 1 > MAX_REDIRECTS) {
        throw new IcalFeedFetchError(
          "ICAL_FEED_REDIRECT_REJECTED",
          "Feed redirect limit exceeded",
          { redirectHop: hop + 1 },
        );
      }
      current = outcome.next;
    }
  }

  private async fetchHop(
    target: ValidatedIcalFeedUrl,
    deadline: number,
    redirectHop: number,
  ): Promise<HopOutcome> {
    assertNotTimedOut(deadline, this.now, redirectHop);

    let lookupResult: IcalDnsLookupResult;
    try {
      lookupResult = await this.lookup(target.hostname);
    } catch {
      assertNotTimedOut(deadline, this.now, redirectHop);
      throw new IcalFeedFetchError("ICAL_FEED_NETWORK_FAILURE", "Feed DNS resolution failed", {
        redirectHop,
      });
    }

    // Late DNS after deadline must never connect.
    if (remainingMs(deadline, this.now) <= 0) {
      throw new IcalFeedFetchError("ICAL_FEED_TIMEOUT", "Feed fetch timed out", { redirectHop });
    }

    if (!Array.isArray(lookupResult) || lookupResult.length === 0) {
      throw new IcalFeedFetchError("ICAL_FEED_NETWORK_FAILURE", "Feed DNS resolution failed", {
        redirectHop,
      });
    }

    const pinned = selectPinnedAddress(lookupResult);
    const remapped = this.remapConnect(pinned.address, target.port);

    return await this.performPinnedHttpsGet({
      connectHost: remapped.connectHost,
      connectPort: remapped.connectPort,
      servername: target.hostname,
      hostHeader: target.hostname,
      path: target.requestPath,
      family: pinned.family,
      deadline,
      redirectHop,
      currentUrl: target,
    });
  }

  private performPinnedHttpsGet(args: {
    connectHost: string;
    connectPort: number;
    servername: string;
    hostHeader: string;
    path: string;
    family: 4 | 6;
    deadline: number;
    redirectHop: number;
    currentUrl: ValidatedIcalFeedUrl;
  }): Promise<HopOutcome> {
    const budget = remainingMs(args.deadline, this.now);
    if (budget <= 0) {
      return Promise.reject(
        new IcalFeedFetchError("ICAL_FEED_TIMEOUT", "Feed fetch timed out", {
          redirectHop: args.redirectHop,
        }),
      );
    }

    return new Promise<HopOutcome>((resolve, reject) => {
      let settled = false;
      const settleResolve = (value: HopOutcome): void => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      };
      const settleReject = (error: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };

      const agent = new https.Agent({
        keepAlive: false,
        maxCachedSessions: 0,
      });

      let req: ClientRequest;
      try {
        req = https.request(
          {
            protocol: "https:",
            host: args.connectHost,
            hostname: args.connectHost,
            port: args.connectPort,
            method: "GET",
            path: args.path,
            servername: args.servername,
            family: args.family,
            agent,
            rejectUnauthorized: this.rejectUnauthorized,
            headers: {
              Host: args.hostHeader,
              "User-Agent": USER_AGENT,
              Accept: "text/calendar, text/plain, application/octet-stream, */*;q=0.1",
              "Accept-Encoding": "identity",
              Connection: "close",
            },
            maxHeaderSize: MAX_HEADER_BYTES,
          },
          (res) => {
            this.consumeResponse(res, {
              settled: () => settled,
              settleResolve,
              settleReject,
              destroyAll: () => {
                destroyMessage(res);
                req.destroy();
                agent.destroy();
              },
              deadline: args.deadline,
              redirectHop: args.redirectHop,
              currentUrl: args.currentUrl,
            });
          },
        );
      } catch {
        agent.destroy();
        settleReject(
          new IcalFeedFetchError("ICAL_FEED_NETWORK_FAILURE", "Feed network request failed", {
            redirectHop: args.redirectHop,
          }),
        );
        return;
      }

      const onTimeout = (): void => {
        req.destroy();
        agent.destroy();
        settleReject(
          new IcalFeedFetchError("ICAL_FEED_TIMEOUT", "Feed fetch timed out", {
            redirectHop: args.redirectHop,
          }),
        );
      };

      req.setTimeout(Math.max(1, Math.floor(budget)), onTimeout);
      req.on("timeout", onTimeout);

      req.on("error", () => {
        agent.destroy();
        if (settled) {
          return;
        }
        if (remainingMs(args.deadline, this.now) <= 0) {
          settleReject(
            new IcalFeedFetchError("ICAL_FEED_TIMEOUT", "Feed fetch timed out", {
              redirectHop: args.redirectHop,
            }),
          );
          return;
        }
        settleReject(
          new IcalFeedFetchError("ICAL_FEED_NETWORK_FAILURE", "Feed network request failed", {
            redirectHop: args.redirectHop,
          }),
        );
      });

      try {
        req.end();
      } catch {
        agent.destroy();
        settleReject(
          new IcalFeedFetchError("ICAL_FEED_NETWORK_FAILURE", "Feed network request failed", {
            redirectHop: args.redirectHop,
          }),
        );
      }
    });
  }

  private consumeResponse(
    res: IncomingMessage,
    ctx: {
      settled: () => boolean;
      settleResolve: (value: HopOutcome) => void;
      settleReject: (error: unknown) => void;
      destroyAll: () => void;
      deadline: number;
      redirectHop: number;
      currentUrl: ValidatedIcalFeedUrl;
    },
  ): void {
    const { settleResolve, settleReject, destroyAll, deadline, redirectHop, currentUrl } = ctx;

    const status = res.statusCode ?? 0;

    if (REDIRECT_STATUSES.has(status)) {
      const locationHeader = res.headers.location;
      destroyAll();
      if (typeof locationHeader !== "string" || locationHeader.trim() === "") {
        settleReject(
          new IcalFeedFetchError(
            "ICAL_FEED_REDIRECT_REJECTED",
            "Feed redirect location is invalid",
            { statusCode: status, redirectHop },
          ),
        );
        return;
      }
      let nextHref: string;
      try {
        nextHref = new URL(locationHeader, rebuildHref(currentUrl)).href;
      } catch {
        settleReject(
          new IcalFeedFetchError(
            "ICAL_FEED_REDIRECT_REJECTED",
            "Feed redirect location is invalid",
            { statusCode: status, redirectHop },
          ),
        );
        return;
      }
      try {
        const next = validateIcalFeedUrl(nextHref);
        settleResolve({ kind: "redirect", next });
      } catch (error) {
        settleReject(
          new IcalFeedFetchError(
            "ICAL_FEED_REDIRECT_REJECTED",
            "Feed redirect target is not allowed",
            { statusCode: status, redirectHop },
          ),
        );
        void error;
      }
      return;
    }

    if (status !== 200) {
      destroyAll();
      settleReject(
        new IcalFeedFetchError(
          "ICAL_FEED_UNEXPECTED_STATUS",
          "Feed response status is not allowed",
          { statusCode: status, redirectHop },
        ),
      );
      return;
    }

    try {
      assertAllowedContentEncoding(
        Array.isArray(res.headers["content-encoding"])
          ? res.headers["content-encoding"].join(",")
          : res.headers["content-encoding"],
      );
      const contentType = normalizeContentType(
        Array.isArray(res.headers["content-type"])
          ? res.headers["content-type"][0]
          : res.headers["content-type"],
      );
      assertAllowedContentType(contentType);

      const declaredLength = parseContentLength(
        Array.isArray(res.headers["content-length"])
          ? res.headers["content-length"][0]
          : res.headers["content-length"],
      );
      if (declaredLength !== null && declaredLength > MAX_BODY_BYTES) {
        settleReject(
          new IcalFeedFetchError(
            "ICAL_FEED_RESPONSE_TOO_LARGE",
            "Feed response exceeds size limit",
            { statusCode: status, redirectHop, byteLength: declaredLength },
          ),
        );
        destroyAll();
        return;
      }

      const chunks: Buffer[] = [];
      let received = 0;
      let endedCleanly = false;

      res.on("data", (chunk: Buffer | string) => {
        if (ctx.settled()) {
          return;
        }
        if (remainingMs(deadline, this.now) <= 0) {
          destroyAll();
          settleReject(
            new IcalFeedFetchError("ICAL_FEED_TIMEOUT", "Feed fetch timed out", { redirectHop }),
          );
          return;
        }
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        received += buf.byteLength;
        if (received > MAX_BODY_BYTES) {
          settleReject(
            new IcalFeedFetchError(
              "ICAL_FEED_RESPONSE_TOO_LARGE",
              "Feed response exceeds size limit",
              { statusCode: status, redirectHop, byteLength: received },
            ),
          );
          destroyAll();
          return;
        }
        chunks.push(buf);
      });

      res.on("aborted", () => {
        if (ctx.settled()) {
          return;
        }
        destroyAll();
        settleReject(
          new IcalFeedFetchError(
            "ICAL_FEED_INCOMPLETE_RESPONSE",
            "Feed response was incomplete",
            { statusCode: status, redirectHop },
          ),
        );
      });

      res.on("error", () => {
        if (ctx.settled()) {
          return;
        }
        destroyAll();
        if (remainingMs(deadline, this.now) <= 0) {
          settleReject(
            new IcalFeedFetchError("ICAL_FEED_TIMEOUT", "Feed fetch timed out", { redirectHop }),
          );
          return;
        }
        settleReject(
          new IcalFeedFetchError(
            "ICAL_FEED_INCOMPLETE_RESPONSE",
            "Feed response was incomplete",
            { statusCode: status, redirectHop },
          ),
        );
      });

      res.on("end", () => {
        if (ctx.settled()) {
          return;
        }
        endedCleanly = true;
        if (remainingMs(deadline, this.now) <= 0) {
          destroyAll();
          settleReject(
            new IcalFeedFetchError("ICAL_FEED_TIMEOUT", "Feed fetch timed out", { redirectHop }),
          );
          return;
        }
        if (!endedCleanly) {
          destroyAll();
          settleReject(
            new IcalFeedFetchError(
              "ICAL_FEED_INCOMPLETE_RESPONSE",
              "Feed response was incomplete",
              { statusCode: status, redirectHop },
            ),
          );
          return;
        }
        if (declaredLength !== null && received !== declaredLength) {
          destroyAll();
          settleReject(
            new IcalFeedFetchError(
              "ICAL_FEED_INCOMPLETE_RESPONSE",
              "Feed response length mismatch",
              { statusCode: status, redirectHop, byteLength: received },
            ),
          );
          return;
        }
        const body = new Uint8Array(Buffer.concat(chunks));
        destroyAll();
        settleResolve({
          kind: "result",
          result: { body, contentType },
        });
      });

      res.on("close", () => {
        if (ctx.settled() || endedCleanly) {
          return;
        }
        destroyAll();
        settleReject(
          new IcalFeedFetchError(
            "ICAL_FEED_INCOMPLETE_RESPONSE",
            "Feed response was incomplete",
            { statusCode: status, redirectHop },
          ),
        );
      });
    } catch (error) {
      destroyAll();
      if (error instanceof IcalFeedFetchError) {
        settleReject(error);
        return;
      }
      settleReject(
        new IcalFeedFetchError("ICAL_FEED_NETWORK_FAILURE", "Feed network request failed", {
          redirectHop,
        }),
      );
    }
  }
}
