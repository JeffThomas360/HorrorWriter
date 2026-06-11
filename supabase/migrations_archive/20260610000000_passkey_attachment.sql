-- Passkey UX improvement (2026-06-10): record whether a credential is a
-- synced (cross-platform) or device-bound (platform) passkey so the Profile
-- UI can label existing keys and offer both registration paths.
--
-- Nullable on purpose: rows created before this feature have no attachment
-- recorded and surface as a generic "Passkey" in the UI.
ALTER TABLE "public"."passkey_credentials"
  ADD COLUMN IF NOT EXISTS "attachment" "text"
  CHECK ("attachment" IN ('platform', 'cross-platform'));
