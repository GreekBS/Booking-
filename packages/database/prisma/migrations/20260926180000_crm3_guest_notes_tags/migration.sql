-- CRM-3: Guest Notes + Tags (additive). Tenant RLS only; Manager property ACL in application layer.

CREATE TABLE "guest_notes" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "guest_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "property_id" UUID,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guest_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "guest_notes_body_not_empty" CHECK (char_length(trim("body")) > 0)
);

CREATE INDEX "guest_notes_tenant_id_guest_id_created_at_idx"
  ON "guest_notes"("tenant_id", "guest_id", "created_at" DESC);
CREATE INDEX "guest_notes_tenant_id_property_id_idx"
  ON "guest_notes"("tenant_id", "property_id");

ALTER TABLE "guest_notes"
  ADD CONSTRAINT "guest_notes_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_notes"
  ADD CONSTRAINT "guest_notes_guest_id_fkey"
  FOREIGN KEY ("guest_id") REFERENCES "guests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_notes"
  ADD CONSTRAINT "guest_notes_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guest_notes"
  ADD CONSTRAINT "guest_notes_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guest_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guest_notes" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_guest_notes ON guest_notes
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "guest_notes" TO talos_runtime;

CREATE TABLE "guest_tags" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "name" VARCHAR(64) NOT NULL,
  "archived_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "guest_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_tags_tenant_id_lower_name_uidx"
  ON "guest_tags"("tenant_id", lower("name"));
CREATE INDEX "guest_tags_tenant_id_archived_at_idx"
  ON "guest_tags"("tenant_id", "archived_at");

ALTER TABLE "guest_tags"
  ADD CONSTRAINT "guest_tags_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guest_tags" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_guest_tags ON guest_tags
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "guest_tags" TO talos_runtime;

CREATE TABLE "guest_tag_assignments" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "guest_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assigned_by_user_id" UUID,
  CONSTRAINT "guest_tag_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_tag_assignments_tenant_guest_tag_uidx"
  ON "guest_tag_assignments"("tenant_id", "guest_id", "tag_id");
CREATE INDEX "guest_tag_assignments_tenant_id_guest_id_idx"
  ON "guest_tag_assignments"("tenant_id", "guest_id");
CREATE INDEX "guest_tag_assignments_tenant_id_tag_id_idx"
  ON "guest_tag_assignments"("tenant_id", "tag_id");

ALTER TABLE "guest_tag_assignments"
  ADD CONSTRAINT "guest_tag_assignments_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_tag_assignments"
  ADD CONSTRAINT "guest_tag_assignments_guest_id_fkey"
  FOREIGN KEY ("guest_id") REFERENCES "guests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_tag_assignments"
  ADD CONSTRAINT "guest_tag_assignments_tag_id_fkey"
  FOREIGN KEY ("tag_id") REFERENCES "guest_tags"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_tag_assignments"
  ADD CONSTRAINT "guest_tag_assignments_assigned_by_user_id_fkey"
  FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "guest_tag_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guest_tag_assignments" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_guest_tag_assignments ON guest_tag_assignments
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "guest_tag_assignments" TO talos_runtime;
