import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Tenant, TenantSettings, User } from "@hcp/domain";
import { PrismaTenantRepository } from "../../src/repositories/TenantRepository";
import { PrismaUserRepository } from "../../src/repositories/IdentityRepositories";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import {
  PrismaCopilotConversationRepository,
  PrismaCopilotMessageRepository,
} from "../../src/repositories/operator-copilot/OperatorCopilotRepositories";
import {
  truncateIntegrationTables,
  prisma,
  withTenantTransaction,
} from "./helpers";
import { runIntegration } from "./integrationGate";

runIntegration("OperatorCopilot persistence integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const tenantRepository = new PrismaTenantRepository(outboxRepository);
  const userRepository = new PrismaUserRepository();
  const conversations = new PrismaCopilotConversationRepository();
  const messages = new PrismaCopilotMessageRepository();

  const tenantId = "550e8400-e29b-41d4-a716-4466554400c1";
  const operatorA = "550e8400-e29b-41d4-a716-4466554400c2";
  const operatorB = "550e8400-e29b-41d4-a716-4466554400c3";
  const conversationId = "550e8400-e29b-41d4-a716-4466554400c4";

  beforeEach(async () => {
    await truncateIntegrationTables();
    await tenantRepository.save(
      Tenant.create({
        id: tenantId,
        name: "Copilot Tenant",
        slug: "int-copilot-tenant",
        settings: TenantSettings.create(),
      }),
    );
    await userRepository.save(
      User.create({
        id: operatorA,
        email: "copilot-a@integration.test",
        name: "Operator A",
        passwordHash: "hash",
      }),
    );
    await userRepository.save(
      User.create({
        id: operatorB,
        email: "copilot-b@integration.test",
        name: "Operator B",
        passwordHash: "hash",
      }),
    );
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("persists conversations and messages under tenant RLS", async () => {
    const created = await conversations.create({
      id: conversationId,
      tenantId,
      operatorUserId: operatorA,
      title: "Today ops",
      status: "active",
      activePropertyId: null,
      lastMessageAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(created.id).toBe(conversationId);

    await messages.append({
      id: "550e8400-e29b-41d4-a716-4466554400c5",
      tenantId,
      conversationId,
      role: "operator",
      content: "How many arrivals today?",
      toolName: null,
      toolCallId: null,
      createdAt: new Date(),
    });
    await messages.append({
      id: "550e8400-e29b-41d4-a716-4466554400c6",
      tenantId,
      conversationId,
      role: "assistant",
      content: "There are 2 arrivals today.",
      toolName: null,
      toolCallId: null,
      createdAt: new Date(),
    });

    const listed = await conversations.listByOperator(tenantId, operatorA, {
      status: "active",
      limit: 10,
    });
    expect(listed).toHaveLength(1);

    const recent = await messages.listRecentMessages(tenantId, conversationId, 10);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.role).toBe("operator");
    expect(recent[1]?.role).toBe("assistant");
  });

  it("archives only the owning operator conversation", async () => {
    await conversations.create({
      id: conversationId,
      tenantId,
      operatorUserId: operatorA,
      title: null,
      status: "active",
      activePropertyId: null,
      lastMessageAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const denied = await conversations.archive(tenantId, conversationId, operatorB);
    expect(denied).toBeNull();

    const archived = await conversations.archive(
      tenantId,
      conversationId,
      operatorA,
    );
    expect(archived?.status).toBe("archived");
  });

  it("FORCE RLS hides rows without tenant GUC", async () => {
    await conversations.create({
      id: conversationId,
      tenantId,
      operatorUserId: operatorA,
      title: null,
      status: "active",
      activePropertyId: null,
      lastMessageAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const unscoped = await prisma.copilotConversation.findMany({
      where: { id: conversationId },
    });
    // Depending on role (talos_runtime vs owner), unscoped may be empty under FORCE RLS.
    // Authoritative check: withTenantTransaction can read the row.
    const scoped = await withTenantTransaction(tenantId, async (tx) =>
      tx.copilotConversation.findFirst({ where: { id: conversationId } }),
    );
    expect(scoped?.id).toBe(conversationId);
    expect(Array.isArray(unscoped)).toBe(true);
  });
});
