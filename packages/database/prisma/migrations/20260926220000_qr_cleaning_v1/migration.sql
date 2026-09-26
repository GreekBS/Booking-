-- QR Cleaning V1: unit QR, checklist templates, executions, photos.
-- Additive only. FORCE RLS + talos_runtime grants. Property ACL remains application-layer.

-- ---------------------------------------------------------------------------
-- unit_qr_access
-- ---------------------------------------------------------------------------
CREATE TABLE "unit_qr_access" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotated_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  CONSTRAINT "unit_qr_access_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "unit_qr_access_status_check" CHECK ("status" IN ('ACTIVE', 'REVOKED')),
  CONSTRAINT "unit_qr_access_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "unit_qr_access_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "unit_qr_access_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "unit_qr_access_token_hash_uidx" ON "unit_qr_access"("token_hash");
CREATE UNIQUE INDEX "unit_qr_access_one_active_per_unit_uidx"
  ON "unit_qr_access"("tenant_id", "unit_id")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "unit_qr_access_tenant_property_idx"
  ON "unit_qr_access"("tenant_id", "property_id");

ALTER TABLE "unit_qr_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "unit_qr_access" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_unit_qr_access ON "unit_qr_access"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "unit_qr_access" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- cleaning_checklist_templates
-- ---------------------------------------------------------------------------
CREATE TABLE "cleaning_checklist_templates" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "version" INT NOT NULL DEFAULT 1,
  "minimum_completion_photos" INT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "cleaning_checklist_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cleaning_checklist_templates_name_not_empty" CHECK (char_length(trim("name")) > 0),
  CONSTRAINT "cleaning_checklist_templates_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "cleaning_checklist_templates_min_photos_nonneg"
    CHECK ("minimum_completion_photos" >= 0 AND "minimum_completion_photos" <= 50),
  CONSTRAINT "cleaning_checklist_templates_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cleaning_checklist_templates_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "cleaning_checklist_templates_one_active_per_property_uidx"
  ON "cleaning_checklist_templates"("tenant_id", "property_id")
  WHERE "is_active" = TRUE;
CREATE INDEX "cleaning_checklist_templates_tenant_property_idx"
  ON "cleaning_checklist_templates"("tenant_id", "property_id");

ALTER TABLE "cleaning_checklist_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cleaning_checklist_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cleaning_checklist_templates ON "cleaning_checklist_templates"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "cleaning_checklist_templates" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- cleaning_checklist_template_items
-- ---------------------------------------------------------------------------
CREATE TABLE "cleaning_checklist_template_items" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "label" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "position" INT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT TRUE,
  "photo_required" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "cleaning_checklist_template_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cleaning_checklist_template_items_label_not_empty"
    CHECK (char_length(trim("label")) > 0),
  CONSTRAINT "cleaning_checklist_template_items_position_nonneg" CHECK ("position" >= 0),
  CONSTRAINT "cleaning_checklist_template_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cleaning_checklist_template_items_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "cleaning_checklist_templates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "cleaning_checklist_template_items_template_pos_idx"
  ON "cleaning_checklist_template_items"("template_id", "position");

ALTER TABLE "cleaning_checklist_template_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cleaning_checklist_template_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cleaning_checklist_template_items ON "cleaning_checklist_template_items"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "cleaning_checklist_template_items" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- cleaning_executions
-- ---------------------------------------------------------------------------
CREATE TABLE "cleaning_executions" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "template_id" UUID,
  "template_version" INT,
  "status" VARCHAR(16) NOT NULL DEFAULT 'IN_PROGRESS',
  "started_by_user_id" UUID NOT NULL,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_by_user_id" UUID,
  "completed_at" TIMESTAMPTZ,
  "version" INT NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "cleaning_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cleaning_executions_status_check"
    CHECK ("status" IN ('IN_PROGRESS', 'COMPLETED')),
  CONSTRAINT "cleaning_executions_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "cleaning_executions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cleaning_executions_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cleaning_executions_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cleaning_executions_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cleaning_executions_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "cleaning_checklist_templates"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cleaning_executions_started_by_user_id_fkey"
    FOREIGN KEY ("started_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cleaning_executions_completed_by_user_id_fkey"
    FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "cleaning_executions_one_active_per_task_uidx"
  ON "cleaning_executions"("tenant_id", "task_id")
  WHERE "status" = 'IN_PROGRESS';
CREATE INDEX "cleaning_executions_tenant_unit_idx"
  ON "cleaning_executions"("tenant_id", "unit_id", "started_at" DESC);
CREATE INDEX "cleaning_executions_tenant_property_idx"
  ON "cleaning_executions"("tenant_id", "property_id");

ALTER TABLE "cleaning_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cleaning_executions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cleaning_executions ON "cleaning_executions"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "cleaning_executions" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- cleaning_execution_items (immutable snapshot labels)
-- ---------------------------------------------------------------------------
CREATE TABLE "cleaning_execution_items" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "execution_id" UUID NOT NULL,
  "source_template_item_id" UUID,
  "label_snapshot" VARCHAR(255) NOT NULL,
  "description_snapshot" TEXT,
  "position" INT NOT NULL,
  "required" BOOLEAN NOT NULL,
  "photo_required" BOOLEAN NOT NULL,
  "checked" BOOLEAN NOT NULL DEFAULT FALSE,
  "checked_at" TIMESTAMPTZ,
  "checked_by_user_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "cleaning_execution_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cleaning_execution_items_label_not_empty"
    CHECK (char_length(trim("label_snapshot")) > 0),
  CONSTRAINT "cleaning_execution_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cleaning_execution_items_execution_id_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "cleaning_executions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cleaning_execution_items_checked_by_user_id_fkey"
    FOREIGN KEY ("checked_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "cleaning_execution_items_execution_pos_idx"
  ON "cleaning_execution_items"("execution_id", "position");

ALTER TABLE "cleaning_execution_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cleaning_execution_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cleaning_execution_items ON "cleaning_execution_items"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "cleaning_execution_items" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- cleaning_photos
-- ---------------------------------------------------------------------------
CREATE TABLE "cleaning_photos" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "execution_id" UUID NOT NULL,
  "execution_item_id" UUID,
  "storage_key" VARCHAR(512) NOT NULL,
  "content_type" VARCHAR(128) NOT NULL,
  "size_bytes" INT NOT NULL,
  "uploaded_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cleaning_photos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cleaning_photos_size_positive" CHECK ("size_bytes" > 0 AND "size_bytes" <= 15728640),
  CONSTRAINT "cleaning_photos_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cleaning_photos_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cleaning_photos_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cleaning_photos_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cleaning_photos_execution_id_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "cleaning_executions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cleaning_photos_execution_item_id_fkey"
    FOREIGN KEY ("execution_item_id") REFERENCES "cleaning_execution_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cleaning_photos_uploaded_by_user_id_fkey"
    FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "cleaning_photos_storage_key_uidx" ON "cleaning_photos"("storage_key");
CREATE INDEX "cleaning_photos_execution_idx" ON "cleaning_photos"("execution_id");
CREATE INDEX "cleaning_photos_tenant_property_idx"
  ON "cleaning_photos"("tenant_id", "property_id");

ALTER TABLE "cleaning_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cleaning_photos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cleaning_photos ON "cleaning_photos"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "cleaning_photos" TO talos_runtime;
