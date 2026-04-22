-- CreateTable
CREATE TABLE "vaults" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kdf_salt" VARCHAR(128) NOT NULL,
    "kdf_iterations" INTEGER NOT NULL,
    "encrypted_data_key" TEXT NOT NULL,
    "data_key_nonce" VARCHAR(64) NOT NULL,
    "recovery_encrypted_data_key" TEXT NOT NULL,
    "recovery_data_key_nonce" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_credentials" (
    "id" UUID NOT NULL,
    "vault_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_activities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "credential_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vaults_user_id_key" ON "vaults"("user_id");

-- CreateIndex
CREATE INDEX "vault_credentials_vault_id_updated_at_idx" ON "vault_credentials"("vault_id", "updated_at");

-- CreateIndex
CREATE INDEX "vault_credentials_user_id_updated_at_idx" ON "vault_credentials"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "vault_activities_user_id_created_at_idx" ON "vault_activities"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "vault_activities_credential_id_idx" ON "vault_activities"("credential_id");

-- AddForeignKey
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_activities" ADD CONSTRAINT "vault_activities_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "vault_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_activities" ADD CONSTRAINT "vault_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
