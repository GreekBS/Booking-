import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { IChannelConnectionRepository } from "./IChannelConnectionRepository";

/**
 * Narrow read port for async lifecycle + connection apply gates (P1-S6c / P1-S7c).
 *
 * Background redrive paths must not enqueue inventory work for connections that
 * an operator paused, disconnected, or put into error — including while a
 * credential rotation is in flight — or while connection inventory apply is OFF.
 */
export interface ChannelConnectionRedriveGate {
  readonly status: ChannelConnectionStatus;
  readonly inventoryApplyEnabled: boolean;
}

export interface IChannelConnectionStatusFinder {
  findStatus(
    tenantId: string,
    connectionId: string,
  ): Promise<ChannelConnectionStatus | null>;

  /** P1-S7c: status + connection inventory apply fence for Sweep/ForceRedrive. */
  findRedriveGate(
    tenantId: string,
    connectionId: string,
  ): Promise<ChannelConnectionRedriveGate | null>;
}

/** Adapter over any ChannelConnection repository (production DI uses this). */
export function channelConnectionStatusFinderFromRepository(
  repository: Pick<IChannelConnectionRepository, "findById">,
): IChannelConnectionStatusFinder {
  return {
    async findStatus(tenantId, connectionId) {
      const connection = await repository.findById(tenantId, connectionId);
      return connection ? connection.status : null;
    },
    async findRedriveGate(tenantId, connectionId) {
      const connection = await repository.findById(tenantId, connectionId);
      if (!connection) return null;
      return {
        status: connection.status,
        inventoryApplyEnabled: connection.inventoryApplyEnabled === true,
      };
    },
  };
}
