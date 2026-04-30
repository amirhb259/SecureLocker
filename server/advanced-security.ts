import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { SecurityLogAction, SecurityLogSeverity } from "@prisma/client";
import { addDays, addMinutes, hashToken } from "./security.js";
import { sendLoginAlertEmail, sendLoginApprovalEmail, sendSuspiciousLoginEmail } from "./email.js";
import { config } from "./config.js";

export interface DeviceInfo {
  deviceFingerprint?: string;
  userAgent: string;
  ipAddress: string;
  deviceName?: string;
}

export interface LoginContext {
  userId: string;
  email: string;
  deviceInfo: DeviceInfo;
}

export interface SecurityCheckResult {
  allowed: boolean;
  requiresApproval?: boolean;
  approvalToken?: string;
  isNewDevice?: boolean;
  isSuspicious?: boolean;
  reason?: string;
}

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

export function hashDeviceValue(label: string, value: string): string {
  return crypto
    .createHmac("sha256", config.AUTH_TOKEN_PEPPER)
    .update(`${label}:${value.trim().toLowerCase()}`)
    .digest("hex");
}

export function generateDeviceFingerprint(userAgent: string, ipAddress: string, clientFingerprint?: string): string {
  const stableClientValue = clientFingerprint?.trim() || `${userAgent}:${ipAddress}`;
  return crypto.createHash("sha256").update(stableClientValue).digest("hex");
}

function deviceHashes(deviceInfo: DeviceInfo) {
  const userAgent = deviceInfo.userAgent || "unknown";
  const ipAddress = deviceInfo.ipAddress || "unknown";
  const deviceFingerprint = generateDeviceFingerprint(userAgent, ipAddress, deviceInfo.deviceFingerprint);

  return {
    deviceFingerprintHash: hashDeviceValue("device-fingerprint", deviceFingerprint),
    ipHash: hashDeviceValue("ip", ipAddress),
    userAgentHash: hashDeviceValue("user-agent", userAgent),
  };
}

// Get or create user security settings
export async function getSecuritySettings(userId: string) {
  let settings = await prisma.securitySettings.findUnique({
    where: { userId }
  });

  if (!settings) {
    settings = await prisma.securitySettings.create({
      data: { userId }
    });
  }

  return settings;
}

// Check if device is trusted
export async function isDeviceTrusted(userId: string, deviceInfo: DeviceInfo): Promise<boolean> {
  const hashes = deviceHashes(deviceInfo);
  const trustedDevice = await prisma.trustedDevice.findFirst({
    where: {
      deviceFingerprintHash: hashes.deviceFingerprintHash,
      ipHash: hashes.ipHash,
      revokedAt: null,
      userAgentHash: hashes.userAgentHash,
      userId
    }
  });

  if (trustedDevice) {
    await prisma.trustedDevice.update({
      where: { id: trustedDevice.id },
      data: { lastSeenAt: new Date() }
    });
    return true;
  }

  return false;
}

// Trust a device
export async function trustDevice(userId: string, deviceInfo: DeviceInfo): Promise<void> {
  const hashes = deviceHashes(deviceInfo);
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { securitySettings: true }
  });

  if (!user) return;

  await prisma.trustedDevice.upsert({
    where: {
      userId_deviceFingerprintHash_ipHash: {
        deviceFingerprintHash: hashes.deviceFingerprintHash,
        ipHash: hashes.ipHash,
        userId,
      }
    },
    update: {
      deviceName: deviceInfo.deviceName || 'Unknown Device',
      lastSeenAt: new Date(),
      revokedAt: null,
      trustedAt: new Date(),
      userAgentHash: hashes.userAgentHash,
    },
    create: {
      deviceFingerprintHash: hashes.deviceFingerprintHash,
      deviceName: deviceInfo.deviceName || 'Unknown Device',
      ipHash: hashes.ipHash,
      userAgentHash: hashes.userAgentHash,
      userId,
    }
  });

  // Send login alert if enabled (only for new devices)
  const existingDevice = await prisma.trustedDevice.findFirst({
    where: {
      deviceFingerprintHash: hashes.deviceFingerprintHash,
      ipHash: hashes.ipHash,
      userId,
      firstSeenAt: {
        lt: new Date(Date.now() - 1000) // Check if device was just created
      }
    }
  });

  if (!existingDevice && user.securitySettings?.loginAlerts) {
    try {
      await sendLoginAlertEmail(user.email, "device_trusted", deviceInfo, user.email);
      await logSecurityEvent(userId, SecurityLogAction.DEVICE_TRUSTED, deviceInfo.ipAddress, deviceInfo.userAgent, 'Login alert sent for new trusted device');
    } catch (error) {
      console.error("Failed to send login alert for device trust:", error);
      await logSecurityEvent(userId, SecurityLogAction.DEVICE_TRUSTED, deviceInfo.ipAddress, deviceInfo.userAgent, 'Failed to send login alert for device trust');
    }
  }

  // Log device trusted
  await logSecurityEvent(userId, SecurityLogAction.DEVICE_TRUSTED, deviceInfo.ipAddress, deviceInfo.userAgent, 'Device marked as trusted');
}

