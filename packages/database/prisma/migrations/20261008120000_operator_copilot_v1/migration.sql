-- Operator Copilot V1
-- Additive only: two new tables. FORCE RLS + talos_runtime grants.
-- Property ACL is enforced at the application layer (domain registry/orchestrator).
-- Does not alter or drop any existing object.

CREATE TABLE "copilot_conversations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "operator_user_id" UUID NOT NULL,
  "active_property_id" UUID,
  "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  "title" VARCHAR(255),
  "last_message_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "copilot_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "copilot_conversations_status_check"
    CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "copilot_conversations_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "copilot_conversations_operator_fkey"
    FOREIGN KEY ("operator_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "copilot_conversations_active_property_fkey"
    FOREIGN KEY ("active_property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "copilot_conversations_tenant_operator_updated_idx"
  ON "copilot_conversations"("tenant_id", "operator_user_id", "updated_at" DESC);
CREATE INDEX "copilot_conversations_tenant_status_idx"
  ON "copilot_conversations"("tenant_id", "status");

ALTER TABLE "copilot_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copilot_conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_copilot_conversations ON "copilot_conversations"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "copilot_conversations" TO talos_runtime;

CREATE TABLE "copilot_messages" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "role" VARCHAR(16) NOT NULL,
  "content" TEXT NOT NULL,
  "tool_name" VARCHAR(64),
  "tool_call_id" VARCHAR(64),
  "tool_success" BOOLEAN,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "copilot_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "copilot_messages_role_check"
    CHECK ("role" IN ('operator', 'assistant', 'tool')),
  CONSTRAINT "copilot_messages_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "copilot_messages_conversation_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "copilot_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "copilot_messages_tenant_conversation_created_idx"
  ON "copilot_messages"("tenant_id", "conversation_id", "created_at");

ALTER TABLE "copilot_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copilot_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_copilot_messages ON "copilot_messages"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "copilot_messages" TO talos_runtime;
