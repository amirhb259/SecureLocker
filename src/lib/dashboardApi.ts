import { authenticatedRequest, type ApiUser } from "./authApi";

export type MeResponse = {
  activeSessionId: string;
  email2faEnabled: boolean;
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
  email2faEnabled: boolean;
  emailVerified: boolean;
  lastActivity: DashboardActivity | null;
  securityQuestionsConfigured: boolean;
  securityStatus: "locked" | "ready" | "setup_required" | "at_risk";
  totalPasswords: number;
  vaultConfigured: boolean;
};

export type SecurityOverview = {
  securityScore: number;
  securityStatus: "ready" | "setup_required" | "at_risk";
  emailVerified: boolean;
  securityQuestionsConfigured: boolean;
  vaultConfigured: boolean;
  email2faEnabled: boolean;
  weakPasswordCount: number;
  reusedPasswordCount: number;
  oldPasswordCount: number;
  vaultEncryptionStatus: "enabled" | "required";
  recommendations: string[];
  scoreComponents: {
    emailVerified: number;
    email2faEnabled: number;
    securityQuestionsConfigured: number;
    vaultConfigured: number;
    trustedDevices: number;
    trustedIps: number;
  };
  trustedSessionCount: number;
  trustedIpCount: number;
  totalPasswords: number;
  lastSecurityScan: string | null;
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
  clearActivity: (password: string) =>
    authenticatedRequest<{ deletedCount: number; message: string }>("/activity", {
      body: JSON.stringify({ password }),
      method: "DELETE",
    }),
  deleteAccount: (password: string) =>
    authenticatedRequest<{ message: string }>("/account", {
      body: JSON.stringify({ password }),
      method: "DELETE",
    }),
  deleteVault: (password: string) =>
    authenticatedRequest<{ message: string }>("/vault", {
      body: JSON.stringify({ password }),
      method: "DELETE",
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
  getSecurityOverview: () => authenticatedRequest<SecurityOverview>("/security/overview"),
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
  sendPasswordHealth: (data: {
    weakPasswordCount: number;
    reusedPasswordCount: number;
    oldPasswordCount: number;
    totalPasswords: number;
  }) =>
    authenticatedRequest<{ message: string; weakPasswordCount: number; reusedPasswordCount: number; oldPasswordCount: number; totalPasswords: number }>("/security/password-health", {
      body: JSON.stringify(data),
      method: "POST",
    }),
  send2faEnableCode: () =>
    authenticatedRequest<{ message: string }>("/2fa/enable/send-code", { method: "POST" }),
  send2faDisableCode: () =>
    authenticatedRequest<{ message: string }>("/2fa/disable/send-code", { method: "POST" }),
  verify2faEnableCode: (code: string) =>
    authenticatedRequest<{ message: string }>("/2fa/enable/verify-code", {
      body: JSON.stringify({ code }),
      method: "POST",
    }),
  sendEmergencyLockCode: () =>
    authenticatedRequest<{ message: string }>("/emergency-lock/send-code", { method: "POST" }),
  verifyEmergencyLockCode: (code: string) =>
    authenticatedRequest<{ message: string }>("/emergency-lock/verify-code", {
      body: JSON.stringify({ code }),
      method: "POST",
    }),
  saveEmergencyLockShortcut: (shortcut: string) =>
    authenticatedRequest<{ message: string }>("/account/emergency-shortcut/save", {
      body: JSON.stringify({ shortcut }),
      method: "POST",
    }),
  verify2faDisableCode: (code: string) =>
    authenticatedRequest<{ message: string }>("/2fa/disable/verify-code", {
      body: JSON.stringify({ code }),
      method: "POST",
    }),
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
