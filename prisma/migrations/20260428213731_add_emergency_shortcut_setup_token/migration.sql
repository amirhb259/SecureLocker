-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SecurityLogAction" ADD VALUE 'EMERGENCY_SHORTCUT_SETUP_REQUESTED';
ALTER TYPE "SecurityLogAction" ADD VALUE 'EMERGENCY_SHORTCUT_ENABLED';
ALTER TYPE "SecurityLogAction" ADD VALUE 'EMERGENCY_SHORTCUT_TRIGGERED';
ALTER TYPE "SecurityLogAction" ADD VALUE 'EMERGENCY_LOCK_UNLOCK_ATTEMPT';
ALTER TYPE "SecurityLogAction" ADD VALUE 'EMERGENCY_LOCK_UNLOCK_SUCCESS';
ALTER TYPE "SecurityLogAction" ADD VALUE 'EMERGENCY_SHORTCUT_DISABLED';

-- AlterEnum
ALTER TYPE "UserAccountStatus" ADD VALUE 'EMERGENCY_LOCKED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emergency_shortcut_created_at" TIMESTAMP(3),
ADD COLUMN     "emergency_shortcut_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emergency_shortcut_hash" TEXT,
ADD COLUMN     "emergency_shortcut_updated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "emergency_shortcut_setup_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_shortcut_setup_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emergency_shortcut_setup_tokens_token_hash_key" ON "emergency_shortcut_setup_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "emergency_shortcut_setup_tokens_user_id_idx" ON "emergency_shortcut_setup_tokens"("user_id");

-- CreateIndex
CREATE INDEX "emergency_shortcut_setup_tokens_expires_at_idx" ON "emergency_shortcut_setup_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "emergency_shortcut_setup_tokens" ADD CONSTRAINT "emergency_shortcut_setup_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
