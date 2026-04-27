-- DropForeignKey
ALTER TABLE "email_2fa_audit_logs" DROP CONSTRAINT "email_2fa_audit_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "email_2fa_codes" DROP CONSTRAINT "email_2fa_codes_user_id_fkey";

-- DropForeignKey
ALTER TABLE "email_2fa_pending_sessions" DROP CONSTRAINT "email_2fa_pending_sessions_user_id_fkey";

-- AlterTable
ALTER TABLE "email_2fa_audit_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "email_2fa_codes" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "email_2fa_pending_sessions" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "email_2fa_codes" ADD CONSTRAINT "email_2fa_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_2fa_pending_sessions" ADD CONSTRAINT "email_2fa_pending_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_2fa_audit_logs" ADD CONSTRAINT "email_2fa_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
