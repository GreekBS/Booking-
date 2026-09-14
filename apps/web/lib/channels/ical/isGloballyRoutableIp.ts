/**
 * Provider-1 P1-S2 — allow-global / reject-else IP classification.
 *
 * Sources (special-purpose registries / addressing architecture; not copied verbatim):
 * - IANA IPv4 Special-Purpose Address Registry (RFC 6890 and updates)
 * - IANA IPv6 Special-Purpose Address Registry
 * - RFC 4291 / RFC 6890 IPv6 addressing
 *
 * Policy: an address is accepted only when demonstrably globally routable unicast.
 * Unknown, malformed, or special-use → reject (fail closed).
 *
 * Within 192.0.0.0/24 and 2001::/23, only explicitly globally-reachable assignments
 * are allowed; sibling special-use space is rejected (precise, not parent-blind).
 */

export type IpFamily = 4 | 6;

export interface ClassifiedIp {
  /** Canonical presentation form used for connect (IPv4 dotted / IPv6 without zone). */
  address: string;
  family: IpFamily;
}

type V4Cidr = { base: number; prefix: number };
type V6Cidr = { base: bigint; prefix: number };

function parseIpv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }
    // Reject non-canonical forms like 01.2.3.4 (leading zeros) except bare "0".
    if (part.length > 1 && part.startsWith("0")) {
      return null;
    }
    value = ((value << 8) | octet) >>> 0;
  }
  return value;
}

function ipv4InCidr(addr: number, cidr: V4Cidr): boolean {
  if (cidr.prefix === 0) {
    return true;
  }
  const mask = cidr.prefix === 32 ? 0xffffffff : (~0 << (32 - cidr.prefix)) >>> 0;
  return (addr & mask) === (cidr.base & mask);
}

function expandIpv6(ip: string): string | null {
  const zoneIndex = ip.indexOf("%");
  if (zoneIndex >= 0) {
    return null; // zone identifiers unsupported
  }
  const lower = ip.toLowerCase();
  if (lower.includes(":::") || (lower.match(/::/g) ?? []).length > 1) {
    return null;
  }

  // Handle dotted-quad IPv4 tail (e.g. ::ffff:192.0.2.1).
  let working = lower;
  const lastColon = working.lastIndexOf(":");
  if (lastColon >= 0) {
    const tail = working.slice(lastColon + 1);
    if (tail.includes(".")) {
      const v4 = parseIpv4ToInt(tail);
      if (v4 === null) {
        return null;
      }
      const hi = ((v4 >>> 16) & 0xffff).toString(16);
      const lo = (v4 & 0xffff).toString(16);
      working = `${working.slice(0, lastColon)}:${hi}:${lo}`;
    }
  }

  let head: string;
  let tail: string;
  if (working.includes("::")) {
    const [h, t] = working.split("::");
    head = h ?? "";
    tail = t ?? "";
  } else {
    head = working;
    tail = "";
  }

  const headParts = head === "" ? [] : head.split(":");
  const tailParts = tail === "" ? [] : tail.split(":");
  if (headParts.some((p) => p.length > 4) || tailParts.some((p) => p.length > 4)) {
    return null;
  }
  if ([...headParts, ...tailParts].some((p) => p !== "" && !/^[0-9a-f]+$/.test(p))) {
    return null;
  }

  const missing = 8 - (headParts.length + tailParts.length);
  if (!working.includes("::")) {
    if (missing !== 0) {
      return null;
    }
  } else if (missing <= 0) {
    return null;
  }

  const parts = [
    ...headParts,
    ...Array.from({ length: Math.max(missing, 0) }, () => "0"),
    ...tailParts,
  ];
  if (parts.length !== 8) {
    return null;
  }
  return parts.map((p) => p.padStart(4, "0")).join(":");
}

function parseIpv6ToBigInt(ip: string): bigint | null {
  const expanded = expandIpv6(ip);
  if (!expanded) {
    return null;
  }
  let value = 0n;
  for (const group of expanded.split(":")) {
    value = (value << 16n) | BigInt(Number.parseInt(group, 16));
  }
  return value;
}

function ipv6InCidr(addr: bigint, cidr: V6Cidr): boolean {
  if (cidr.prefix === 0) {
    return true;
  }
  const shift = 128n - BigInt(cidr.prefix);
  return addr >> shift === cidr.base >> shift;
}

function v4Cidr(base: string, prefix: number): V4Cidr {
  const n = parseIpv4ToInt(base);
  if (n === null) {
    throw new Error(`Invalid IPv4 CIDR base: ${base}`);
  }
  return { base: n, prefix };
}

function v6Cidr(base: string, prefix: number): V6Cidr {
  const n = parseIpv6ToBigInt(base);
  if (n === null) {
    throw new Error(`Invalid IPv6 CIDR base: ${base}`);
  }
  return { base: n, prefix };
}

/** IPv4 special-purpose / non-global ranges (IANA / RFC 6890). */
const IPV4_REJECT_CIDRS: readonly V4Cidr[] = [
  v4Cidr("0.0.0.0", 8), // "This network"
  v4Cidr("10.0.0.0", 8), // private
  v4Cidr("100.64.0.0", 10), // shared/CGNAT
  v4Cidr("127.0.0.0", 8), // loopback
  v4Cidr("169.254.0.0", 16), // link-local / metadata
  v4Cidr("172.16.0.0", 12), // private
  v4Cidr("192.0.0.0", 24), // IETF protocol assignments (exceptions below)
  v4Cidr("192.0.2.0", 24), // TEST-NET-1 documentation
  v4Cidr("192.88.99.0", 24), // 6to4 relay anycast (deprecated special-use)
  v4Cidr("192.168.0.0", 16), // private
  v4Cidr("198.18.0.0", 15), // benchmarking
  v4Cidr("198.51.100.0", 24), // TEST-NET-2 documentation
  v4Cidr("203.0.113.0", 24), // TEST-NET-3 documentation
  v4Cidr("224.0.0.0", 4), // multicast
  v4Cidr("240.0.0.0", 4), // reserved
];

