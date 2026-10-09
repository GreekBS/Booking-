-- Website Builder A1 — persistence foundation
-- Additive only: three new tables + supporting unique index on properties.
-- FORCE RLS + talos_runtime grants. Property ACL remains application-layer (A2+).
-- No publish/DNS/domain-routing/upload pipelines.
-- Does not alter PMS booking/channel/Talia tables beyond additive properties unique index.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Composite FK target: (tenant_id, id) for websites / media referencing properties.
CREATE UNIQUE INDEX IF NOT EXISTS "properties_tenant_id_id_uidx"
  ON "properties"("tenant_id", "id");

-- ---------------------------------------------------------------------------
-- websites
-- ---------------------------------------------------------------------------
CREATE TABLE "websites" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
  "theme_id" VARCHAR(64) NOT NULL DEFAULT 'unset',
  "content_schema_version" INT NOT NULL DEFAULT 1,
  "draft_version_id" UUID,
  "published_version_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Prisma @updatedAt — no DB default (application sets on write).
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "websites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "websites_status_check"
    CHECK ("status" IN ('draft', 'published', 'unpublished')),
  CONSTRAINT "websites_content_schema_version_positive"
    CHECK ("content_schema_version" >= 1),
  CONSTRAINT "websites_theme_id_not_empty"
    CHECK (char_length(trim("theme_id")) > 0),
  CONSTRAINT "websites_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Prevents cross-tenant property attachment (tenant_id must match property.tenant_id).
  CONSTRAINT "websites_tenant_id_property_id_fkey"
    FOREIGN KEY ("tenant_id", "property_id")
    REFERENCES "properties"("tenant_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "websites_property_id_uidx"
  ON "websites"("property_id");
CREATE UNIQUE INDEX "websites_tenant_property_uidx"
  ON "websites"("tenant_id", "property_id");
CREATE UNIQUE INDEX "websites_tenant_id_id_uidx"
  ON "websites"("tenant_id", "id");
CREATE INDEX "websites_tenant_status_idx"
  ON "websites"("tenant_id", "status");

ALTER TABLE "websites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "websites" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_websites ON "websites"
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "websites" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- website_versions
-- ---------------------------------------------------------------------------
CREATE TABLE "website_versions" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "website_id" UUID NOT NULL,
  "version_number" INT NOT NULL,
  "locale" VARCHAR(16) NOT NULL DEFAULT 'el',
  "sections" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "seo" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "state" VARCHAR(16) NOT NULL DEFAULT 'draft',
  "published_at" TIMESTAMPTZ,
  "published_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "website_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "website_versions_state_check"
    CHECK ("state" IN ('draft', 'published', 'superseded')),
  CONSTRAINT "website_versions_version_number_positive"
    CHECK ("version_number" >= 1),
  CONSTRAINT "website_versions_locale_not_empty"
    CHECK (char_length(trim("locale")) > 0),
  CONSTRAINT "website_versions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Prevents attaching a version to a website in another tenant.
  CONSTRAINT "website_versions_tenant_id_website_id_fkey"
    FOREIGN KEY ("tenant_id", "website_id")
    REFERENCES "websites"("tenant_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "website_versions_website_version_uidx"
  ON "website_versions"("website_id", "version_number");
CREATE UNIQUE INDEX "website_versions_tenant_id_id_uidx"
  ON "website_versions"("tenant_id", "id");
CREATE UNIQUE INDEX "website_versions_tenant_website_id_uidx"
  ON "website_versions"("tenant_id", "website_id", "id");
CREATE INDEX "website_versions_tenant_website_state_idx"
  ON "website_versions"("tenant_id", "website_id", "state");

ALTER TABLE "website_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "website_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_website_versions ON "website_versions"
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "website_versions" TO talos_runtime;

-- Circular pointers: website ↔ version (nullable; set after draft row exists).
-- Clear pointers before deleting versions (ON DELETE RESTRICT — tenantId is required).
CREATE UNIQUE INDEX "websites_draft_version_id_uidx"
  ON "websites"("draft_version_id");
CREATE UNIQUE INDEX "websites_published_version_id_uidx"
  ON "websites"("published_version_id");
CREATE UNIQUE INDEX "websites_tenant_id_draft_version_uidx"
  ON "websites"("tenant_id", "id", "draft_version_id");
CREATE UNIQUE INDEX "websites_tenant_id_published_version_uidx"
  ON "websites"("tenant_id", "id", "published_version_id");

-- Pointers must match THIS website + tenant (not merely any version in the tenant).
ALTER TABLE "websites"
  ADD CONSTRAINT "websites_tenant_id_id_draft_version_id_fkey"
  FOREIGN KEY ("tenant_id", "id", "draft_version_id")
  REFERENCES "website_versions"("tenant_id", "website_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "websites"
  ADD CONSTRAINT "websites_tenant_id_id_published_version_id_fkey"
  FOREIGN KEY ("tenant_id", "id", "published_version_id")
  REFERENCES "website_versions"("tenant_id", "website_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- website_media_assets (metadata only — no storage integration in A1)
-- ---------------------------------------------------------------------------
CREATE TABLE "website_media_assets" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "website_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "storage_key" VARCHAR(512) NOT NULL,
  "content_type" VARCHAR(128) NOT NULL,
  "size_bytes" INT NOT NULL,
  "alt" VARCHAR(512),
  "width" INT,
  "height" INT,
  "sort_order" INT NOT NULL DEFAULT 0,
  "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "website_media_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "website_media_assets_status_check"
    CHECK ("status" IN ('pending', 'ready', 'archived')),
  CONSTRAINT "website_media_assets_size_bytes_non_negative"
    CHECK ("size_bytes" >= 0),
  CONSTRAINT "website_media_assets_storage_key_not_empty"
    CHECK (char_length(trim("storage_key")) > 0),
  CONSTRAINT "website_media_assets_content_type_not_empty"
    CHECK (char_length(trim("content_type")) > 0),
  CONSTRAINT "website_media_assets_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "website_media_assets_tenant_id_website_id_fkey"
    FOREIGN KEY ("tenant_id", "website_id")
    REFERENCES "websites"("tenant_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "website_media_assets_tenant_id_property_id_fkey"
    FOREIGN KEY ("tenant_id", "property_id")
    REFERENCES "properties"("tenant_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "website_media_assets_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "website_media_assets_storage_key_uidx"
  ON "website_media_assets"("storage_key");
CREATE INDEX "website_media_assets_tenant_website_idx"
  ON "website_media_assets"("tenant_id", "website_id");
CREATE INDEX "website_media_assets_tenant_property_idx"
  ON "website_media_assets"("tenant_id", "property_id");

ALTER TABLE "website_media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "website_media_assets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_website_media_assets ON "website_media_assets"
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "website_media_assets" TO talos_runtime;
