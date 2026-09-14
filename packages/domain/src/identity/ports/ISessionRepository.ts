export interface ISessionRepository {
  setActiveTenant(userId: string, tenantId: string): Promise<void>;
}
