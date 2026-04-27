-- Add email 2FA support to User model
ALTER TABLE "users" ADD COLUMN "email_2fa_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Create table for 2FA login codes
CREATE TABLE "email_2fa_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "code_hash" VARCHAR(128) NOT NULL,
  "purpose" VARCHAR(32) NOT NULL, -- 'login' or 'disable'
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_2fa_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_2fa_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Create index for efficient lookups
CREATE INDEX "email_2fa_codes_user_id_idx" ON "email_2fa_codes"("user_id");
CREATE INDEX "email_2fa_codes_expires_at_idx" ON "email_2fa_codes"("expires_at");

-- Create table for 2FA pending sessions (waiting for code verification)
CREATE TABLE "email_2fa_pending_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "session_token_hash" VARCHAR(128) NOT NULL UNIQUE,
  "ip_address" VARCHAR(64),
  "user_agent" VARCHAR(512),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_2fa_pending_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_2fa_pending_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Create index for efficient lookups
CREATE INDEX "email_2fa_pending_sessions_user_id_idx" ON "email_2fa_pending_sessions"("user_id");
CREATE INDEX "email_2fa_pending_sessions_expires_at_idx" ON "email_2fa_pending_sessions"("expires_at");

-- Create table for 2FA audit logs
CREATE TABLE "email_2fa_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "action" VARCHAR(64) NOT NULL, -- 'enabled', 'disabled', 'code_sent', 'code_verified', 'code_failed', 'code_expired'
  "ip_address" VARCHAR(64),
  "user_agent" VARCHAR(512),
  "details" VARCHAR(512),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_2fa_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_2fa_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Create index for efficient lookups
CREATE INDEX "email_2fa_audit_logs_user_id_idx" ON "email_2fa_audit_logs"("user_id");
CREATE INDEX "email_2fa_audit_logs_created_at_idx" ON "email_2fa_audit_logs"("created_at");
