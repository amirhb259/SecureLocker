import { authenticatedRequest, type ApiUser } from "./authApi";

export type MeResponse = {
  activeSessionId: string;
  securityQuestionsConfigured: boolean;
  user: ApiUser;
  vaultConfigured: boolean;
};

export type VaultEnvelope = {
  createdAt: string;
  dataKeyNonce: string;
  encryptedDataKey: string;
  id: string;
  kdfIterations: number;
  kdfSalt: string;
  recoveryDataKeyNonce: string;
  recoveryEncryptedDataKey: string;
  updatedAt: string;
};

export type EncryptedCredential = {
  ciphertext: string;
  createdAt: string;
  id: string;
  nonce: string;
  updatedAt: string;
};

export type DashboardActivity = {
  id: string;
  message: string;
  status: "neutral" | "success" | "warning";
  timestamp: string;
  type: "login" | "recovery" | "security" | "vault";
};

export type DashboardOverview = {
  lastActivity: DashboardActivity | null;
  securityStatus: "locked" | "setup_required";
  totalPasswords: number;
  vaultConfigured: boolean;
};

export type SessionDevice = {
  createdAt: string;
  current: boolean;
  expiresAt: string;
  id: string;
  ipAddress: string | null;
  lastUsedAt: string;
  userAgent: string | null;
};

export const dashboardApi = {
  changePassword: (currentPassword: string, newPassword: string) =>
    authenticatedRequest<{ message: string }>("/auth/change-password", {
      body: JSON.stringify({ currentPassword, newPassword }),
      method: "POST",
    }),
  createCredential: (credential: { ciphertext: string; nonce: string }) =>
    authenticatedRequest<{ credential: EncryptedCredential }>("/vault/credentials", {
      body: JSON.stringify(credential),
      method: "POST",
    }),
  createVault: (input: {
    dataKeyNonce: string;
    encryptedDataKey: string;
    kdfIterations: number;
    kdfSalt: string;
    recoveryDataKeyNonce: string;
    recoveryEncryptedDataKey: string;
  }) =>
    authenticatedRequest<{ vault: VaultEnvelope }>("/vault/setup", {
      body: JSON.stringify(input),
      method: "POST",
    }),
  deleteCredential: (id: string) =>
    authenticatedRequest<{ message: string }>(`/vault/credentials/${id}`, { method: "DELETE" }),
  getActivity: () => authenticatedRequest<{ activity: DashboardActivity[] }>("/activity"),
  getCredentials: () => authenticatedRequest<{ credentials: EncryptedCredential[] }>("/vault/credentials"),
  getMe: () => authenticatedRequest<MeResponse>("/me"),
  getOverview: () => authenticatedRequest<DashboardOverview>("/dashboard/overview"),
  getSessions: () => authenticatedRequest<{ sessions: SessionDevice[] }>("/sessions"),
  getVaultEnvelope: () => authenticatedRequest<{ vault: VaultEnvelope }>("/vault/envelope"),
  getVaultStatus: () =>
    authenticatedRequest<{ configured: boolean; credentialCount: number; lastActivityAt: string | null }>("/vault/status"),
  logout: () => authenticatedRequest<{ message: string }>("/auth/logout", { method: "POST" }),
  recordVaultActivity: (action: "copied" | "locked" | "revealed" | "unlocked", credentialId?: string) =>
    authenticatedRequest<{ message: string }>("/vault/activity", {
      body: JSON.stringify({ action, credentialId }),
      method: "POST",
    }),
  revokeSession: (id: string) =>
    authenticatedRequest<{ message: string }>(`/sessions/${id}/revoke`, { method: "POST" }),
  updateCredential: (id: string, credential: { ciphertext: string; nonce: string }) =>
    authenticatedRequest<{ credential: EncryptedCredential }>(`/vault/credentials/${id}`, {
      body: JSON.stringify(credential),
      method: "PUT",
    }),
  updateVaultEnvelope: (input: {
    dataKeyNonce: string;
    encryptedDataKey: string;
    recoveryDataKeyNonce: string;
    recoveryEncryptedDataKey: string;
  }) =>
    authenticatedRequest<{ vault: VaultEnvelope }>("/vault/envelope", {
      body: JSON.stringify(input),
      method: "PUT",
    }),
};
