CREATE TYPE "SecurityEventType" AS ENUM ('NEW_IP_LOGIN', 'SUSPICIOUS_LOGIN', 'ACCOUNT_LOCKED');
CREATE TYPE "SecurityEventStatus" AS ENUM ('PENDING', 'TRUSTED', 'SUSPICIOUS', 'LOCKED', 'EXPIRED');
CREATE TYPE "SecurityActionType" AS ENUM ('TRUST_IP', 'SECURE_ACCOUNT');

ALTER TABLE "users"
  ADD COLUMN "locked_at" TIMESTAMP(3),
  ADD COLUMN "locked_reason" VARCHAR(128);

CREATE TABLE "trusted_ips" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "ip_address" VARCHAR(64) NOT NULL,
  "user_agent" VARCHAR(512),
  "trusted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trusted_ips_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "ip_address" VARCHAR(64) NOT NULL,
  "user_agent" VARCHAR(512),
  "type" "SecurityEventType" NOT NULL,
  "status" "SecurityEventStatus" NOT NULL DEFAULT 'PENDING',
  "action" VARCHAR(128),
  "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "resolved_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_action_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "action" "SecurityActionType" NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_action_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trusted_ips_user_id_ip_address_key" ON "trusted_ips"("user_id", "ip_address");
CREATE INDEX "trusted_ips_ip_address_idx" ON "trusted_ips"("ip_address");
CREATE INDEX "security_events_user_id_status_idx" ON "security_events"("user_id", "status");
CREATE INDEX "security_events_ip_address_created_at_idx" ON "security_events"("ip_address", "created_at");
CREATE INDEX "security_events_expires_at_idx" ON "security_events"("expires_at");
CREATE UNIQUE INDEX "security_action_tokens_token_hash_key" ON "security_action_tokens"("token_hash");
CREATE INDEX "security_action_tokens_user_id_idx" ON "security_action_tokens"("user_id");
CREATE INDEX "security_action_tokens_event_id_idx" ON "security_action_tokens"("event_id");
CREATE INDEX "security_action_tokens_expires_at_idx" ON "security_action_tokens"("expires_at");

ALTER TABLE "trusted_ips"
  ADD CONSTRAINT "trusted_ips_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_events"
  ADD CONSTRAINT "security_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_action_tokens"
  ADD CONSTRAINT "security_action_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_action_tokens"
  ADD CONSTRAINT "security_action_tokens_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "security_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
