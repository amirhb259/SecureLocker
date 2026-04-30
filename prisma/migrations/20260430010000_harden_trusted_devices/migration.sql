-- Harden trusted-device storage for production.
ALTER TABLE "trusted_devices" DROP CONSTRAINT IF EXISTS "trusted_devices_user_id_device_fingerprint_key";

DROP INDEX IF EXISTS "trusted_devices_device_fingerprint_idx";

ALTER TABLE "trusted_devices"
  RENAME COLUMN "ip_address" TO "ip_hash";

ALTER TABLE "trusted_devices"
  RENAME COLUMN "user_agent" TO "user_agent_hash";

ALTER TABLE "trusted_devices"
  RENAME COLUMN "device_fingerprint" TO "device_fingerprint_hash";

ALTER TABLE "trusted_devices"
  RENAME COLUMN "created_at" TO "first_seen_at";

ALTER TABLE "trusted_devices"
  RENAME COLUMN "last_used_at" TO "last_seen_at";

ALTER TABLE "trusted_devices"
  ADD COLUMN IF NOT EXISTS "trusted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3);

ALTER TABLE "trusted_devices"
  DROP COLUMN IF EXISTS "is_trusted";

ALTER TABLE "trusted_devices"
  ALTER COLUMN "ip_hash" TYPE VARCHAR(128),
  ALTER COLUMN "user_agent_hash" TYPE VARCHAR(128),
  ALTER COLUMN "device_fingerprint_hash" TYPE VARCHAR(128);

CREATE UNIQUE INDEX "trusted_devices_user_id_device_fingerprint_hash_ip_hash_key"
  ON "trusted_devices"("user_id", "device_fingerprint_hash", "ip_hash");

CREATE INDEX "trusted_devices_device_fingerprint_hash_idx" ON "trusted_devices"("device_fingerprint_hash");
CREATE INDEX "trusted_devices_ip_hash_idx" ON "trusted_devices"("ip_hash");

ALTER TABLE "pending_login_approvals"
  RENAME COLUMN "ip_address" TO "ip_hash";

ALTER TABLE "pending_login_approvals"
  RENAME COLUMN "user_agent" TO "user_agent_hash";

ALTER TABLE "pending_login_approvals"
  RENAME COLUMN "device_fingerprint" TO "device_fingerprint_hash";

ALTER TABLE "pending_login_approvals"
  ALTER COLUMN "ip_hash" TYPE VARCHAR(128),
  ALTER COLUMN "user_agent_hash" TYPE VARCHAR(128),
  ALTER COLUMN "device_fingerprint_hash" TYPE VARCHAR(128);

CREATE INDEX "pending_login_approvals_user_id_device_fingerprint_hash_ip_hash_idx"
  ON "pending_login_approvals"("user_id", "device_fingerprint_hash", "ip_hash");

ALTER TYPE "SecurityLogAction" ADD VALUE IF NOT EXISTS 'NEW_DEVICE_DETECTED';
ALTER TYPE "SecurityLogAction" ADD VALUE IF NOT EXISTS 'APPROVAL_EMAIL_SENT';
