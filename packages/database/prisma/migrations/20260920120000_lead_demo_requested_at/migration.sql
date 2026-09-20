-- AlterTable
ALTER TABLE "leads" ADD COLUMN "demo_requested_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "leads_demo_requested_at_idx" ON "leads"("demo_requested_at");
