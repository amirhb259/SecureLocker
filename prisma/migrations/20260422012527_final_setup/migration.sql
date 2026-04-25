ALTER TABLE "email_verification_tokens" DROP CONSTRAINT IF EXISTS "email_verification_tokens_user_id_fkey";
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT IF EXISTS "password_reset_tokens_user_id_fkey";
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_user_id_fkey";

ALTER TABLE "email_verification_tokens"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "used_at" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "login_attempts"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "password_reset_tokens"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "used_at" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "sessions"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "revoked_at" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "last_used_at" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "users"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "email_verified_at" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "email_verification_tokens"
  ADD CONSTRAINT "email_verification_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
