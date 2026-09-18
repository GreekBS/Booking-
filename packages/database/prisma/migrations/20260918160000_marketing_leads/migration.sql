-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'qualified', 'demo', 'won', 'lost');

-- CreateEnum
CREATE TYPE "LeadRelationship" AS ENUM ('owner', 'property_manager', 'hospitality_business', 'other');

-- CreateEnum
CREATE TYPE "LeadPortfolioSize" AS ENUM ('one', 'two_to_five', 'six_to_ten', 'eleven_to_twenty_five', 'twenty_six_to_fifty', 'fifty_one_plus');

-- CreateEnum
CREATE TYPE "LeadOperatingState" AS ENUM ('operating', 'launching_soon', 'planning');

-- CreateEnum
CREATE TYPE "LeadRevenueRange" AS ENUM ('under_25k', 'from_25k_to_75k', 'from_75k_to_150k', 'from_150k_to_300k', 'from_300k_to_750k', 'over_750k', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "LeadInterest" AS ENUM ('run', 'grow', 'managed', 'unsure');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('homepage_nav', 'homepage_hero', 'homepage_final', 'pms', 'website_builder', 'direct_bookings', 'channel_manager', 'vacation_rental_software', 'property_management', 'contact', 'other');

-- CreateEnum
CREATE TYPE "LeadAccommodationType" AS ENUM ('villa', 'apartment', 'vacation_rental', 'hotel', 'boutique_hotel', 'guesthouse', 'other');

-- CreateEnum
CREATE TYPE "LeadChannel" AS ENUM ('booking_com', 'airbnb', 'expedia', 'vrbo', 'direct_bookings', 'own_website', 'other');

-- CreateEnum
CREATE TYPE "LeadTool" AS ENUM ('pms', 'channel_manager', 'booking_engine', 'website_platform', 'none');

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "email_normalized" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(40),
    "country" VARCHAR(100) NOT NULL,
    "relationship" "LeadRelationship" NOT NULL,
    "portfolio_size" "LeadPortfolioSize" NOT NULL,
    "accommodation_types" "LeadAccommodationType"[],
    "property_country" VARCHAR(100) NOT NULL,
    "property_city" VARCHAR(120),
    "operating_state" "LeadOperatingState" NOT NULL,
    "channels" "LeadChannel"[] DEFAULT ARRAY[]::"LeadChannel"[],
    "tools" "LeadTool"[] DEFAULT ARRAY[]::"LeadTool"[],
    "software_name" VARCHAR(120),
    "has_website" BOOLEAN,
    "accepts_direct_bookings" BOOLEAN,
    "revenue_range" "LeadRevenueRange",
    "interests" "LeadInterest"[],
    "message" VARCHAR(1000),
    "source" "LeadSource" NOT NULL,
    "utm_source" VARCHAR(200),
    "utm_medium" VARCHAR(200),
    "utm_campaign" VARCHAR(200),
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_submission_id_key" ON "leads"("submission_id");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_email_normalized_idx" ON "leads"("email_normalized");
