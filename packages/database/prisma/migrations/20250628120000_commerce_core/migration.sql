-- Commerce core schema (Phase 2B)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "CalendarBlockType" AS ENUM ('manual', 'hold', 'booking', 'turnover');
CREATE TYPE "CalendarBlockStatus" AS ENUM ('active', 'released', 'expired', 'cancelled');
CREATE TYPE "HoldStatus" AS ENUM ('active', 'released', 'expired', 'converted');
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'payment_pending', 'confirmed', 'cancelled', 'completed');
CREATE TYPE "DowModifierType" AS ENUM ('fixed', 'percent');
CREATE TYPE "PaymentRecordStatus" AS ENUM ('pending', 'authorized', 'captured', 'failed', 'cancelled');
CREATE TYPE "ConfirmationMode" AS ENUM ('manual', 'payment_required');

-- CreateTable
CREATE TABLE "tenant_commerce_settings" (
    "tenant_id" UUID NOT NULL,
    "default_hold_ttl_seconds" INTEGER NOT NULL DEFAULT 900,
    "confirmation_mode" "ConfirmationMode" NOT NULL DEFAULT 'manual',
    "default_currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_commerce_settings_pkey" PRIMARY KEY ("tenant_id")
);

CREATE TABLE "unit_availability_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "min_nights" INTEGER NOT NULL DEFAULT 1,
    "max_nights" INTEGER NOT NULL DEFAULT 30,
    "check_in_days" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6],
    "check_out_days" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6],
    "advance_min_days" INTEGER NOT NULL DEFAULT 0,
    "advance_max_days" INTEGER NOT NULL DEFAULT 365,
    "turnover_nights" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "unit_availability_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rate_plans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "base_nightly_amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rate_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rate_seasons" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rate_plan_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "nightly_amount" DECIMAL(19,4) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rate_seasons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rate_seasons_valid_range" CHECK ("start_date" < "end_date")
);

CREATE TABLE "rate_dow_modifiers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rate_plan_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "modifier_type" "DowModifierType" NOT NULL,
    "modifier_value" DECIMAL(19,4) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rate_dow_modifiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "unit_calendar_blocks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "block_type" "CalendarBlockType" NOT NULL,
    "source_id" UUID,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "stay_period" daterange GENERATED ALWAYS AS (daterange("check_in", "check_out", '[)')) STORED,
    "status" "CalendarBlockStatus" NOT NULL DEFAULT 'active',
    "reason" TEXT,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "unit_calendar_blocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "unit_calendar_blocks_valid_range" CHECK ("check_in" < "check_out")
);

CREATE TABLE "booking_holds" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "status" "HoldStatus" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "idempotency_key" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "booking_holds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_holds_valid_range" CHECK ("check_in" < "check_out")
);

CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "hold_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "total_amount" DECIMAL(19,4) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "hold_id" UUID NOT NULL,
    "quote_snapshot_id" UUID NOT NULL,
    "guest_name" VARCHAR(255) NOT NULL,
    "guest_email" VARCHAR(255) NOT NULL,
    "guest_phone" VARCHAR(50),
    "guest_count" INTEGER NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',
    "confirmation_mode" "ConfirmationMode" NOT NULL,
    "total_amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bookings_valid_range" CHECK ("check_in" < "check_out")
);

CREATE TABLE "payment_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'pending',
    "provider" VARCHAR(32) NOT NULL DEFAULT 'stub',
    "provider_reference" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_availability_rules_unit_id_key" ON "unit_availability_rules"("unit_id");
CREATE INDEX "unit_availability_rules_tenant_id_idx" ON "unit_availability_rules"("tenant_id");

CREATE UNIQUE INDEX "rate_plans_unit_id_key" ON "rate_plans"("unit_id");
CREATE INDEX "rate_plans_tenant_id_idx" ON "rate_plans"("tenant_id");

CREATE INDEX "rate_seasons_tenant_id_rate_plan_id_idx" ON "rate_seasons"("tenant_id", "rate_plan_id");

CREATE UNIQUE INDEX "rate_dow_modifiers_rate_plan_id_day_of_week_key" ON "rate_dow_modifiers"("rate_plan_id", "day_of_week");
CREATE INDEX "rate_dow_modifiers_tenant_id_rate_plan_id_idx" ON "rate_dow_modifiers"("tenant_id", "rate_plan_id");

CREATE INDEX "unit_calendar_blocks_tenant_id_unit_id_block_type_status_idx" ON "unit_calendar_blocks"("tenant_id", "unit_id", "block_type", "status");
CREATE INDEX "unit_calendar_blocks_source_id_idx" ON "unit_calendar_blocks"("source_id");
CREATE INDEX "unit_calendar_blocks_stay_period_idx" ON "unit_calendar_blocks" USING GIST ("stay_period");

CREATE INDEX "booking_holds_tenant_id_unit_id_status_idx" ON "booking_holds"("tenant_id", "unit_id", "status");
CREATE INDEX "booking_holds_tenant_id_check_in_check_out_idx" ON "booking_holds"("tenant_id", "check_in", "check_out");

CREATE INDEX "quotes_tenant_id_hold_id_idx" ON "quotes"("tenant_id", "hold_id");

CREATE INDEX "bookings_tenant_id_unit_id_check_in_check_out_idx" ON "bookings"("tenant_id", "unit_id", "check_in", "check_out");
CREATE INDEX "bookings_tenant_id_status_created_at_idx" ON "bookings"("tenant_id", "status", "created_at" DESC);

CREATE INDEX "payment_records_tenant_id_booking_id_idx" ON "payment_records"("tenant_id", "booking_id");

-- Double-booking prevention (ADR-010)
ALTER TABLE "unit_calendar_blocks"
  ADD CONSTRAINT "unit_calendar_no_overlap"
  EXCLUDE USING gist (
    "unit_id" WITH =,
    "stay_period" WITH &&
  )
  WHERE ("status" = 'active' AND "block_type" IN ('hold', 'booking'));

-- AddForeignKey
ALTER TABLE "tenant_commerce_settings" ADD CONSTRAINT "tenant_commerce_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "unit_availability_rules" ADD CONSTRAINT "unit_availability_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unit_availability_rules" ADD CONSTRAINT "unit_availability_rules_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rate_seasons" ADD CONSTRAINT "rate_seasons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rate_seasons" ADD CONSTRAINT "rate_seasons_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rate_dow_modifiers" ADD CONSTRAINT "rate_dow_modifiers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rate_dow_modifiers" ADD CONSTRAINT "rate_dow_modifiers_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "unit_calendar_blocks" ADD CONSTRAINT "unit_calendar_blocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unit_calendar_blocks" ADD CONSTRAINT "unit_calendar_blocks_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unit_calendar_blocks" ADD CONSTRAINT "unit_calendar_blocks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "booking_holds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security
ALTER TABLE tenant_commerce_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_dow_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_calendar_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_tenant_commerce_settings ON tenant_commerce_settings
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_unit_availability_rules ON unit_availability_rules
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_rate_plans ON rate_plans
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_rate_seasons ON rate_seasons
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_rate_dow_modifiers ON rate_dow_modifiers
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_unit_calendar_blocks ON unit_calendar_blocks
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_booking_holds ON booking_holds
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_quotes ON quotes
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_bookings ON bookings
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_payment_records ON payment_records
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
