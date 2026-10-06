import { cookies } from "next/headers";
import {
  HK_STAFF_COOKIE_NAME,
  type HkStaffCapabilityClaims,
  type IHkStaffCapabilitySigner,
} from "@hcp/domain";

export { HK_STAFF_COOKIE_NAME };

export function hkStaffCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function readHkStaffClaims(
  signer: IHkStaffCapabilitySigner,
): Promise<HkStaffCapabilityClaims | null> {
  const jar = await cookies();
  const raw = jar.get(HK_STAFF_COOKIE_NAME)?.value;
  if (!raw) return null;
  return signer.verify(raw);
}