// Remove trusted device
export async function removeTrustedDevice(userId: string, deviceId: string): Promise<void> {
  const device = await prisma.trustedDevice.findFirst({
    where: {
      id: deviceId,
      userId
    }
  });

  if (device) {
    await prisma.trustedDevice.update({
      data: { revokedAt: new Date() },
      where: { id: deviceId },
    });

    await logSecurityEvent(userId, SecurityLogAction.DEVICE_UNTRUSTED, "minimized", undefined, `Device ${device.deviceName} revoked`);
  }
}

// Get all trusted devices for user
export async function getTrustedDevices(userId: string) {
  return prisma.trustedDevice.findMany({
    where: { revokedAt: null, userId },
    orderBy: { lastSeenAt: 'desc' }
  });
}

// Check account lock status
export async function checkAccountLock(userId: string): Promise<{ locked: boolean; reason?: string; unlockTime?: Date }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      accountLockEvents: {
        where: { resolvedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });

  if (!user) {
    return { locked: false };
  }

  // Check if account is locked
  if (user.accountStatus === 'LOCKED' && user.lockedAt) {
    const activeLock = user.accountLockEvents[0];
    if (activeLock) {
      return {
        locked: true,
        reason: activeLock.reason,
        unlockTime: activeLock.resolvedAt || undefined
      };
    }
  }

  return { locked: false };
}

// Lock account
export async function lockAccount(userId: string, reason: string, ipAddress: string, userAgent?: string): Promise<void> {
  const lockDuration = 10; // 10 minutes default
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { securitySettings: true }
  });

  if (!user) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      accountStatus: 'LOCKED',
      lockedAt: new Date(),
      lockedReason: reason
    }
  });

  await prisma.accountLockEvent.create({
    data: {
      userId,
      reason,
      ipAddress,
      userAgent
    }
  });

  // Send login alert if enabled
  if (user.securitySettings?.loginAlerts) {
    try {
      await sendLoginAlertEmail(user.email, "account_locked", { ipAddress, userAgent }, user.email);
      await logSecurityEvent(userId, SecurityLogAction.ACCOUNT_LOCKED, ipAddress, userAgent, `Login alert sent for account lock: ${reason}`);
    } catch (error) {
      console.error("Failed to send login alert for account lock:", error);
      await logSecurityEvent(userId, SecurityLogAction.ACCOUNT_LOCKED, ipAddress, userAgent, `Failed to send login alert for account lock: ${reason}`);
    }
  }

  // Schedule unlock
  setTimeout(async () => {
    await unlockAccount(userId);
  }, lockDuration * 60 * 1000);

  await logSecurityEvent(userId, SecurityLogAction.ACCOUNT_LOCKED, ipAddress, userAgent, `Account locked: ${reason}`);
}

// Unlock account
export async function unlockAccount(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      accountStatus: 'ACTIVE',
      lockedAt: null,
      lockedReason: null
    }
  });

  await prisma.accountLockEvent.updateMany({
    where: {
      userId,
      resolvedAt: null
    },
    data: {
      resolvedAt: new Date()
    }
  });

  await logSecurityEvent(userId, SecurityLogAction.ACCOUNT_UNLOCKED, '', '', 'Account automatically unlocked');
}

