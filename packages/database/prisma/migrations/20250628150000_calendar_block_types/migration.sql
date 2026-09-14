-- Extend CalendarBlockType for operator inventory blocks (maintenance, cleaning, owner).
-- Existing rows with block_type = 'manual' remain unchanged.

ALTER TYPE "CalendarBlockType" ADD VALUE IF NOT EXISTS 'maintenance';
ALTER TYPE "CalendarBlockType" ADD VALUE IF NOT EXISTS 'cleaning';
ALTER TYPE "CalendarBlockType" ADD VALUE IF NOT EXISTS 'owner';
