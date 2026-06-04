-- ─────────────────────────────────────────────────────────────────────────────
-- Contract Suspension Feature — enum value additions (must run before the main
-- 20260604120000_add_contract_suspension.sql migration).
--
-- PostgreSQL forbids using a newly-added enum value within the same transaction
-- that adds it. The main migration creates a partial index that filters on
-- status = 'suspended' (a trade_status_enum value), so the value has to be
-- committed in its own migration first.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE trade_status_enum      ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE trade_alert_type_enum  ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE trade_alert_type_enum  ADD VALUE IF NOT EXISTS 'resumed';