// Track failed login attempts
export async function trackFailedLogin(email: string, ipAddress: string, userAgent?: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { securitySettings: true }
  });

  if (!user) return;

  // Count recent failed attempts
  const recentFailures = await prisma.loginAttempt.count({
    where: {
      email,
      success: false,
      createdAt: {
        gte: addMinutes(new Date(), -30) // Last 30 minutes
      }
    }
  });

  // Create failed attempt record
  await prisma.loginAttempt.create({
    data: { email, ipAddress, success: false, reason: "bad_password" }
  });

  // Send login alert if threshold reached and alerts enabled
  if (recentFailures >= 3 && user.securitySettings?.loginAlerts) {
    try {
      await sendLoginAlertEmail(email, "failed_login_attempts", { ipAddress, userAgent }, email);
      await logSecurityEvent(user.id, SecurityLogAction.LOGIN_FAILED, ipAddress, userAgent, `Login alert sent for ${recentFailures + 1} failed attempts`);
    } catch (error) {
      console.error("Failed to send login alert for failed attempts:", error);
      await logSecurityEvent(user.id, SecurityLogAction.LOGIN_FAILED, ipAddress, userAgent, `Failed to send login alert for ${recentFailures + 1} failed attempts`);
    }
  }

  // Check if account should be locked
  if (recentFailures >= 4) { // 5th attempt triggers lock
    await lockAccount(user.id, 'Too many failed login attempts', ipAddress, userAgent);
  }

  await logSecurityEvent(user.id, SecurityLogAction.LOGIN_FAILED, ipAddress, userAgent, `Failed login attempt ${recentFailures + 1}/5`);
}

// Advanced security check for login
export async function performSecurityCheck(context: LoginContext): Promise<SecurityCheckResult> {
  const { userId, email, deviceInfo } = context;
  const settings = await getSecuritySettings(userId);
  
  // Check account lock first
  const lockCheck = await checkAccountLock(userId);
  if (lockCheck.locked) {
    return {
      allowed: false,
      reason: lockCheck.reason || 'Account temporarily locked'
    };
  }

  const hashes = deviceHashes(deviceInfo);
  const isTrusted = await isDeviceTrusted(userId, deviceInfo);

  if (isTrusted) {
    return { allowed: true };
  }

  // New or untrusted device
  if (settings.suspiciousLoginDetection) {
    const existingApproval = await prisma.pendingLoginApproval.findFirst({
      orderBy: { createdAt: "desc" },
      where: {
        approvedAt: null,
        deviceFingerprintHash: hashes.deviceFingerprintHash,
        expiresAt: { gt: new Date() },
        ipHash: hashes.ipHash,
        rejectedAt: null,
        userId,
      },
    });

    if (existingApproval) {
      await logSecurityEvent(userId, SecurityLogAction.NEW_DEVICE_DETECTED, deviceInfo.ipAddress, deviceInfo.userAgent, "New device login blocked; approval already pending", SecurityLogSeverity.WARNING);
      return {
        allowed: false,
        requiresApproval: true,
        isNewDevice: true,
        reason: 'New device detected - approval required'
      };
    }

    // Create pending approval
    const approvalToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(approvalToken);
    
    await prisma.pendingLoginApproval.create({
      data: {
        deviceFingerprintHash: hashes.deviceFingerprintHash,
        deviceName: deviceInfo.deviceName || 'Unknown Device',
        expiresAt: addMinutes(new Date(), 15), // 15 minutes approval window
        ipHash: hashes.ipHash,
        tokenHash,
        userAgentHash: hashes.userAgentHash,
        userId,
      }
    });

    // Send approval email
    await sendLoginApprovalEmail(email, deviceInfo, approvalToken);

    await logSecurityEvent(userId, SecurityLogAction.NEW_DEVICE_DETECTED, deviceInfo.ipAddress, deviceInfo.userAgent, 'New device login blocked pending approval', SecurityLogSeverity.WARNING);
    await logSecurityEvent(userId, SecurityLogAction.LOGIN_APPROVAL_REQUESTED, deviceInfo.ipAddress, deviceInfo.userAgent, 'New device login approval requested');
    await logSecurityEvent(userId, SecurityLogAction.APPROVAL_EMAIL_SENT, deviceInfo.ipAddress, deviceInfo.userAgent, 'New device approval email sent');

    return {
      allowed: false,
      requiresApproval: true,
      approvalToken,
      isNewDevice: true,
      reason: 'New device detected - approval required'
    };
  }

  // If suspicious detection is disabled, allow but log
  await logSecurityEvent(userId, SecurityLogAction.NEW_DEVICE_LOGIN, deviceInfo.ipAddress, deviceInfo.userAgent, 'Login from new device (suspicious detection disabled)');
  
  if (settings.loginAlerts) {
    await sendLoginAlertEmail(email, "new_device_login", deviceInfo, email);
  }

  return { allowed: true, isNewDevice: true };
}

