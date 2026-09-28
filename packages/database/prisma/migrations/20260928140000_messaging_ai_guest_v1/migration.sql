-- Messaging + AI Guest Receptionist V1
-- Additive. FORCE RLS + talos_runtime grants. Property ACL is application-layer.
-- Does not touch Units / RatePlans / Channel mappings / calendar / ARI.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums as CHECK constraints (Prisma enums below)
-- ---------------------------------------------------------------------------

CREATE TABLE "property_assistant_profiles" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "mode" VARCHAR(16) NOT NULL DEFAULT 'off',
  "tone" VARCHAR(32) NOT NULL DEFAULT 'warm',
  "formality" VARCHAR(16) NOT NULL DEFAULT 'neutral',
  "emoji_policy" VARCHAR(16) NOT NULL DEFAULT 'sparing',
  "use_guest_first_name" BOOLEAN NOT NULL DEFAULT true,
  "reply_length" VARCHAR(16) NOT NULL DEFAULT 'medium',
  "sign_off" VARCHAR(120),
  "prefer_guest_language" BOOLEAN NOT NULL DEFAULT true,
  "default_locale" VARCHAR(16) NOT NULL DEFAULT 'el',
  "custom_voice_notes" VARCHAR(500),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_assistant_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_assistant_profiles_mode_check"
    CHECK ("mode" IN ('off', 'copilot', 'autopilot')),
  CONSTRAINT "property_assistant_profiles_tone_check"
    CHECK ("tone" IN ('warm', 'professional', 'friendly', 'luxury', 'concise')),
  CONSTRAINT "property_assistant_profiles_formality_check"
    CHECK ("formality" IN ('informal', 'neutral', 'formal')),
  CONSTRAINT "property_assistant_profiles_emoji_check"
    CHECK ("emoji_policy" IN ('none', 'sparing', 'allowed')),
  CONSTRAINT "property_assistant_profiles_reply_length_check"
    CHECK ("reply_length" IN ('short', 'medium')),
  CONSTRAINT "property_assistant_profiles_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "property_assistant_profiles_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "property_assistant_profiles_property_uidx"
  ON "property_assistant_profiles"("property_id");
CREATE INDEX "property_assistant_profiles_tenant_idx"
  ON "property_assistant_profiles"("tenant_id");

ALTER TABLE "property_assistant_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "property_assistant_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_property_assistant_profiles ON "property_assistant_profiles"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "property_assistant_profiles" TO talos_runtime;

CREATE TABLE "property_guest_knowledge" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "guest_facing_summary" TEXT,
  "early_check_in_policy" TEXT,
  "late_checkout_policy" TEXT,
  "directions" TEXT,
  "parking_info" TEXT,
  "access_instructions" TEXT,
  "wifi_ssid" VARCHAR(255),
  "wifi_password" VARCHAR(255),
  "pool_info" TEXT,
  "hvac_instructions" TEXT,
  "appliance_notes" TEXT,
  "amenity_notes" TEXT,
  "house_rules" TEXT,
  "smoking_policy" TEXT,
  "pets_policy" TEXT,
  "quiet_hours" TEXT,
  "transport_info" TEXT,
  "taxi_info" TEXT,
  "beaches" TEXT,
  "restaurants" TEXT,
  "supermarkets" TEXT,
  "recommendations" TEXT,
  "guest_facing_phone" VARCHAR(64),
  "guest_facing_email" VARCHAR(255),
  "emergency_contact" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_guest_knowledge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_guest_knowledge_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "property_guest_knowledge_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "property_guest_knowledge_property_uidx"
  ON "property_guest_knowledge"("property_id");
CREATE INDEX "property_guest_knowledge_tenant_idx"
  ON "property_guest_knowledge"("tenant_id");

ALTER TABLE "property_guest_knowledge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "property_guest_knowledge" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_property_guest_knowledge ON "property_guest_knowledge"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "property_guest_knowledge" TO talos_runtime;

