-- Run this once on the existing rally schema (TablePlus).
SET search_path TO rally, public;

CREATE TABLE IF NOT EXISTS otp_challenges (
  phone text PRIMARY KEY,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS riders_phone_key ON riders (phone) WHERE phone IS NOT NULL;
