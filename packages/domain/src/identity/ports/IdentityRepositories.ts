import type { User } from "../domain/User";
import type { Membership } from "../domain/Membership";
import type { Invitation } from "../domain/Invitation";

export interface IUserRepository {
  save(user: User): Promise<void>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
}

export interface IMembershipRepository {
  save(membership: Membership): Promise<void>;
  findById(id: string): Promise<Membership | null>;
  findByUserAndTenant(userId: string, tenantId: string): Promise<Membership | null>;
  findByTenant(tenantId: string): Promise<Membership[]>;
  findByUser(userId: string): Promise<Membership[]>;
}

export interface IInvitationRepository {
  save(invitation: Invitation): Promise<void>;
  findById(id: string, tenantId: string): Promise<Invitation | null>;
  findByTokenHash(tokenHash: string): Promise<Invitation | null>;
  findPendingByEmailAndTenant(email: string, tenantId: string): Promise<Invitation | null>;
  findPendingByTenant(tenantId: string): Promise<Invitation[]>;
}
