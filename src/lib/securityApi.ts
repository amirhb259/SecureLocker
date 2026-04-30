import { apiBaseUrl, getStoredSession } from "./authApi";

export interface SecurityScore {
  total: number;
  breakdown: {
    emailVerified: number;
    tfaEnabled: number;
    vaultCreated: number;
    trustedDevice: number;
    noFailedAttempts: number;
    strongPassword: number;
  };
}

export interface TrustedDevice {
  id: string;
  deviceName: string;
  firstSeenAt: string;
  lastSeenAt: string;
  trustedAt: string;
}

export interface SecurityLog {
  id: string;
  action: string;
  ipAddress: string;
  userAgent?: string;
  details?: string;
  severity: string;
  createdAt: string;
}

export interface SecuritySettings {
  loginAlerts: boolean;
  suspiciousLoginDetection: boolean;
  deviceTrustSystem: boolean;
  accountLockProtection: boolean;
  maxFailedAttempts: number;
  lockDurationMinutes: number;
  emergencyShortcutEnabled: boolean;
}

export interface LoginApprovalResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Security API functions
function authHeaders() {
  const session = getStoredSession();
  return {
    "Authorization": session ? `Bearer ${session.accessToken}` : "",
    "Content-Type": "application/json",
  };
}

export async function getSecurityScore(): Promise<SecurityScore> {
  const response = await fetch(`${apiBaseUrl}/security/score`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch security score");
  }

  return response.json();
}

export async function getTrustedDevices(): Promise<TrustedDevice[]> {
  const response = await fetch(`${apiBaseUrl}/devices`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch trusted devices");
  }

  const data = await response.json();
  return data.devices;
}

export async function removeTrustedDevice(deviceId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/devices/${deviceId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to remove trusted device");
  }
}

export async function getSecurityLogs(limit: number = 50, offset: number = 0): Promise<SecurityLog[]> {
  const response = await fetch(`${apiBaseUrl}/security/logs?limit=${limit}&offset=${offset}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch security logs");
  }

  const data = await response.json();
  return data.logs;
}

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const response = await fetch(`${apiBaseUrl}/security/settings`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch security settings");
  }

  return response.json();
}

export async function updateSecuritySettings(settings: Partial<SecuritySettings>): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/security/settings`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error("Failed to update security settings");
  }
}

export async function getAccountSecurityStatus(): Promise<{ emergencyShortcutEnabled: boolean }> {
  const response = await fetch(`${apiBaseUrl}/account/security-status`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch account security status");
  }

  return response.json();
}

export async function updateAccountSecurityStatus(settings: { emergencyShortcutEnabled: boolean }): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/account/security-status`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error("Failed to update account security status");
  }
}

export async function approveLogin(approvalToken: string): Promise<LoginApprovalResponse> {
  const response = await fetch(`${apiBaseUrl}/auth/approve-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ approvalToken }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to approve login");
  }

  return response.json();
}

export async function rejectLogin(approvalToken: string): Promise<LoginApprovalResponse> {
  const response = await fetch(`${apiBaseUrl}/auth/reject-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ approvalToken }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to reject login");
  }

  return response.json();
}

// Check for login approval in URL params
export function checkForLoginApproval(): { token?: string; action?: 'approve' | 'reject' } {
  const urlParams = new URLSearchParams(window.location.search);
  const approveToken = urlParams.get('approveLogin');
  const rejectToken = urlParams.get('rejectLogin');

  if (approveToken) {
    return { token: approveToken, action: 'approve' };
  } else if (rejectToken) {
    return { token: rejectToken, action: 'reject' };
  }

  return {};
}

// Format security action for display
export function formatSecurityAction(action: string): string {
  return action.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

// Format severity with color
export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'text-red-600';
    case 'ERROR': return 'text-red-500';
    case 'WARNING': return 'text-yellow-600';
    case 'INFO': return 'text-blue-600';
    default: return 'text-gray-600';
  }
}

// Format device name
export function formatDeviceName(userAgent?: string): string {
  if (!userAgent) return 'Unknown Device';
  
  // Extract browser name from user agent
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  
  return 'Unknown Browser';
}

// Calculate security score color
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  if (score >= 40) return 'text-orange-600';
  return 'text-red-600';
}

// Calculate security score label
export function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}