CREATE TABLE "property_faq_items" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "question" VARCHAR(500) NOT NULL,
  "answer" TEXT NOT NULL,
  "sort_order" INT NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_faq_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_faq_items_question_not_empty" CHECK (char_length(trim("question")) > 0),
  CONSTRAINT "property_faq_items_answer_not_empty" CHECK (char_length(trim("answer")) > 0),
  CONSTRAINT "property_faq_items_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "property_faq_items_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "property_faq_items_tenant_property_idx"
  ON "property_faq_items"("tenant_id", "property_id", "sort_order");

ALTER TABLE "property_faq_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "property_faq_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_property_faq_items ON "property_faq_items"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "property_faq_items" TO talos_runtime;

CREATE TABLE "conversations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "guest_id" UUID,
  "booking_id" UUID,
  "channel" VARCHAR(32) NOT NULL DEFAULT 'talos_direct',
  "external_thread_id" VARCHAR(255),
  "status" VARCHAR(32) NOT NULL DEFAULT 'open',
  "subject" VARCHAR(255),
  "last_message_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversations_channel_check"
    CHECK ("channel" IN ('talos_direct', 'whatsapp', 'email', 'booking_com', 'airbnb', 'expedia', 'other')),
  CONSTRAINT "conversations_status_check"
    CHECK ("status" IN ('open', 'waiting_guest', 'waiting_operator', 'resolved', 'archived')),
  CONSTRAINT "conversations_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversations_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "conversations_guest_fkey"
    FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "conversations_booking_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "conversations_tenant_property_last_msg_idx"
  ON "conversations"("tenant_id", "property_id", "last_message_at" DESC NULLS LAST);
CREATE INDEX "conversations_tenant_status_idx"
  ON "conversations"("tenant_id", "status");
CREATE UNIQUE INDEX "conversations_external_thread_uidx"
  ON "conversations"("tenant_id", "channel", "external_thread_id")
  WHERE "external_thread_id" IS NOT NULL;

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_conversations ON "conversations"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "conversations" TO talos_runtime;

CREATE TABLE "messages" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "direction" VARCHAR(16) NOT NULL,
  "sender_type" VARCHAR(16) NOT NULL,
  "body" TEXT NOT NULL,
  "delivery_status" VARCHAR(16) NOT NULL DEFAULT 'local_only',
  "external_message_id" VARCHAR(255),
  "created_by_user_id" UUID,
  "ai_suggestion_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_body_not_empty" CHECK (char_length(trim("body")) > 0),
  CONSTRAINT "messages_direction_check" CHECK ("direction" IN ('inbound', 'outbound')),
  CONSTRAINT "messages_sender_type_check"
    CHECK ("sender_type" IN ('guest', 'operator', 'assistant', 'system')),
  CONSTRAINT "messages_delivery_status_check"
    CHECK ("delivery_status" IN ('pending', 'sent', 'delivered', 'failed', 'local_only')),
  CONSTRAINT "messages_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "messages_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "messages_conversation_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "messages_created_by_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "messages_conversation_created_idx"
  ON "messages"("conversation_id", "created_at");
CREATE INDEX "messages_tenant_property_idx"
  ON "messages"("tenant_id", "property_id");

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_messages ON "messages"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "messages" TO talos_runtime;

