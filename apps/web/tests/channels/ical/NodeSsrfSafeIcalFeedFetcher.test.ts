import { createServer, type Server } from "node:https";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { IcalFeedFetchError } from "@/lib/channels/ical/icalFeedFetchErrors";
import { NodeSsrfSafeIcalFeedFetcher } from "@/lib/channels/ical/NodeSsrfSafeIcalFeedFetcher";

const FIXTURE_KEY = readFileSync(join(__dirname, "fixtures", "key.pem"));
const FIXTURE_CERT = readFileSync(join(__dirname, "fixtures", "cert.pem"));

async function listenServer(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
): Promise<{ server: Server; port: number; close: () => Promise<void> }> {
  const server = createServer({ key: FIXTURE_KEY, cert: FIXTURE_CERT }, handler);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind test server");
  }
  return {
    server,
    port: address.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

const PUBLIC_TEST_IP = "8.8.8.8";

function fetcherForLocalPort(port: number, extras: ConstructorParameters<typeof NodeSsrfSafeIcalFeedFetcher>[0] = {}) {
  return new NodeSsrfSafeIcalFeedFetcher({
    allowInsecureTlsForTests: true,
    lookup: async () => [{ address: PUBLIC_TEST_IP, family: 4 }],
    remapConnect: () => ({ connectHost: "127.0.0.1", connectPort: port }),
    ...extras,
  });
}

describe("NodeSsrfSafeIcalFeedFetcher (P1-S2)", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (closers.length > 0) {
      const close = closers.pop();
      await close?.();
    }
  });

  it("returns raw bytes and contentType on HTTP 200", async () => {
    const body = Buffer.from("BEGIN:VCALENDAR\nEND:VCALENDAR\n", "utf8");
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Length": String(body.byteLength),
      });
      res.end(body);
    });
    closers.push(close);

    const fetcher = fetcherForLocalPort(port);
    const result = await fetcher.fetch("https://calendar.test/feed.ics");
    expect(result.contentType).toBe("text/calendar");
    expect(Buffer.from(result.body).toString("utf8")).toBe(body.toString("utf8"));
  });

  it("accepts empty HTTP 200 body", async () => {
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/calendar", "Content-Length": "0" });
      res.end();
    });
    closers.push(close);

    const result = await fetcherForLocalPort(port).fetch("https://calendar.test/empty");
    expect(result.body.byteLength).toBe(0);
    expect(result.contentType).toBe("text/calendar");
  });

  it("accepts missing content-type and identity encoding", async () => {
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(200, { "Content-Encoding": "identity", "Content-Length": "2" });
      res.end("ok");
    });
    closers.push(close);

    const result = await fetcherForLocalPort(port).fetch("https://calendar.test/x");
    expect(result.contentType).toBeNull();
    expect(Buffer.from(result.body).toString("utf8")).toBe("ok");
  });

  it("rejects disallowed content-type", async () => {
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html", "Content-Length": "2" });
      res.end("hi");
    });
    closers.push(close);

    await expect(fetcherForLocalPort(port).fetch("https://calendar.test/x")).rejects.toMatchObject({
      code: "ICAL_FEED_CONTENT_TYPE_REJECTED",
    });
  });

  it("rejects non-identity content-encoding", async () => {
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Content-Encoding": "gzip",
        "Content-Length": "2",
      });
      res.end("hi");
    });
    closers.push(close);

    await expect(fetcherForLocalPort(port).fetch("https://calendar.test/x")).rejects.toMatchObject({
      code: "ICAL_FEED_CONTENT_ENCODING_REJECTED",
    });
  });

  it("rejects non-200 status", async () => {
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(404, { "Content-Length": "0" });
      res.end();
    });
    closers.push(close);

    await expect(fetcherForLocalPort(port).fetch("https://calendar.test/x")).rejects.toMatchObject({
      code: "ICAL_FEED_UNEXPECTED_STATUS",
      statusCode: 404,
    });
  });

  it("rejects oversized declared Content-Length before buffering", async () => {
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Content-Length": String(2 * 1024 * 1024 + 1),
      });
      res.end();
    });
    closers.push(close);

    await expect(fetcherForLocalPort(port).fetch("https://calendar.test/big")).rejects.toMatchObject({
      code: "ICAL_FEED_RESPONSE_TOO_LARGE",
    });
  }, 15_000);

  it("rejects streaming body over 2 MiB", async () => {
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      const chunk = Buffer.alloc(256 * 1024, 1);
      let writes = 0;
      const write = (): void => {
        while (writes < 16) {
          writes += 1;
          const ok = res.write(chunk);
          if (!ok) {
            res.once("drain", write);
            return;
          }
        }
        // Keep open; client should abort once over limit.
      };
      write();
    });
    closers.push(close);

    await expect(fetcherForLocalPort(port).fetch("https://calendar.test/stream")).rejects.toMatchObject({
      code: "ICAL_FEED_RESPONSE_TOO_LARGE",
    });
  });

  it("rejects Content-Length mismatch", async () => {
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain", "Content-Length": "10" });
      res.end("short");
    });
    closers.push(close);

    await expect(fetcherForLocalPort(port).fetch("https://calendar.test/mismatch")).rejects.toMatchObject({
      code: "ICAL_FEED_INCOMPLETE_RESPONSE",
    });
  });

  it("rejects DNS results that include any non-global address", async () => {
    const fetcher = new NodeSsrfSafeIcalFeedFetcher({
      lookup: async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
    });
    await expect(fetcher.fetch("https://calendar.test/x")).rejects.toMatchObject({
      code: "ICAL_FEED_SSRF_REJECTED",
    });
  });

  it("prefers IPv6 when selecting among global results", async () => {
    const seen: string[] = [];
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain", "Content-Length": "2" });
      res.end("ok");
    });
    closers.push(close);

    const fetcher = new NodeSsrfSafeIcalFeedFetcher({
      allowInsecureTlsForTests: true,
      lookup: async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "2606:4700:4700::1111", family: 6 },
      ],
      remapConnect: (ip, _port) => {
        seen.push(ip);
        return { connectHost: "127.0.0.1", connectPort: port };
      },
    });
    await fetcher.fetch("https://calendar.test/x");
    expect(seen[0]).toBe("2606:4700:4700:0:0:0:0:1111");
  });

  it("pins TCP to selected numeric IP via remap observation", async () => {
    const peers: Array<{ ip: string; port: number }> = [];
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain", "Content-Length": "1" });
      res.end("x");
    });
    closers.push(close);

    const fetcher = new NodeSsrfSafeIcalFeedFetcher({
      allowInsecureTlsForTests: true,
      lookup: async () => [{ address: PUBLIC_TEST_IP, family: 4 }],
      remapConnect: (ip, p) => {
        peers.push({ ip, port: p });
        return { connectHost: "127.0.0.1", connectPort: port };
      },
    });
    await fetcher.fetch("https://calendar.test/x");
    expect(peers).toEqual([{ ip: PUBLIC_TEST_IP, port: 443 }]);
  });

  it("follows a valid redirect with remaining deadline and revalidation", async () => {
    let hits = 0;
    const { port, close } = await listenServer((req, res) => {
      hits += 1;
      if (req.url === "/start") {
        res.writeHead(302, {
          Location: "https://calendar.test/final",
          "Content-Length": "0",
        });
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain", "Content-Length": "4" });
      res.end("done");
    });
    closers.push(close);

    const result = await fetcherForLocalPort(port).fetch("https://calendar.test/start");
    expect(Buffer.from(result.body).toString("utf8")).toBe("done");
    expect(hits).toBe(2);
  });

  it("rejects redirect to disallowed target", async () => {
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(302, { Location: "https://127.0.0.1/secret", "Content-Length": "0" });
      res.end();
    });
    closers.push(close);

    await expect(fetcherForLocalPort(port).fetch("https://calendar.test/start")).rejects.toMatchObject({
      code: "ICAL_FEED_REDIRECT_REJECTED",
    });
  });

  it("rejects https-to-http downgrade redirect", async () => {
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(302, { Location: "http://calendar.test/final", "Content-Length": "0" });
      res.end();
    });
    closers.push(close);

    await expect(fetcherForLocalPort(port).fetch("https://calendar.test/start")).rejects.toMatchObject({
      code: "ICAL_FEED_REDIRECT_REJECTED",
    });
  });

  it("rejects missing Location on redirect", async () => {
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(302, { "Content-Length": "0" });
      res.end();
    });
    closers.push(close);

    await expect(fetcherForLocalPort(port).fetch("https://calendar.test/start")).rejects.toMatchObject({
      code: "ICAL_FEED_REDIRECT_REJECTED",
    });
  });

  it("enforces redirect hop limit", async () => {
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(302, { Location: "https://calendar.test/loop", "Content-Length": "0" });
      res.end();
    });
    closers.push(close);

    await expect(fetcherForLocalPort(port).fetch("https://calendar.test/loop")).rejects.toMatchObject({
      code: "ICAL_FEED_REDIRECT_REJECTED",
    });
  });

  it("times out when budget expires before late DNS is used", async () => {
    let now = 0;
    const fetcher = new NodeSsrfSafeIcalFeedFetcher({
      now: () => now,
      lookup: async () => {
        now = 15_000; // past 10s deadline before returning
        return [{ address: PUBLIC_TEST_IP, family: 4 }];
      },
    });
    await expect(fetcher.fetch("https://calendar.test/x")).rejects.toMatchObject({
      code: "ICAL_FEED_TIMEOUT",
    });
  });

  it("discards late DNS conceptually by not connecting after timeout", async () => {
    let connected = false;
    let now = 0;
    const fetcher = new NodeSsrfSafeIcalFeedFetcher({
      now: () => now,
      lookup: async () => {
        now = 10_001;
        return [{ address: PUBLIC_TEST_IP, family: 4 }];
      },
      remapConnect: (ip, port) => {
        connected = true;
        return { connectHost: ip, connectPort: port };
      },
    });
    await expect(fetcher.fetch("https://calendar.test/x")).rejects.toBeInstanceOf(IcalFeedFetchError);
    expect(connected).toBe(false);
  });

  it("sends Accept-Encoding identity and Host hostname", async () => {
    let seenHost: string | undefined;
    let seenAcceptEncoding: string | undefined;
    const { port, close } = await listenServer((req, res) => {
      seenHost = req.headers.host;
      seenAcceptEncoding = Array.isArray(req.headers["accept-encoding"])
        ? req.headers["accept-encoding"].join(",")
        : req.headers["accept-encoding"];
      res.writeHead(200, { "Content-Type": "text/plain", "Content-Length": "2" });
      res.end("ok");
    });
    closers.push(close);

    await fetcherForLocalPort(port).fetch("https://calendar.test/headers");
    expect(seenHost).toBe("calendar.test");
    expect(seenAcceptEncoding).toBe("identity");
  });

  it("deduplicates equivalent DNS results", async () => {
    const seen: string[] = [];
    const { port, close } = await listenServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain", "Content-Length": "1" });
      res.end("x");
    });
    closers.push(close);

    const fetcher = new NodeSsrfSafeIcalFeedFetcher({
      allowInsecureTlsForTests: true,
      lookup: async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "1.1.1.1", family: 4 },
        { address: "::ffff:1.1.1.1", family: 6 },
      ],
      remapConnect: (ip) => {
        seen.push(ip);
        return { connectHost: "127.0.0.1", connectPort: port };
      },
    });
    await fetcher.fetch("https://calendar.test/x");
    expect(seen).toEqual(["1.1.1.1"]);
  });
});
