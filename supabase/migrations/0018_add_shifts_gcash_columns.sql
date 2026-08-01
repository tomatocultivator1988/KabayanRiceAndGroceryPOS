-- RicePOS — Add missing GCash columns to shifts
-- PUT /api/shifts (close) writes gcash_collections, expected_gcash, gcash_variance,
-- but migration 0003 only added opening_gcash/closing_gcash/gcash_sales.
-- Missing columns made shift close fail with a PostgREST schema-cache error.

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS gcash_collections NUMERIC(12,2) DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS expected_gcash NUMERIC(12,2) DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS gcash_variance NUMERIC(12,2) DEFAULT 0;