/** Globally reachable exceptions inside otherwise non-global 192.0.0.0/24 (IANA). */
const IPV4_GLOBAL_EXCEPTIONS = new Set<number>([
  parseIpv4ToInt("192.0.0.9")!, // Port Control Protocol Anycast
  parseIpv4ToInt("192.0.0.10")!, // NAT Traversal Anycast
]);

/**
 * IPv6 non-global / special-purpose rejects.
 * 2001::/23 handled separately with a small global allowlist (fail closed).
 */
const IPV6_REJECT_CIDRS: readonly V6Cidr[] = [
  v6Cidr("::", 128), // unspecified
  v6Cidr("::1", 128), // loopback
  v6Cidr("64:ff9b::", 96), // NAT64 WKP
  v6Cidr("64:ff9b:1::", 48), // NAT64 local use
  v6Cidr("100::", 64), // discard-only
  v6Cidr("2001:db8::", 32), // documentation (outside 2001::/23)
  v6Cidr("2002::", 16), // 6to4
  v6Cidr("fc00::", 7), // ULA
  v6Cidr("fe80::", 10), // link-local
  v6Cidr("ff00::", 8), // multicast
];

const IPV6_MAPPED_PREFIX = v6Cidr("::ffff:0:0", 96);
const IPV6_GLOBAL_UNICAST = v6Cidr("2000::", 3);
const IPV6_IETF_PROTOCOL = v6Cidr("2001::", 23);

/** Globally reachable assignments inside 2001::/23 (IANA); all other 2001::/23 rejected. */
const IPV6_GLOBAL_IN_2001: readonly V6Cidr[] = [
  v6Cidr("2001:1::1", 128), // PCP Anycast
  v6Cidr("2001:1::2", 128), // PCP Anycast
  v6Cidr("2001:3::", 32), // AMT
  v6Cidr("2001:4:112::", 48), // AS112-v6
  v6Cidr("2001:30::", 32), // Drone Remote ID Protocol
];

function isIpv4GloballyRoutable(addr: number): boolean {
  if (IPV4_GLOBAL_EXCEPTIONS.has(addr)) {
    return true;
  }
  for (const cidr of IPV4_REJECT_CIDRS) {
    if (ipv4InCidr(addr, cidr)) {
      return false;
    }
  }
  // Limited broadcast
  if (addr === 0xffffffff) {
    return false;
  }
  return true;
}

function isIpv6GloballyRoutable(addr: bigint): boolean {
  // IPv4-mapped → classify embedded IPv4.
  if (ipv6InCidr(addr, IPV6_MAPPED_PREFIX)) {
    const v4 = Number(addr & 0xffffffffn);
    return isIpv4GloballyRoutable(v4);
  }

  for (const cidr of IPV6_REJECT_CIDRS) {
    if (ipv6InCidr(addr, cidr)) {
      return false;
    }
  }

  // Must be global unicast 2000::/3.
  if (!ipv6InCidr(addr, IPV6_GLOBAL_UNICAST)) {
    return false;
  }

  // 2001::/23: allow only explicit globally-reachable assignments.
  if (ipv6InCidr(addr, IPV6_IETF_PROTOCOL)) {
    return IPV6_GLOBAL_IN_2001.some((cidr) => ipv6InCidr(addr, cidr));
  }

  return true;
}

function formatIpv4(addr: number): string {
  return [
    (addr >>> 24) & 0xff,
    (addr >>> 16) & 0xff,
    (addr >>> 8) & 0xff,
    addr & 0xff,
  ].join(".");
}

function formatIpv6(addr: bigint): string {
  const groups: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const shift = BigInt(112 - i * 16);
    const group = Number((addr >> shift) & 0xffffn);
    groups.push(group.toString(16));
  }
  return groups.join(":");
}

/**
 * Classify a single IP literal.
 * Returns canonical form when globally routable; otherwise null (reject).
 */
export function classifyGloballyRoutableIp(raw: string): ClassifiedIp | null {
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }
  const trimmed = raw.trim();

  // Zone id never allowed.
  if (trimmed.includes("%")) {
    return null;
  }

  const v4 = parseIpv4ToInt(trimmed);
  if (v4 !== null) {
    if (!isIpv4GloballyRoutable(v4)) {
      return null;
    }
    return { address: formatIpv4(v4), family: 4 };
  }

  const v6 = parseIpv6ToBigInt(trimmed);
  if (v6 === null) {
    return null;
  }

  // Mapped addresses: surface as IPv4 for connect when global.
  if (ipv6InCidr(v6, IPV6_MAPPED_PREFIX)) {
    const embedded = Number(v6 & 0xffffffffn);
    if (!isIpv4GloballyRoutable(embedded)) {
      return null;
    }
    return { address: formatIpv4(embedded), family: 4 };
  }

  if (!isIpv6GloballyRoutable(v6)) {
    return null;
  }
  return { address: formatIpv6(v6), family: 6 };
}

/** True iff the address is demonstrably globally routable unicast. */
export function isGloballyRoutableIp(raw: string): boolean {
  return classifyGloballyRoutableIp(raw) !== null;
}
