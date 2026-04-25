CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "session_id" UUID,
  "action" VARCHAR(64) NOT NULL,
  "details" VARCHAR(512),
  "ip_address" VARCHAR(64) NOT NULL,
  "user_agent" VARCHAR(512),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "destructive_action_codes" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "destructive_action_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_history" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "password_hash" TEXT NOT NULL,
  "password_fingerprint" VARCHAR(128) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "username_reservations" (
  "id" UUID NOT NULL,
  "username" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "username_reservations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
CREATE INDEX "audit_logs_ip_address_created_at_idx" ON "audit_logs"("ip_address", "created_at");
CREATE INDEX "audit_logs_session_id_idx" ON "audit_logs"("session_id");
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");
CREATE INDEX "destructive_action_codes_expires_at_idx" ON "destructive_action_codes"("expires_at");
CREATE INDEX "destructive_action_codes_user_id_idx" ON "destructive_action_codes"("user_id");
CREATE INDEX "password_history_user_id_created_at_idx" ON "password_history"("user_id", "created_at");
CREATE UNIQUE INDEX "username_reservations_username_key" ON "username_reservations"("username");

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "destructive_action_codes"
  ADD CONSTRAINT "destructive_action_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "password_history"
  ADD CONSTRAINT "password_history_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_lock_events" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "account_recovery_tokens" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "recovery_attempts" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "security_action_tokens" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "security_events" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "security_question_setup_tokens" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "security_questions" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "trusted_ips" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "user_security_questions" ALTER COLUMN "id" DROP DEFAULT;
