-- CreateEnum
CREATE TYPE "SecurityLogAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'NEW_DEVICE_LOGIN', 'SUSPICIOUS_LOGIN_BLOCKED', 'LOGIN_APPROVAL_REQUESTED', 'LOGIN_APPROVED', 'LOGIN_REJECTED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED', 'PASSWORD_CHANGED', 'TFA_ENABLED', 'TFA_DISABLED', 'DEVICE_TRUSTED', 'DEVICE_UNTRUSTED');

-- CreateEnum
CREATE TYPE "SecurityLogSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateTable
CREATE TABLE "security_settings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "login_alerts" BOOLEAN NOT NULL DEFAULT true,
    "suspicious_login_detection" BOOLEAN NOT NULL DEFAULT true,
    "device_trust_system" BOOLEAN NOT NULL DEFAULT true,
    "account_lock_protection" BOOLEAN NOT NULL DEFAULT true,
    "max_failed_attempts" INTEGER NOT NULL DEFAULT 5,
    "lock_duration_minutes" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusted_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_name" VARCHAR(128) NOT NULL,
    "ip_address" VARCHAR(64) NOT NULL,
    "user_agent" VARCHAR(512) NOT NULL,
    "device_fingerprint" VARCHAR(128) NOT NULL,
    "is_trusted" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trusted_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_login_approvals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "ip_address" VARCHAR(64) NOT NULL,
    "user_agent" VARCHAR(512) NOT NULL,
    "device_fingerprint" VARCHAR(128) NOT NULL,
    "device_name" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_login_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" "SecurityLogAction" NOT NULL,
    "ip_address" VARCHAR(64) NOT NULL,
    "user_agent" VARCHAR(512),
    "details" VARCHAR(512),
    "severity" "SecurityLogSeverity" NOT NULL DEFAULT 'INFO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "security_settings_user_id_key" ON "security_settings"("user_id");

-- CreateIndex
CREATE INDEX "trusted_devices_user_id_idx" ON "trusted_devices"("user_id");

-- CreateIndex
CREATE INDEX "trusted_devices_device_fingerprint_idx" ON "trusted_devices"("device_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_devices_user_id_device_fingerprint_key" ON "trusted_devices"("user_id", "device_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "pending_login_approvals_token_hash_key" ON "pending_login_approvals"("token_hash");

-- CreateIndex
CREATE INDEX "pending_login_approvals_user_id_idx" ON "pending_login_approvals"("user_id");

-- CreateIndex
CREATE INDEX "pending_login_approvals_expires_at_idx" ON "pending_login_approvals"("expires_at");

-- CreateIndex
CREATE INDEX "security_logs_user_id_created_at_idx" ON "security_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "security_logs_action_created_at_idx" ON "security_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "security_logs_severity_created_at_idx" ON "security_logs"("severity", "created_at");

-- AddForeignKey
ALTER TABLE "security_settings" ADD CONSTRAINT "security_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_login_approvals" ADD CONSTRAINT "pending_login_approvals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_logs" ADD CONSTRAINT "security_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
