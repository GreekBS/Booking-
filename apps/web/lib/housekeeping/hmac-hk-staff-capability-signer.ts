/**
 * Server-only re-export of the HMAC capability signer.
 * Keeps node:crypto out of any Client Component import graph.
 */
import "server-only";

export { HmacHkStaffCapabilitySigner } from "@hcp/domain/hk-staff-signer";
