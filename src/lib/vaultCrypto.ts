import type { EncryptedCredential, VaultEnvelope } from "./dashboardApi";

export type VaultSecret = {
  dataKey: CryptoKey;
  rawDataKey: ArrayBuffer;
};

export type CredentialPayload = {
  category: string;
  creditCard: {
    expiry: string;
    holder: string;
    number: string;
  } | null;
  customCategory: string;
  customFields: Array<{
    id: string;
    key: string;
    value: string;
  }>;
  email: string;
  notes: string;
  password: string;
  tags: string[];
  title: string;
  username: string;
  website: string;
};

export type DecryptedCredential = CredentialPayload & {
  createdAt: string;
  id: string;
  updatedAt: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const iterations = 250_000;

function bytesToBase64(bytes: ArrayBuffer | Uint8Array) {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  array.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function deriveWrappingKey(secret: string, salt: string, kdfIterations: number) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      hash: "SHA-256",
      iterations: kdfIterations,
      name: "PBKDF2",
      salt: base64ToBytes(salt),
    },
    baseKey,
    { length: 256, name: "AES-GCM" },
    false,
    ["decrypt", "encrypt"],
  );
}

async function importDataKey(rawDataKey: ArrayBuffer) {
  return crypto.subtle.importKey("raw", rawDataKey, { length: 256, name: "AES-GCM" }, true, ["decrypt", "encrypt"]);
}

async function encryptRaw(key: CryptoKey, data: ArrayBuffer | Uint8Array) {
  const nonce = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ iv: nonce, name: "AES-GCM" }, key, data);
  return { ciphertext: bytesToBase64(ciphertext), nonce: bytesToBase64(nonce) };
}

async function decryptRaw(key: CryptoKey, ciphertext: string, nonce: string) {
  return crypto.subtle.decrypt({ iv: base64ToBytes(nonce), name: "AES-GCM" }, key, base64ToBytes(ciphertext));
}

export function generateRecoveryKey() {
  return bytesToBase64(randomBytes(32)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createVaultEnvelope(vaultPassword: string) {
  const salt = bytesToBase64(randomBytes(16));
  const recoveryKey = generateRecoveryKey();
  const dataKey = await crypto.subtle.generateKey({ length: 256, name: "AES-GCM" }, true, ["decrypt", "encrypt"]);
  const rawDataKey = await crypto.subtle.exportKey("raw", dataKey);
  const passwordKey = await deriveWrappingKey(vaultPassword, salt, iterations);
  const recoveryWrappingKey = await deriveWrappingKey(recoveryKey, salt, iterations);
  const passwordEnvelope = await encryptRaw(passwordKey, rawDataKey);
  const recoveryEnvelope = await encryptRaw(recoveryWrappingKey, rawDataKey);

  return {
    envelope: {
      dataKeyNonce: passwordEnvelope.nonce,
      encryptedDataKey: passwordEnvelope.ciphertext,
      kdfIterations: iterations,
      kdfSalt: salt,
      recoveryDataKeyNonce: recoveryEnvelope.nonce,
      recoveryEncryptedDataKey: recoveryEnvelope.ciphertext,
    },
    recoveryKey,
    secret: { dataKey, rawDataKey },
  };
}

export async function unlockVaultWithPassword(envelope: VaultEnvelope, vaultPassword: string): Promise<VaultSecret> {
  const wrappingKey = await deriveWrappingKey(vaultPassword, envelope.kdfSalt, envelope.kdfIterations);
  const rawDataKey = await decryptRaw(wrappingKey, envelope.encryptedDataKey, envelope.dataKeyNonce);
  return { dataKey: await importDataKey(rawDataKey), rawDataKey };
}

export async function recoverVaultWithKey(envelope: VaultEnvelope, recoveryKey: string, newVaultPassword: string) {
  const recoveryWrappingKey = await deriveWrappingKey(recoveryKey, envelope.kdfSalt, envelope.kdfIterations);
  const rawDataKey = await decryptRaw(recoveryWrappingKey, envelope.recoveryEncryptedDataKey, envelope.recoveryDataKeyNonce);
  const dataKey = await importDataKey(rawDataKey);
  const newPasswordKey = await deriveWrappingKey(newVaultPassword, envelope.kdfSalt, envelope.kdfIterations);
  const passwordEnvelope = await encryptRaw(newPasswordKey, rawDataKey);

  return {
    envelope: {
      dataKeyNonce: passwordEnvelope.nonce,
      encryptedDataKey: passwordEnvelope.ciphertext,
      recoveryDataKeyNonce: envelope.recoveryDataKeyNonce,
      recoveryEncryptedDataKey: envelope.recoveryEncryptedDataKey,
    },
    secret: { dataKey, rawDataKey },
  };
}

export async function encryptCredential(secret: VaultSecret, payload: CredentialPayload) {
  const encrypted = await encryptRaw(secret.dataKey, encoder.encode(JSON.stringify(payload)));
  return { ciphertext: encrypted.ciphertext, nonce: encrypted.nonce };
}

export async function decryptCredential(secret: VaultSecret, credential: EncryptedCredential): Promise<DecryptedCredential> {
  const plaintext = await decryptRaw(secret.dataKey, credential.ciphertext, credential.nonce);
  const payload = normalizeCredentialPayload(JSON.parse(decoder.decode(plaintext)) as Partial<CredentialPayload>);
  return {
    ...payload,
    createdAt: credential.createdAt,
    id: credential.id,
    updatedAt: credential.updatedAt,
  };
}

export function emptyCredentialPayload(): CredentialPayload {
  return {
    category: "Social",
    creditCard: null,
    customCategory: "",
    customFields: [],
    email: "",
    notes: "",
    password: "",
    tags: [],
    title: "",
    username: "",
    website: "",
  };
}

export function normalizeCredentialPayload(payload: Partial<CredentialPayload>): CredentialPayload {
  const empty = emptyCredentialPayload();
  return {
    ...empty,
    ...payload,
    creditCard: payload.creditCard
      ? {
          expiry: payload.creditCard.expiry ?? "",
          holder: payload.creditCard.holder ?? "",
          number: payload.creditCard.number ?? "",
        }
      : null,
    customFields: Array.isArray(payload.customFields)
      ? payload.customFields.map((field) => ({
          id: field.id || crypto.randomUUID(),
          key: field.key ?? "",
          value: field.value ?? "",
        }))
      : [],
    tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [],
  };
}

export function analyzeCredentials(credentials: DecryptedCredential[]) {
  const passwordCounts = new Map<string, number>();
  credentials.forEach((credential) => {
    passwordCounts.set(credential.password, (passwordCounts.get(credential.password) ?? 0) + 1);
  });

  const weak = credentials.filter((credential) => passwordStrength(credential.password) < 3);
  const reusedGroups = Array.from(passwordCounts.values()).filter((count) => count > 1).length;
  const score = Math.max(0, 100 - weak.length * 12 - reusedGroups * 15);

  return {
    reusedCount: credentials.filter((credential) => (passwordCounts.get(credential.password) ?? 0) > 1).length,
    reusedGroups,
    score,
    status: weak.length === 0 && reusedGroups === 0 ? "secure" : "warning",
    weakCount: weak.length,
  };
}

function passwordStrength(password: string) {
  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  return score;
}
