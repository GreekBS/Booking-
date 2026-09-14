import { describe, expect, it } from "vitest";
import {
  classifyGloballyRoutableIp,
  isGloballyRoutableIp,
} from "@/lib/channels/ical/isGloballyRoutableIp";

describe("isGloballyRoutableIp (P1-S2)", () => {
  it("accepts globally routable IPv4", () => {
    expect(isGloballyRoutableIp("8.8.8.8")).toBe(true);
    expect(isGloballyRoutableIp("1.1.1.1")).toBe(true);
    // Adjacent to documentation 203.0.113.0/24
    expect(isGloballyRoutableIp("203.0.112.255")).toBe(true);
    expect(isGloballyRoutableIp("203.0.114.0")).toBe(true);
  });

  it("rejects this-network 0.0.0.0/8 including boundaries", () => {
    expect(isGloballyRoutableIp("0.0.0.0")).toBe(false);
    expect(isGloballyRoutableIp("0.255.255.255")).toBe(false);
    expect(isGloballyRoutableIp("1.0.0.0")).toBe(true);
  });

  it("rejects private ranges and boundaries", () => {
    expect(isGloballyRoutableIp("10.0.0.0")).toBe(false);
    expect(isGloballyRoutableIp("10.255.255.255")).toBe(false);
    expect(isGloballyRoutableIp("9.255.255.255")).toBe(true);
    expect(isGloballyRoutableIp("11.0.0.0")).toBe(true);

    expect(isGloballyRoutableIp("172.16.0.0")).toBe(false);
    expect(isGloballyRoutableIp("172.31.255.255")).toBe(false);
    expect(isGloballyRoutableIp("172.15.255.255")).toBe(true);
    expect(isGloballyRoutableIp("172.32.0.0")).toBe(true);

    expect(isGloballyRoutableIp("192.168.0.0")).toBe(false);
    expect(isGloballyRoutableIp("192.168.255.255")).toBe(false);
    expect(isGloballyRoutableIp("192.167.255.255")).toBe(true);
    expect(isGloballyRoutableIp("192.169.0.0")).toBe(true);
  });

  it("rejects CGNAT 100.64/10 boundaries", () => {
    expect(isGloballyRoutableIp("100.64.0.0")).toBe(false);
    expect(isGloballyRoutableIp("100.127.255.255")).toBe(false);
    expect(isGloballyRoutableIp("100.63.255.255")).toBe(true);
    expect(isGloballyRoutableIp("100.128.0.0")).toBe(true);
  });

  it("rejects loopback 127/8", () => {
    expect(isGloballyRoutableIp("127.0.0.1")).toBe(false);
    expect(isGloballyRoutableIp("127.255.255.255")).toBe(false);
    expect(isGloballyRoutableIp("126.255.255.255")).toBe(true);
    expect(isGloballyRoutableIp("128.0.0.0")).toBe(true);
  });

  it("rejects link-local 169.254/16", () => {
    expect(isGloballyRoutableIp("169.254.0.0")).toBe(false);
    expect(isGloballyRoutableIp("169.254.169.254")).toBe(false);
    expect(isGloballyRoutableIp("169.254.255.255")).toBe(false);
    expect(isGloballyRoutableIp("169.253.255.255")).toBe(true);
    expect(isGloballyRoutableIp("169.255.0.0")).toBe(true);
  });

  it("rejects protocol-assignment 192.0.0.0/24 except global anycast exceptions", () => {
    expect(isGloballyRoutableIp("192.0.0.0")).toBe(false);
    expect(isGloballyRoutableIp("192.0.0.1")).toBe(false);
    expect(isGloballyRoutableIp("192.0.0.170")).toBe(false);
    expect(isGloballyRoutableIp("192.0.0.9")).toBe(true);
    expect(isGloballyRoutableIp("192.0.0.10")).toBe(true);
    expect(isGloballyRoutableIp("192.0.0.255")).toBe(false);
    expect(isGloballyRoutableIp("192.0.1.0")).toBe(true);
  });

  it("rejects documentation and benchmarking ranges", () => {
    expect(isGloballyRoutableIp("192.0.2.0")).toBe(false);
    expect(isGloballyRoutableIp("192.0.2.255")).toBe(false);
    expect(isGloballyRoutableIp("198.51.100.0")).toBe(false);
    expect(isGloballyRoutableIp("203.0.113.0")).toBe(false);
    expect(isGloballyRoutableIp("203.0.113.255")).toBe(false);
    expect(isGloballyRoutableIp("198.18.0.0")).toBe(false);
    expect(isGloballyRoutableIp("198.19.255.255")).toBe(false);
    expect(isGloballyRoutableIp("198.17.255.255")).toBe(true);
    expect(isGloballyRoutableIp("198.20.0.0")).toBe(true);
  });

  it("rejects multicast, reserved, and broadcast", () => {
    expect(isGloballyRoutableIp("224.0.0.1")).toBe(false);
    expect(isGloballyRoutableIp("239.255.255.255")).toBe(false);
    expect(isGloballyRoutableIp("240.0.0.0")).toBe(false);
    expect(isGloballyRoutableIp("255.255.255.254")).toBe(false);
    expect(isGloballyRoutableIp("255.255.255.255")).toBe(false);
    expect(isGloballyRoutableIp("223.255.255.255")).toBe(true);
  });

  it("rejects non-canonical IPv4 and malformed input", () => {
    expect(isGloballyRoutableIp("08.8.8.8")).toBe(false);
    expect(isGloballyRoutableIp("8.8.8")).toBe(false);
    expect(isGloballyRoutableIp("not-an-ip")).toBe(false);
    expect(isGloballyRoutableIp("")).toBe(false);
  });

  it("accepts globally routable IPv6 and rejects specials", () => {
    expect(isGloballyRoutableIp("2001:4860:4860::8888")).toBe(true);
    expect(isGloballyRoutableIp("2606:4700:4700::1111")).toBe(true);

    expect(isGloballyRoutableIp("::")).toBe(false);
    expect(isGloballyRoutableIp("::1")).toBe(false);
    expect(isGloballyRoutableIp("100::")).toBe(false);
    expect(isGloballyRoutableIp("100::1")).toBe(false);
    expect(isGloballyRoutableIp("2001:db8::1")).toBe(false);
    expect(isGloballyRoutableIp("2001:db8:ffff:ffff:ffff:ffff:ffff:ffff")).toBe(false);
    expect(isGloballyRoutableIp("2002::1")).toBe(false);
    expect(isGloballyRoutableIp("fc00::1")).toBe(false);
    expect(isGloballyRoutableIp("fd12:3456:789a::1")).toBe(false);
    expect(isGloballyRoutableIp("fe80::1")).toBe(false);
    expect(isGloballyRoutableIp("ff02::1")).toBe(false);
    expect(isGloballyRoutableIp("64:ff9b::1")).toBe(false);
  });

  it("handles 2001::/23 allowlist precisely", () => {
    expect(isGloballyRoutableIp("2001:1::1")).toBe(true);
    expect(isGloballyRoutableIp("2001:1::2")).toBe(true);
    expect(isGloballyRoutableIp("2001:1::3")).toBe(false);
    expect(isGloballyRoutableIp("2001:3::1")).toBe(true);
    expect(isGloballyRoutableIp("2001:4:112::1")).toBe(true);
    expect(isGloballyRoutableIp("2001:30::1")).toBe(true);
    expect(isGloballyRoutableIp("2001:0::1")).toBe(false); // TEREDO space
  });

  it("unwraps IPv4-mapped IPv6 and classifies underlying IPv4", () => {
    expect(isGloballyRoutableIp("::ffff:8.8.8.8")).toBe(true);
    expect(classifyGloballyRoutableIp("::ffff:8.8.8.8")).toEqual({
      address: "8.8.8.8",
      family: 4,
    });
    expect(isGloballyRoutableIp("::ffff:127.0.0.1")).toBe(false);
    expect(isGloballyRoutableIp("::ffff:169.254.169.254")).toBe(false);
  });

  it("rejects zone identifiers and malformed IPv6", () => {
    expect(isGloballyRoutableIp("fe80::1%eth0")).toBe(false);
    expect(isGloballyRoutableIp("2001:db8:::1")).toBe(false);
    expect(isGloballyRoutableIp("gggg::1")).toBe(false);
  });
});