// Approve pending login
export async function approveLogin(approvalToken: string): Promise<{ success: boolean; sessionToken?: string; error?: string }> {
  const tokenHash = hashToken(approvalToken);
  
  const pending = await prisma.pendingLoginApproval.findFirst({
    where: {
      tokenHash,
      approvedAt: null,
      rejectedAt: null,
      expiresAt: {
        gt: new Date()
      }
    },
    include: {
      user: true
    }
  });

  if (!pending) {
    return { success: false, error: 'Invalid or expired approval token' };
  }

  // Mark as approved
  await prisma.pendingLoginApproval.update({
    where: { id: pending.id },
    data: { approvedAt: new Date() }
  });

  await prisma.trustedDevice.upsert({
    where: {
      userId_deviceFingerprintHash_ipHash: {
        deviceFingerprintHash: pending.deviceFingerprintHash,
        ipHash: pending.ipHash,
        userId: pending.userId,
      },
    },
    update: {
      deviceName: pending.deviceName,
      lastSeenAt: new Date(),
      revokedAt: null,
      trustedAt: new Date(),
      userAgentHash: pending.userAgentHash,
    },
    create: {
      deviceFingerprintHash: pending.deviceFingerprintHash,
      deviceName: pending.deviceName,
      ipHash: pending.ipHash,
      userAgentHash: pending.userAgentHash,
      userId: pending.userId,
    },
  });

  await logSecurityEvent(pending.userId, SecurityLogAction.LOGIN_APPROVED, "minimized", undefined, 'Device approved via email');

  return { success: true };
}

// Reject pending login
export async function rejectLogin(approvalToken: string): Promise<{ success: boolean; error?: string }> {
  const tokenHash = hashToken(approvalToken);
  
  const pending = await prisma.pendingLoginApproval.findFirst({
    where: {
      tokenHash,
      approvedAt: null,
      rejectedAt: null,
      expiresAt: {
        gt: new Date()
      }
    }
  });

  if (!pending) {
    return { success: false, error: 'Invalid or expired approval token' };
  }

  // Mark as rejected
  await prisma.pendingLoginApproval.update({
    where: { id: pending.id },
    data: { rejectedAt: new Date() }
  });

  await logSecurityEvent(pending.userId, SecurityLogAction.LOGIN_REJECTED, "minimized", undefined, 'Login rejected via email');

  return { success: true };
}

// Calculate security score
export async function calculateSecurityScore(userId: string): Promise<SecurityScore> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      vault: true,
      trustedDevices: { where: { revokedAt: null } },
      securityLogs: {
        where: {
          action: SecurityLogAction.LOGIN_FAILED,
          createdAt: {
            gte: addDays(new Date(), -30)
          }
        }
      }
    }
  });

  if (!user) {
    return {
      total: 0,
      breakdown: {
        emailVerified: 0,
        tfaEnabled: 0,
        vaultCreated: 0,
        trustedDevice: 0,
        noFailedAttempts: 0,
        strongPassword: 0
      }
    };
  }

  let score = 0;
  const breakdown = {
    emailVerified: 0,
    tfaEnabled: 0,
    vaultCreated: 0,
    trustedDevice: 0,
    noFailedAttempts: 0,
    strongPassword: 0
  };

  // Email verified (+20)
  if (user.emailVerifiedAt) {
    score += 20;
    breakdown.emailVerified = 20;
  }

  // 2FA enabled (+20)
  if (user.email2faEnabled) {
    score += 20;
    breakdown.tfaEnabled = 20;
  }

  // Vault created (+20)
  if (user.vault) {
    score += 20;
    breakdown.vaultCreated = 20;
  }

  // Trusted devices (+15)
  if (user.trustedDevices.length > 0) {
    score += 15;
    breakdown.trustedDevice = 15;
  }

  // No failed attempts recently (+15)
  if (user.securityLogs.length === 0) {
    score += 15;
    breakdown.noFailedAttempts = 15;
  }

  // Strong password (basic check) (+10)
  if (user.passwordHash && user.passwordHash.length > 100) { // Argon2 hashes are long
    score += 10;
    breakdown.strongPassword = 10;
  }

  return {
    total: Math.min(score, 100),
    breakdown
  };
}

// Log security event
export async function logSecurityEvent(
  userId: string,
  action: SecurityLogAction,
  ipAddress: string,
  userAgent?: string,
  details?: string,
  severity: SecurityLogSeverity = SecurityLogSeverity.INFO
): Promise<void> {
  await prisma.securityLog.create({
    data: {
      userId,
      action,
      ipAddress,
      userAgent,
      details,
      severity
    }
  });
}

// Get security logs
export async function getSecurityLogs(userId: string, limit: number = 50, offset: number = 0) {
  return prisma.securityLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset
  });
}

// Get pending login approvals
export async function getPendingLoginApprovals(userId: string) {
  return prisma.pendingLoginApproval.findMany({
    where: {
      userId,
      approvedAt: null,
      rejectedAt: null,
      expiresAt: {
        gt: new Date()
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}
