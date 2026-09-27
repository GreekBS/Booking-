/**
 * Operator-facing labels for channel / admin enums.
 * Stored values are never renamed — presentation only.
 */

import {
  elChannelProvider,
  elChannelStatus,
  elMemberRole,
} from "@/lib/i18n";

export function channelStatusLabel(status: string): string {
  return elChannelStatus[status] ?? status.replace(/_/g, " ");
}

export function channelProviderLabel(provider: string): string {
  return elChannelProvider[provider] ?? provider.replace(/_/g, " ");
}

export function memberRoleLabel(role: string): string {
  return elMemberRole[role] ?? role.replace(/_/g, " ");
}
