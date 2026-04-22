CREATE TABLE "security_questions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "prompt" VARCHAR(180) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_security_questions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "answer_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_security_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_question_setup_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_question_setup_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_recovery_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_recovery_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recovery_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_id" UUID,
  "ip_address" VARCHAR(64) NOT NULL,
  "user_agent" VARCHAR(512),
  "success" BOOLEAN NOT NULL,
  "reason" VARCHAR(128),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recovery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_lock_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "reason" VARCHAR(128) NOT NULL,
  "ip_address" VARCHAR(64) NOT NULL,
  "user_agent" VARCHAR(512),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "account_lock_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "security_questions_prompt_key" ON "security_questions"("prompt");
CREATE UNIQUE INDEX "user_security_questions_user_id_question_id_key" ON "user_security_questions"("user_id", "question_id");
CREATE INDEX "user_security_questions_user_id_idx" ON "user_security_questions"("user_id");
CREATE UNIQUE INDEX "security_question_setup_tokens_token_hash_key" ON "security_question_setup_tokens"("token_hash");
CREATE INDEX "security_question_setup_tokens_user_id_idx" ON "security_question_setup_tokens"("user_id");
CREATE INDEX "security_question_setup_tokens_expires_at_idx" ON "security_question_setup_tokens"("expires_at");
CREATE UNIQUE INDEX "account_recovery_tokens_token_hash_key" ON "account_recovery_tokens"("token_hash");
CREATE INDEX "account_recovery_tokens_user_id_idx" ON "account_recovery_tokens"("user_id");
CREATE INDEX "account_recovery_tokens_expires_at_idx" ON "account_recovery_tokens"("expires_at");
CREATE INDEX "recovery_attempts_user_id_created_at_idx" ON "recovery_attempts"("user_id", "created_at");
CREATE INDEX "recovery_attempts_ip_address_created_at_idx" ON "recovery_attempts"("ip_address", "created_at");
CREATE INDEX "account_lock_events_user_id_created_at_idx" ON "account_lock_events"("user_id", "created_at");

ALTER TABLE "user_security_questions"
  ADD CONSTRAINT "user_security_questions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_security_questions"
  ADD CONSTRAINT "user_security_questions_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "security_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "security_question_setup_tokens"
  ADD CONSTRAINT "security_question_setup_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_recovery_tokens"
  ADD CONSTRAINT "account_recovery_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recovery_attempts"
  ADD CONSTRAINT "recovery_attempts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recovery_attempts"
  ADD CONSTRAINT "recovery_attempts_token_id_fkey"
  FOREIGN KEY ("token_id") REFERENCES "account_recovery_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "account_lock_events"
  ADD CONSTRAINT "account_lock_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "security_questions" ("prompt") VALUES
  ('What was the name of the first school you attended?'),
  ('What was the model of your first personal computer?'),
  ('What is the name of the street where you first lived independently?'),
  ('What was the name of your first manager?'),
  ('What was the first concert or live event you attended?'),
  ('What was the name of your childhood best friend?'),
  ('What city were you in when you opened your first bank account?'),
  ('What was the name of your first pet?');