CREATE TABLE "ai_suggestions" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "source_message_id" UUID,
  "provider" VARCHAR(32) NOT NULL,
  "model" VARCHAR(64) NOT NULL,
  "classification" VARCHAR(32) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ready',
  "suggested_body" TEXT,
  "escalation_reason" TEXT,
  "escalation_summary" TEXT,
  "knowledge_source_ids" TEXT[] NOT NULL DEFAULT '{}',
  "safety_flags" TEXT[] NOT NULL DEFAULT '{}',
  "guest_language" VARCHAR(16),
  "context_fingerprint" VARCHAR(128),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_suggestions_classification_check"
    CHECK ("classification" IN ('ANSWERABLE', 'UNKNOWN', 'REQUIRES_OWNER_DECISION', 'BLOCKED')),
  CONSTRAINT "ai_suggestions_status_check"
    CHECK ("status" IN ('pending', 'ready', 'accepted', 'edited', 'rejected', 'failed', 'auto_sent')),
  CONSTRAINT "ai_suggestions_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_suggestions_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ai_suggestions_conversation_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_suggestions_source_message_fkey"
    FOREIGN KEY ("source_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ai_suggestions_conversation_idx"
  ON "ai_suggestions"("conversation_id", "created_at" DESC);
CREATE INDEX "ai_suggestions_tenant_property_idx"
  ON "ai_suggestions"("tenant_id", "property_id");

ALTER TABLE "ai_suggestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_suggestions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_ai_suggestions ON "ai_suggestions"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_suggestions" TO talos_runtime;

-- Optional back-reference from messages.ai_suggestion_id (added after ai_suggestions exists)
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_ai_suggestion_fkey"
  FOREIGN KEY ("ai_suggestion_id") REFERENCES "ai_suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "owner_escalations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "trigger_message_id" UUID NOT NULL,
  "booking_id" UUID,
  "guest_id" UUID,
  "classification" VARCHAR(32) NOT NULL,
  "reason" TEXT,
  "summary_for_owner" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'open',
  "owner_raw_reply" TEXT,
  "answered_by_user_id" UUID,
  "answered_at" TIMESTAMPTZ,
  "resulting_suggestion_id" UUID,
  "resulting_message_id" UUID,
  "save_to_knowledge_offered" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "owner_escalations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "owner_escalations_classification_check"
    CHECK ("classification" IN ('UNKNOWN', 'REQUIRES_OWNER_DECISION', 'BLOCKED')),
  CONSTRAINT "owner_escalations_status_check"
    CHECK ("status" IN ('open', 'answered', 'dismissed', 'expired')),
  CONSTRAINT "owner_escalations_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "owner_escalations_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "owner_escalations_conversation_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "owner_escalations_trigger_message_fkey"
    FOREIGN KEY ("trigger_message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "owner_escalations_booking_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "owner_escalations_guest_fkey"
    FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "owner_escalations_answered_by_fkey"
    FOREIGN KEY ("answered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "owner_escalations_suggestion_fkey"
    FOREIGN KEY ("resulting_suggestion_id") REFERENCES "ai_suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "owner_escalations_message_fkey"
    FOREIGN KEY ("resulting_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "owner_escalations_trigger_message_uidx"
  ON "owner_escalations"("trigger_message_id");
CREATE INDEX "owner_escalations_tenant_property_status_idx"
  ON "owner_escalations"("tenant_id", "property_id", "status");
CREATE INDEX "owner_escalations_conversation_idx"
  ON "owner_escalations"("conversation_id", "created_at" DESC);

ALTER TABLE "owner_escalations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "owner_escalations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_owner_escalations ON "owner_escalations"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "owner_escalations" TO talos_runtime;

CREATE TABLE "ai_usage_records" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID,
  "conversation_id" UUID,
  "provider" VARCHAR(32) NOT NULL,
  "model" VARCHAR(64) NOT NULL,
  "operation" VARCHAR(32) NOT NULL,
  "classification" VARCHAR(32),
  "auto_answered" BOOLEAN NOT NULL DEFAULT false,
  "escalated" BOOLEAN NOT NULL DEFAULT false,
  "input_tokens" INT,
  "output_tokens" INT,
  "latency_ms" INT,
  "success" BOOLEAN NOT NULL,
  "error_code" VARCHAR(64),
  "estimated_cost_minor" INT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_usage_records_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_usage_records_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ai_usage_records_conversation_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ai_usage_records_tenant_created_idx"
  ON "ai_usage_records"("tenant_id", "created_at" DESC);
CREATE INDEX "ai_usage_records_tenant_property_idx"
  ON "ai_usage_records"("tenant_id", "property_id", "created_at" DESC);

ALTER TABLE "ai_usage_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_usage_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_ai_usage_records ON "ai_usage_records"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_usage_records" TO talos_runtime;
