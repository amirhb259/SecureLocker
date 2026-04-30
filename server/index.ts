import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Prisma, SecurityActionType, SecurityEventStatus, SecurityEventType, SecurityLogAction, SecurityLogSeverity } from "@prisma/client";
import { config } from "./config.js";
import { sendApiError, sendApiResponse } from "./http.js";
import { prisma } from "./prisma.js";
import {
  sendAccountDisabledEmail,
  sendAccountDisableCodeEmail,
  sendAccountLockedEmail,
  sendAccountRecoveryEmail,
  sendEmail2faCodeEmail,
  sendEmailChangedEmail,
  sendEmailChangeVerificationCodeEmail,
  sendEmergencyLockSetupCodeEmail,
  sendLoginAlertEmail,
  sendLoginApprovalEmail,
  sendNewIpApprovalEmail,
  sendPasswordResetEmail,
  sendRecoverySuccessEmail,
  sendSecurityQuestionSetupEmail,
  sendSuspiciousLoginEmail,
  sendVerificationEmail,
} from "./email.js";
import { sendAuthPage } from "./responses.js";
import {
  addDays,
  addMinutes,
  createOpaqueToken,
  generate2faCode,
  hash2faCode,
  hashSecurityAnswer,
  hashPassword,
  hashToken,
  signSessionJwt,
  verifySessionJwt,
  verifySecurityAnswer,
  verifyPassword,
} from "./security.js";
import {
  approveLogin,
  calculateSecurityScore,
  getSecurityLogs,
  getSecuritySettings,
  getTrustedDevices,
  logSecurityEvent,
  performSecurityCheck,
  rejectLogin,
  removeTrustedDevice,
  trackFailedLogin,
  trustDevice,
} from "./advanced-security.js";
import {
  accountDisableSchema,
  accountReactivateSchema,
  changePasswordSchema,
  email2faDisableSchema,
  email2faEnableSchema,
  email2faLoginCodeSchema,
  emailChangeCompleteSchema,
  emailChangeSubmitNewSchema,
  emailChangeVerifyCurrentSchema,
  emailSchema,
  loginSchema,
  passwordConfirmationSchema,
  recoveryChallengeSchema,
  recoveryCompleteSchema,
  recoveryStartSchema,
  registerSchema,
  resetPasswordSchema,
  securityQuestionSetupSchema,
  vaultActivitySchema,
  vaultCredentialSchema,
  vaultEnvelopeSchema,
  vaultSetupSchema,
} from "./validators.js";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    origin: (origin, callback) => {
      if (!origin || config.CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by SecureLocker CORS policy.`));
    },
  }),
);
app.use(express.json({ limit: "24kb" }));

const authLimiter = rateLimit({
  handler: (_req, res) => sendApiError(res, 429, "TOO_MANY_ATTEMPTS", "Too many attempts, please try again later."),
  legacyHeaders: false,
  limit: 20,
  standardHeaders: true,
  windowMs: 15 * 60_000,
});

const strictLimiter = rateLimit({
  handler: (_req, res) => sendApiError(res, 429, "TOO_MANY_ATTEMPTS", "Too many attempts, please try again later."),
  legacyHeaders: false,
  limit: 20,
  standardHeaders: true,
  windowMs: 15 * 60_000,
});

const loginLimiter = rateLimit({
  handler: (_req, res) => sendApiError(res, 429, "TOO_MANY_ATTEMPTS", "Too many attempts, please try again later."),
  legacyHeaders: false,
  limit: 60,
  standardHeaders: true,
  windowMs: 15 * 60_000,
});

const loginWindowMinutes = 15;
const maxFailedLoginsPerAccount = 12;
const maxFailedLoginsPerIp = 60;
const maxPendingNewIpAttempts = 6;
const resendCooldownSeconds = 60;

function clientIp(req: express.Request) {
  const rawIp = req.ips?.[0] || req.ip || req.socket.remoteAddress || "unknown";
  return normalizeIpAddress(rawIp);
}

function clientUserAgent(req: express.Request) {
  return req.get("user-agent")?.slice(0, 512);
}

function clientDeviceFingerprint(req: express.Request) {
  return req.get("x-securelocker-device-fingerprint")?.slice(0, 512);
}

function clientDeviceName(userAgent: string | undefined) {
  if (!userAgent) return "Unknown Device";
  if (userAgent.includes("Edg/")) return "Microsoft Edge";
  if (userAgent.includes("Chrome/")) return "Chrome";
  if (userAgent.includes("Firefox/")) return "Firefox";
  if (userAgent.includes("Safari/")) return "Safari";
  return "Unknown Browser";
}

function normalizeIpAddress(value: string) {
  let ipAddress = value.trim().toLowerCase();
  const loopbackIp = ["127", "0", "0", "1"].join(".");
  const loopbackName = ["local", "host"].join("");

  if (!ipAddress || ipAddress === "unknown") {
    return "unknown";
  }

  if (ipAddress.includes(",")) {
    ipAddress = ipAddress.split(",")[0].trim();
  }

  if (ipAddress.startsWith("[") && ipAddress.includes("]")) {
    ipAddress = ipAddress.slice(1, ipAddress.indexOf("]"));
  }

  if (ipAddress.startsWith("::ffff:")) {
    ipAddress = ipAddress.slice(7);
  }

  if (ipAddress === "::1" || ipAddress === "0:0:0:0:0:0:0:1" || ipAddress === loopbackName) {
    return loopbackIp;
  }

  return ipAddress;
}

function ipLookupValues(ipAddress: string) {
  const normalized = normalizeIpAddress(ipAddress);
  const loopbackIp = ["127", "0", "0", "1"].join(".");
  const loopbackName = ["local", "host"].join("");
  if (normalized === loopbackIp) {
    return [loopbackIp, "::1", `::ffff:${loopbackIp}`, "0:0:0:0:0:0:0:1", loopbackName];
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
    return [normalized, `::ffff:${normalized}`];
  }
  return Array.from(new Set([normalized, ipAddress]));
}

function publicUser(user: { email: string; emailVerifiedAt: Date | null; id: string; lockedAt?: Date | null; username: string }) {
  return {
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    id: user.id,
    locked: Boolean(user.lockedAt),
    username: user.username,
  };
}

type AuthContext = {
  sessionId: string;
  user: {
    accountStatus: string;
    email: string;
    emailVerifiedAt: Date | null;
    id: string;
    lockedAt: Date | null;
    username: string;
  };
};

type AuthenticatedRequest = express.Request & { auth: AuthContext };

const requireAuth: express.RequestHandler = async (req, res, next) => {
  try {
    const header = req.get("authorization") ?? "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Authentication is required.");
      return;
    }

    const payload = verifySessionJwt(token);
    const session = await prisma.session.findUnique({
      include: {
        user: {
          select: {
            accountStatus: true,
            email: true,
            emailVerifiedAt: true,
            id: true,
            lockedAt: true,
            username: true,
          },
        },
      },
      where: { id: payload.sessionId },
    });

    if (!session || session.userId !== payload.userId || session.revokedAt || session.expiresAt <= new Date()) {
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Session expired. Sign in again.");
      return;
    }

    if (session.user.lockedAt) {
      sendApiError(res, 423, "ACCOUNT_LOCKED", "SecureLocker locked this account. Use recovery before continuing.");
      return;
    }

    if (session.user.accountStatus === "DEACTIVATED") {
      sendApiError(res, 423, "ACCOUNT_DEACTIVATED", "This account has been deactivated. Use reactivation to restore access.");
      return;
    }

    await prisma.session.update({
      data: { lastUsedAt: new Date() },
      where: { id: session.id },
    });

    (req as AuthenticatedRequest).auth = {
      sessionId: session.id,
      user: session.user,
    };
    next();
  } catch {
    sendApiError(res, 401, "INVALID_CREDENTIALS", "Session expired. Sign in again.");
  }
};

async function issueVerificationToken(userId: string) {
  const token = createOpaqueToken();
  await prisma.emailVerificationToken.create({
    data: {
      expiresAt: addMinutes(new Date(), 30),
      tokenHash: hashToken(token),
      userId,
    },
  });
  return token;
}

async function issueSecurityActionTokens(userId: string, eventId: string) {
  const trustToken = createOpaqueToken();
  const secureToken = createOpaqueToken();
  const expiresAt = addMinutes(new Date(), 20);

  await prisma.securityActionToken.createMany({
    data: [
      {
        action: SecurityActionType.TRUST_IP,
        eventId,
        expiresAt,
        tokenHash: hashToken(trustToken),
        userId,
      },
      {
        action: SecurityActionType.SECURE_ACCOUNT,
        eventId,
        expiresAt,
        tokenHash: hashToken(secureToken),
        userId,
      },
    ],
  });

  return { secureToken, trustToken };
}

async function lockAccount(userId: string, ipAddress: string, userAgent: string | undefined, reason: string) {
  const lockedAt = new Date();
  await prisma.$transaction([
    prisma.user.update({
      data: { lockedAt, lockedReason: reason },
      where: { id: userId },
    }),
    prisma.session.updateMany({
      data: { revokedAt: lockedAt },
      where: { revokedAt: null, userId },
    }),
    prisma.securityEvent.create({
      data: {
        action: reason,
        ipAddress,
        resolvedAt: lockedAt,
        status: SecurityEventStatus.LOCKED,
        type: SecurityEventType.ACCOUNT_LOCKED,
        userAgent,
        userId,
      },
    }),
    prisma.accountLockEvent.create({
      data: {
        ipAddress,
        reason,
        userAgent,
        userId,
      },
    }),
  ]);
}

async function issueQuestionSetupToken(userId: string) {
  const token = createOpaqueToken();
  await prisma.securityQuestionSetupToken.create({
    data: {
      expiresAt: addMinutes(new Date(), 45),
      tokenHash: hashToken(token),
      userId,
    },
  });
  return token;
}

async function issueAccountRecoveryToken(userId: string) {
  const token = createOpaqueToken();
  await prisma.accountRecoveryToken.create({
    data: {
      expiresAt: addMinutes(new Date(), 20),
      tokenHash: hashToken(token),
      userId,
    },
  });
  return token;
}

async function hasSecurityQuestions(userId: string) {
  const count = await prisma.userSecurityQuestion.count({ where: { userId } });
  return count === 3;
}

async function trustIpForUser(
  userId: string,
  ipAddress: string,
  userAgent: string | undefined,
  options: { client?: Prisma.TransactionClient | typeof prisma; firstSeenAt?: Date; trustedAt?: Date } = {},
) {
  const db = options.client ?? prisma;
  const normalizedIp = normalizeIpAddress(ipAddress);
  const trustedAt = options.trustedAt ?? new Date();
  const existingTrustedIp = await db.trustedIp.findFirst({
    where: { ipAddress: { in: ipLookupValues(normalizedIp) }, userId },
  });

  if (existingTrustedIp) {
    await db.trustedIp.update({
      data: { lastSeenAt: trustedAt, trustedAt, userAgent },
      where: { id: existingTrustedIp.id },
    });
    return;
  }

  await db.trustedIp.create({
    data: {
      firstSeenAt: options.firstSeenAt ?? trustedAt,
      ipAddress: normalizedIp,
      lastSeenAt: trustedAt,
      trustedAt,
      userAgent,
      userId,
    },
  });
}

async function isLoginThrottled(email: string, ipAddress: string) {
  const since = addMinutes(new Date(), -loginWindowMinutes);
  const credentialFailureReasons = ["bad_password", "not_found", "rate_limited"];
  const [accountFailures, ipFailures] = await Promise.all([
    prisma.loginAttempt.count({
      where: {
        createdAt: { gt: since },
        email,
        reason: { in: credentialFailureReasons },
        success: false,
      },
    }),
    prisma.loginAttempt.count({
      where: {
        createdAt: { gt: since },
        ipAddress,
        reason: { in: credentialFailureReasons },
        success: false,
      },
    }),
  ]);

  return accountFailures >= maxFailedLoginsPerAccount || ipFailures >= maxFailedLoginsPerIp;
}

function retryAfterSeconds(createdAt: Date) {
  const elapsedSeconds = Math.floor((Date.now() - createdAt.getTime()) / 1000);
  return Math.max(1, resendCooldownSeconds - elapsedSeconds);
}

async function verificationCooldown(userId: string) {
  const token = await prisma.emailVerificationToken.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
    where: {
      createdAt: { gt: addMinutes(new Date(), -1) },
      expiresAt: { gt: new Date() },
      usedAt: null,
      userId,
    },
  });
  return token ? retryAfterSeconds(token.createdAt) : null;
}

async function passwordResetCooldown(userId: string) {
  const token = await prisma.passwordResetToken.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
    where: {
      createdAt: { gt: addMinutes(new Date(), -1) },
      expiresAt: { gt: new Date() },
      usedAt: null,
      userId,
    },
  });
  return token ? retryAfterSeconds(token.createdAt) : null;
}

async function accountRecoveryCooldown(userId: string) {
  const token = await prisma.accountRecoveryToken.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
    where: {
      createdAt: { gt: addMinutes(new Date(), -1) },
      expiresAt: { gt: new Date() },
      usedAt: null,
      userId,
    },
  });
  return token ? retryAfterSeconds(token.createdAt) : null;
}

async function email2faCodeCooldown(userId: string, purpose: string) {
  const code = await prisma.email2faCode.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
    where: {
      createdAt: { gt: addMinutes(new Date(), -1) },
      expiresAt: { gt: new Date() },
      purpose,
      usedAt: null,
      userId,
    },
  });
  return code ? retryAfterSeconds(code.createdAt) : null;
}

async function requireTrustedIp(user: { email: string; id: string }, ipAddress: string, userAgent: string | undefined) {
  const normalizedIp = normalizeIpAddress(ipAddress);
  const trustedIp = await prisma.trustedIp.findFirst({
    where: { ipAddress: { in: ipLookupValues(normalizedIp) }, userId: user.id },
  });

  if (trustedIp) {
    await prisma.trustedIp.update({
      data: { lastSeenAt: new Date(), userAgent },
      where: { id: trustedIp.id },
    });
    return { trusted: true as const };
  }

  const trustedIpCount = await prisma.trustedIp.count({ where: { userId: user.id } });

  const existingEvent = await prisma.securityEvent.findFirst({
    orderBy: { createdAt: "desc" },
    where: {
      expiresAt: { gt: new Date() },
      ipAddress: { in: ipLookupValues(normalizedIp) },
      status: SecurityEventStatus.PENDING,
      type: SecurityEventType.NEW_IP_LOGIN,
      userId: user.id,
    },
  });

  if (existingEvent) {
    const nextAttemptCount = existingEvent.attemptCount + 1;
    await prisma.securityEvent.update({
      data: { attemptCount: nextAttemptCount, userAgent },
      where: { id: existingEvent.id },
    });

    if (nextAttemptCount >= maxPendingNewIpAttempts) {
      await lockAccount(user.id, ipAddress, userAgent, "untrusted_ip_repeated_access");
      await sendAccountLockedEmail(user.email, ipAddress, userAgent);
      return { locked: true as const };
    }

    return { pending: true as const };
  }

  const securityEvent = await prisma.securityEvent.create({
    data: {
      expiresAt: addMinutes(new Date(), 20),
      ipAddress: normalizedIp,
      status: SecurityEventStatus.PENDING,
      type: SecurityEventType.NEW_IP_LOGIN,
      userAgent,
      userId: user.id,
    },
  });
  const tokens = await issueSecurityActionTokens(user.id, securityEvent.id);
  console.log("Sending new IP approval email to", user.email);
  try {
    await sendNewIpApprovalEmail(user.email, { ipAddress, userAgent, ...tokens });
  } catch (error) {
    console.error("Failed to send new IP approval email", error);
  }

  return { pending: true as const };
}

async function userHasVault(userId: string) {
  return Boolean(await prisma.vault.findUnique({ select: { id: true }, where: { userId } }));
}

async function getVaultOrSend(req: AuthenticatedRequest, res: express.Response) {
  const vault = await prisma.vault.findUnique({ where: { userId: req.auth.user.id } });
  if (!vault) {
    sendApiError(res, 404, "VAULT_NOT_CONFIGURED", "Set up your vault before continuing.");
    return null;
  }
  return vault;
}

function publicVault(vault: {
  createdAt: Date;
  dataKeyNonce: string;
  encryptedDataKey: string;
  id: string;
  kdfIterations: number;
  kdfSalt: string;
  recoveryDataKeyNonce: string;
  recoveryEncryptedDataKey: string;
  updatedAt: Date;
}) {
  return {
    createdAt: vault.createdAt,
    dataKeyNonce: vault.dataKeyNonce,
    encryptedDataKey: vault.encryptedDataKey,
    id: vault.id,
    kdfIterations: vault.kdfIterations,
    kdfSalt: vault.kdfSalt,
    recoveryDataKeyNonce: vault.recoveryDataKeyNonce,
    recoveryEncryptedDataKey: vault.recoveryEncryptedDataKey,
    updatedAt: vault.updatedAt,
  };
}

function publicCredential(credential: { ciphertext: string; createdAt: Date; id: string; nonce: string; updatedAt: Date }) {
  return {
    ciphertext: credential.ciphertext,
    createdAt: credential.createdAt,
    id: credential.id,
    nonce: credential.nonce,
    updatedAt: credential.updatedAt,
  };
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    account_locked: "Account locked",
    bad_password: "Failed login",
    copied: "Password copied",
    created: "Password added",
    deleted: "Password deleted",
    locked: "Vault locked",
    login_success: "Successful login",
    password_changed: "Password changed",
    recovery_rate_limited: "Recovery rate limited",
    revealed: "Password revealed",
    security_question_recovery: "Account recovered",
    security_questions_configured: "Security questions configured",
    unlocked: "Vault unlocked",
    updated: "Password updated",
  };
  return labels[action] ?? action.replace(/_/g, " ");
}

async function collectActivity(userId: string, email: string, limit = 80) {
  const [vaultActivities, loginAttempts, securityEvents, recoveryAttempts, lockEvents] = await Promise.all([
    prisma.vaultActivity.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      where: { userId },
    }),
    prisma.loginAttempt.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      where: { email },
    }),
    prisma.securityEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      where: { userId },
    }),
    prisma.recoveryAttempt.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      where: { userId },
    }),
    prisma.accountLockEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      where: { userId },
    }),
  ]);

  return [
    ...vaultActivities.map((item) => ({
      id: `vault-${item.id}`,
      message: activityLabel(item.action),
      status: "neutral",
      timestamp: item.createdAt,
      type: "vault",
    })),
    ...loginAttempts.map((item) => ({
      id: `login-${item.id}`,
      message: item.success ? "Successful login" : activityLabel(item.reason ?? "login_blocked"),
      status: item.success ? "success" : "warning",
      timestamp: item.createdAt,
      type: "login",
    })),
    ...securityEvents.map((item) => ({
      id: `security-${item.id}`,
      message: activityLabel(item.action ?? item.type.toLowerCase()),
      status: item.status === SecurityEventStatus.LOCKED || item.status === SecurityEventStatus.SUSPICIOUS ? "warning" : "success",
      timestamp: item.createdAt,
      type: "security",
    })),
    ...recoveryAttempts.map((item) => ({
      id: `recovery-${item.id}`,
      message: activityLabel(item.reason ?? "recovery_attempt"),
      status: item.success ? "success" : "warning",
      timestamp: item.createdAt,
      type: "recovery",
    })),
    ...lockEvents.map((item) => ({
      id: `lock-${item.id}`,
      message: activityLabel(item.reason),
      status: item.resolvedAt ? "success" : "warning",
      timestamp: item.createdAt,
      type: "security",
    })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

app.get(["/health", "/api/health"], (_req, res) => {
  res.json({ ok: true, service: "SecureLocker API" });
});

app.get("/api/me", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const [vaultConfigured, securityQuestionCount, user] = await Promise.all([
      userHasVault(authReq.auth.user.id),
      prisma.userSecurityQuestion.count({ where: { userId: authReq.auth.user.id } }),
      prisma.user.findUnique({
        select: { email2faEnabled: true },
        where: { id: authReq.auth.user.id },
      }),
    ]);

    res.json({
      activeSessionId: authReq.auth.sessionId,
      email2faEnabled: user?.email2faEnabled ?? false,
      securityQuestionsConfigured: securityQuestionCount === 3,
      user: publicUser(authReq.auth.user),
      vaultConfigured,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/vault/status", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const vault = await prisma.vault.findUnique({
      include: { _count: { select: { credentials: true } } },
      where: { userId: authReq.auth.user.id },
    });

    if (!vault) {
      res.json({ configured: false, credentialCount: 0, lastActivityAt: null });
      return;
    }

    const lastActivity = await prisma.vaultActivity.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
      where: { userId: authReq.auth.user.id },
    });

    res.json({
      configured: true,
      credentialCount: vault._count.credentials,
      lastActivityAt: lastActivity?.createdAt ?? vault.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/vault/setup", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const input = vaultSetupSchema.parse(req.body);
    const existingVault = await prisma.vault.findUnique({ where: { userId: authReq.auth.user.id } });

    if (existingVault) {
      sendApiError(res, 409, "VAULT_EXISTS", "Vault is already configured.");
      return;
    }

    const vault = await prisma.vault.create({
      data: {
        dataKeyNonce: input.dataKeyNonce,
        encryptedDataKey: input.encryptedDataKey,
        kdfIterations: input.kdfIterations,
        kdfSalt: input.kdfSalt,
        recoveryDataKeyNonce: input.recoveryDataKeyNonce,
        recoveryEncryptedDataKey: input.recoveryEncryptedDataKey,
        userId: authReq.auth.user.id,
      },
    });

    await prisma.vaultActivity.create({
      data: { action: "vault_created", userId: authReq.auth.user.id },
    });

    res.status(201).json({ vault: publicVault(vault) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/vault/envelope", requireAuth, async (req, res, next) => {
  try {
    const vault = await getVaultOrSend(req as AuthenticatedRequest, res);
    if (!vault) return;
    res.json({ vault: publicVault(vault) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/vault/envelope", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const input = vaultEnvelopeSchema.parse(req.body);
    const vault = await prisma.vault.update({
      data: {
        dataKeyNonce: input.dataKeyNonce,
        encryptedDataKey: input.encryptedDataKey,
        recoveryDataKeyNonce: input.recoveryDataKeyNonce,
        recoveryEncryptedDataKey: input.recoveryEncryptedDataKey,
      },
      where: { userId: authReq.auth.user.id },
    });
    await prisma.vaultActivity.create({ data: { action: "vault_password_changed", userId: authReq.auth.user.id } });
    res.json({ vault: publicVault(vault) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      sendApiError(res, 404, "VAULT_NOT_CONFIGURED", "Set up your vault before continuing.");
      return;
    }
    next(error);
  }
});

app.get("/api/vault/credentials", requireAuth, async (req, res, next) => {
  try {
    const vault = await getVaultOrSend(req as AuthenticatedRequest, res);
    if (!vault) return;
    const credentials = await prisma.vaultCredential.findMany({
      orderBy: { updatedAt: "desc" },
      where: { vaultId: vault.id },
    });
    res.json({ credentials: credentials.map(publicCredential) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/vault/credentials", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const input = vaultCredentialSchema.parse(req.body);
    const vault = await getVaultOrSend(authReq, res);
    if (!vault) return;

    const credential = await prisma.$transaction(async (tx) => {
      const created = await tx.vaultCredential.create({
        data: {
          ciphertext: input.ciphertext,
          nonce: input.nonce,
          userId: authReq.auth.user.id,
          vaultId: vault.id,
        },
      });
      await tx.vaultActivity.create({
        data: { action: "created", credentialId: created.id, userId: authReq.auth.user.id },
      });
      return created;
    });

    res.status(201).json({ credential: publicCredential(credential) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/vault/credentials/:id", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const input = vaultCredentialSchema.parse(req.body);
    const credentialId = String(req.params.id);

    const credential = await prisma.$transaction(async (tx) => {
      const existing = await tx.vaultCredential.findFirst({
        where: { id: credentialId, userId: authReq.auth.user.id },
      });
      if (!existing) return null;
      const updated = await tx.vaultCredential.update({
        data: { ciphertext: input.ciphertext, nonce: input.nonce },
        where: { id: existing.id },
      });
      await tx.vaultActivity.create({
        data: { action: "updated", credentialId: updated.id, userId: authReq.auth.user.id },
      });
      return updated;
    });

    if (!credential) {
      sendApiError(res, 404, "NOT_FOUND", "Password entry was not found.");
      return;
    }

    res.json({ credential: publicCredential(credential) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/vault/credentials/:id", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const credentialId = String(req.params.id);
    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.vaultCredential.findFirst({
        where: { id: credentialId, userId: authReq.auth.user.id },
      });
      if (!existing) return false;
      await tx.vaultActivity.create({
        data: { action: "deleted", credentialId: existing.id, userId: authReq.auth.user.id },
      });
      await tx.vaultCredential.delete({ where: { id: existing.id } });
      return true;
    });

    if (!deleted) {
      sendApiError(res, 404, "NOT_FOUND", "Password entry was not found.");
      return;
    }

    res.json({ message: "Password entry deleted." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/vault/activity", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const input = vaultActivitySchema.parse(req.body);
    const credential = input.credentialId
      ? await prisma.vaultCredential.findFirst({
          select: { id: true },
          where: { id: input.credentialId, userId: authReq.auth.user.id },
        })
      : null;

    if (input.credentialId && !credential) {
      sendApiError(res, 404, "NOT_FOUND", "Password entry was not found.");
      return;
    }

    await prisma.vaultActivity.create({
      data: { action: input.action, credentialId: credential?.id, userId: authReq.auth.user.id },
    });
    res.json({ message: "Activity recorded." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard/overview", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await prisma.user.findUnique({
      select: {
        email2faEnabled: true,
        emailVerifiedAt: true,
        id: true,
      },
      where: { id: authReq.auth.user.id },
    });

    const [vaultStatus, latestActivity, hasSecurityQuestionsConfigured] = await Promise.all([
      prisma.vault.findUnique({
        include: { _count: { select: { credentials: true } } },
        where: { userId: authReq.auth.user.id },
      }),
      collectActivity(authReq.auth.user.id, authReq.auth.user.email, 1),
      hasSecurityQuestions(authReq.auth.user.id),
    ]);

    // Real security status calculation
    // Required: email verified, security questions, vault, 2FA enabled
    const emailVerified = Boolean(user?.emailVerifiedAt);
    const vaultConfigured = Boolean(vaultStatus);
    const securityQuestionsConfigured = hasSecurityQuestionsConfigured;
    const email2faEnabled = user?.email2faEnabled ?? false;
    
    // Calculate security status
    let securityStatus: "ready" | "setup_required" | "at_risk" = "setup_required";
    if (emailVerified && securityQuestionsConfigured && vaultConfigured && email2faEnabled) {
      securityStatus = "ready";
    } else if (emailVerified && (securityQuestionsConfigured || vaultConfigured)) {
      securityStatus = "setup_required";
    } else {
      securityStatus = "at_risk";
    }

    res.json({
      email2faEnabled,
      emailVerified,
      lastActivity: latestActivity[0] ?? null,
      securityStatus,
      totalPasswords: vaultStatus?._count.credentials ?? 0,
      vaultConfigured,
      securityQuestionsConfigured,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/security/overview", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await prisma.user.findUnique({
      select: {
        email2faEnabled: true,
        emailVerifiedAt: true,
        id: true,
      },
      where: { id: authReq.auth.user.id },
    });

    const [vaultStatus, latestActivity, hasSecurityQuestionsConfigured, activeSessions, trustedIps] = await Promise.all([
      prisma.vault.findUnique({
        include: { _count: { select: { credentials: true } } },
        where: { userId: authReq.auth.user.id },
      }),
      collectActivity(authReq.auth.user.id, authReq.auth.user.email, 1),
      hasSecurityQuestions(authReq.auth.user.id),
      prisma.session.findMany({
        where: { 
          userId: authReq.auth.user.id,
          expiresAt: { gt: new Date() },
          revokedAt: null 
        },
        select: { id: true, ipAddress: true, userAgent: true, createdAt: true, lastUsedAt: true }
      }),
      prisma.trustedIp.findMany({
        where: { userId: authReq.auth.user.id },
        select: { ipAddress: true, trustedAt: true, lastSeenAt: true }
      })
    ]);

    // Real security status calculation
    const emailVerified = Boolean(user?.emailVerifiedAt);
    const vaultConfigured = Boolean(vaultStatus);
    const securityQuestionsConfigured = hasSecurityQuestionsConfigured;
    const email2faEnabled = user?.email2faEnabled ?? false;
    const totalPasswords = vaultStatus?._count.credentials ?? 0;
    const trustedSessionCount = activeSessions.length;
    const trustedIpCount = trustedIps.length;

    // Enhanced security score calculation (0-100)
    let securityScore = 0;
    const scoreComponents = {
      emailVerified: emailVerified ? 20 : 0,
      email2faEnabled: email2faEnabled ? 20 : 0,
      securityQuestionsConfigured: securityQuestionsConfigured ? 20 : 0,
      vaultConfigured: vaultConfigured ? 20 : 0,
      trustedDevices: trustedSessionCount <= 5 ? (trustedSessionCount > 0 ? 10 : 0) : 5, // Bonus for reasonable device count
      trustedIps: trustedIpCount <= 3 ? (trustedIpCount > 0 ? 10 : 0) : 5, // Bonus for reasonable IP count
    };
    securityScore = Object.values(scoreComponents).reduce((sum, score) => sum + score, 0);

    // Generate detailed recommendations based on missing/weak security features
    const recommendations = [];
    if (!emailVerified) recommendations.push("Verify your email address for account recovery");
    if (!securityQuestionsConfigured) recommendations.push("Set up security questions for account recovery");
    if (!vaultConfigured) recommendations.push("Create an encrypted vault to store passwords securely");
    if (!email2faEnabled) recommendations.push("Enable two-factor authentication for login protection");
    if (vaultConfigured && totalPasswords === 0) recommendations.push("Add your first password to the vault");
    if (trustedSessionCount > 5) recommendations.push("Review and revoke unused trusted sessions");
    if (trustedIpCount > 3) recommendations.push("Review and remove unfamiliar trusted IP addresses");

    // Calculate security status
    let securityStatus: "ready" | "setup_required" | "at_risk" = "setup_required";
    if (emailVerified && securityQuestionsConfigured && vaultConfigured && email2faEnabled) {
      securityStatus = "ready";
    } else if (emailVerified && (securityQuestionsConfigured || vaultConfigured)) {
      securityStatus = "setup_required";
    } else {
      securityStatus = "at_risk";
    }

    // Log security center access and score calculation
    await prisma.securityEvent.create({
      data: {
        action: `security_score_calculated_${securityScore}`,
        ipAddress: "dashboard",
        resolvedAt: new Date(),
        status: securityScore >= 80 ? SecurityEventStatus.TRUSTED : SecurityEventStatus.SUSPICIOUS,
        type: SecurityEventType.SUSPICIOUS_LOGIN,
        userId: authReq.auth.user.id,
      },
    });

    res.json({
      securityScore,
      securityStatus,
      emailVerified,
      securityQuestionsConfigured,
      vaultConfigured,
      email2faEnabled,
      weakPasswordCount: 0, // Will be calculated client-side for encrypted vaults
      reusedPasswordCount: 0, // Will be calculated client-side for encrypted vaults
      oldPasswordCount: 0,   // Will be calculated client-side for encrypted vaults
      vaultEncryptionStatus: vaultConfigured ? "enabled" : "required",
      recommendations,
      scoreComponents,
      trustedSessionCount,
      trustedIpCount,
      totalPasswords,
      lastSecurityScan: latestActivity[0]?.timestamp ?? null,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/security/password-health", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { weakPasswordCount, reusedPasswordCount, oldPasswordCount, totalPasswords } = req.body;

    // Log password health scan completion
    await prisma.securityEvent.create({
      data: {
        action: "password_health_scan_completed",
        ipAddress: "dashboard",
        resolvedAt: new Date(),
        status: SecurityEventStatus.TRUSTED,
        type: SecurityEventType.SUSPICIOUS_LOGIN,
        userId: authReq.auth.user.id,
      },
    });

    // Log specific findings if any
    if (weakPasswordCount > 0) {
      await prisma.securityEvent.create({
        data: {
          action: `weak_passwords_detected_${weakPasswordCount}`,
          ipAddress: "dashboard",
          resolvedAt: new Date(),
          status: SecurityEventStatus.SUSPICIOUS,
          type: SecurityEventType.SUSPICIOUS_LOGIN,
          userId: authReq.auth.user.id,
        },
      });
    }

    if (reusedPasswordCount > 0) {
      await prisma.securityEvent.create({
        data: {
          action: `reused_passwords_detected_${reusedPasswordCount}`,
          ipAddress: "dashboard",
          resolvedAt: new Date(),
          status: SecurityEventStatus.SUSPICIOUS,
          type: SecurityEventType.SUSPICIOUS_LOGIN,
          userId: authReq.auth.user.id,
        },
      });
    }

    res.json({
      message: "Password health analysis recorded",
      weakPasswordCount,
      reusedPasswordCount,
      oldPasswordCount,
      totalPasswords,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/activity", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const activity = await collectActivity(authReq.auth.user.id, authReq.auth.user.email);
    res.json({ activity });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/activity", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const input = passwordConfirmationSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      select: { email: true, id: true, passwordHash: true },
      where: { id: authReq.auth.user.id },
    });

    if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
      sendApiError(res, 400, "INVALID_CREDENTIALS", "Invalid credentials.");
      return;
    }

    const [vaultActivities, loginAttempts, securityActionTokens, securityEvents, recoveryAttempts, accountLockEvents] =
      await prisma.$transaction([
        prisma.vaultActivity.deleteMany({ where: { userId: user.id } }),
        prisma.loginAttempt.deleteMany({ where: { email: user.email } }),
        prisma.securityActionToken.deleteMany({ where: { userId: user.id } }),
        prisma.securityEvent.deleteMany({ where: { userId: user.id } }),
        prisma.recoveryAttempt.deleteMany({ where: { userId: user.id } }),
        prisma.accountLockEvent.deleteMany({ where: { userId: user.id } }),
      ]);

    res.json({
      deletedCount:
        vaultActivities.count +
        loginAttempts.count +
        securityActionTokens.count +
        securityEvents.count +
        recoveryAttempts.count +
        accountLockEvents.count,
      message: "Activity logs permanently deleted.",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sessions", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const sessions = await prisma.session.findMany({
      orderBy: { lastUsedAt: "desc" },
      where: {
        expiresAt: { gt: new Date() },
        revokedAt: null,
        userId: authReq.auth.user.id,
      },
    });

    res.json({
      sessions: sessions.map((session) => ({
        createdAt: session.createdAt,
        current: session.id === authReq.auth.sessionId,
        expiresAt: session.expiresAt,
        id: session.id,
        ipAddress: session.ipAddress,
        lastUsedAt: session.lastUsedAt,
        userAgent: session.userAgent,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions/:id/revoke", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const sessionId = String(req.params.id);

    if (sessionId === authReq.auth.sessionId) {
      sendApiError(res, 400, "CURRENT_SESSION_PROTECTED", "Use sign out to end the current session.");
      return;
    }

    const result = await prisma.session.updateMany({
      data: { revokedAt: new Date() },
      where: { id: sessionId, revokedAt: null, userId: authReq.auth.user.id },
    });

    if (result.count === 0) {
      sendApiError(res, 404, "NOT_FOUND", "Session was not found.");
      return;
    }

    res.json({ message: "Session revoked." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    await prisma.session.update({
      data: { revokedAt: new Date() },
      where: { id: authReq.auth.sessionId },
    });
    res.json({ message: "Signed out." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/register", authLimiter, async (req, res, next) => {
  try {
    const parsedInput = registerSchema.safeParse(req.body);
    if (!parsedInput.success) {
      sendApiError(
        res,
        400,
        "VALIDATION_ERROR",
        parsedInput.error.issues[0]?.message ?? "Submitted details are invalid.",
      );
      return;
    }

    const input = parsedInput.data;
    const ipAddress = clientIp(req);
    const userAgent = clientUserAgent(req);
    const existingUser = await prisma.user.findFirst({
      select: { email: true, username: true },
      where: {
        OR: [{ email: input.email }, { username: { equals: input.username, mode: "insensitive" } }],
      },
    });

    if (existingUser?.email === input.email) {
      sendApiError(res, 409, "ACCOUNT_EXISTS", "Email already in use.");
      return;
    }

    if (existingUser?.username.toLowerCase() === input.username.toLowerCase()) {
      sendApiError(res, 409, "USERNAME_EXISTS", "Username already exists");
      return;
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        username: input.username,
      },
    });

    await trustIpForUser(user.id, ipAddress, userAgent);

    const token = await issueVerificationToken(user.id);
    await sendVerificationEmail(user.email, token);

    res.status(201).json({
      message: "Verification email sent.",
      status: "verification_required",
      user: publicUser(user),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target : [];
      if (target.includes("email")) {
        sendApiError(res, 409, "ACCOUNT_EXISTS", "Email already in use.");
        return;
      }
      if (target.includes("username")) {
        sendApiError(res, 409, "USERNAME_EXISTS", "Username already exists");
        return;
      }
      sendApiError(res, 409, "VALIDATION_ERROR", "Account details conflict with an existing account.");
      return;
    }
    next(error);
  }
});

app.post("/api/auth/login", loginLimiter, async (req, res, next) => {
  const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : undefined;
  try {
    const input = loginSchema.parse(req.body);
    const ipAddress = clientIp(req);
    const userAgent = clientUserAgent(req);

    if (await isLoginThrottled(input.email, ipAddress)) {
      await prisma.loginAttempt.create({
        data: { email: input.email, ipAddress, reason: "rate_limited", success: false },
      });
      sendApiError(res, 429, "TOO_MANY_ATTEMPTS", "Too many attempts, please try again later.");
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: input.email } });

    if (!user) {
      await prisma.loginAttempt.create({
        data: { email: input.email, ipAddress, reason: "not_found", success: false },
      });
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Invalid email or password.");
      return;
    }

    const validPassword = await verifyPassword(user.passwordHash, input.password);
    if (!validPassword) {
      await trackFailedLogin(input.email, ipAddress, userAgent);
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Invalid email or password.");
      return;
    }
    console.log("[LOGIN_STEP_PASSWORD_VALID]", user.email, "| IP:", ipAddress);

    if (user.lockedAt || user.accountStatus === "LOCKED" || user.accountStatus === "EMERGENCY_LOCKED") {
      await prisma.loginAttempt.create({
        data: { email: input.email, ipAddress, reason: "account_locked", success: false },
      });
      await logSecurityEvent(user.id, SecurityLogAction.ACCOUNT_LOCKED, ipAddress, userAgent, "Locked account login blocked", SecurityLogSeverity.WARNING);
      sendApiError(res, 423, "ACCOUNT_LOCKED", "SecureLocker locked this account. Use password recovery before signing in.");
      return;
    }

    if (user.accountStatus === "DEACTIVATED") {
      await prisma.loginAttempt.create({
        data: { email: input.email, ipAddress, reason: "account_deactivated", success: false },
      });
      sendApiError(res, 423, "ACCOUNT_DEACTIVATED", "This account has been deactivated. Use reactivation to restore access.");
      return;
    }

    if (!user.emailVerifiedAt) {
      await prisma.loginAttempt.create({
        data: { email: input.email, ipAddress, reason: "email_unverified", success: false },
      });
      sendApiError(res, 403, "EMAIL_NOT_VERIFIED", "Verify your email before signing in.");
      return;
    }

    if (!(await hasSecurityQuestions(user.id))) {
      const setupToken = await issueQuestionSetupToken(user.id);
      await sendSecurityQuestionSetupEmail(user.email, setupToken);
      await prisma.loginAttempt.create({
        data: { email: input.email, ipAddress, reason: "security_questions_required", success: false },
      });
      sendApiError(res, 403, "SECURITY_QUESTIONS_REQUIRED", "Set up SecureLocker recovery questions before signing in.");
      return;
    }

    const securityResult = await performSecurityCheck({
      deviceInfo: {
        deviceFingerprint: clientDeviceFingerprint(req),
        deviceName: clientDeviceName(userAgent),
        ipAddress,
        userAgent: userAgent ?? "unknown",
      },
      email: user.email,
      userId: user.id,
    });

    console.log("[LOGIN_STEP_DEVICE_TRUST_CHECK]", user.email, "| IP:", ipAddress, "| Result:", securityResult.allowed ? "trusted" : securityResult.reason);
    if (!securityResult.allowed && !securityResult.requiresApproval) {
      await prisma.loginAttempt.create({
        data: { email: input.email, ipAddress, reason: "security_check_blocked", success: false },
      });
      sendApiError(res, 423, "ACCOUNT_LOCKED", securityResult.reason ?? "SecureLocker blocked this sign-in.");
      return;
    }

    if (securityResult.requiresApproval) {
      console.log("[LOGIN_STEP_NEW_DEVICE_APPROVAL_EMAIL_SENT]", user.email, "| IP:", ipAddress, "| Sending approval email, stopping login flow");
      await prisma.loginAttempt.create({
        data: { email: input.email, ipAddress, reason: "new_device_pending", success: false },
      });
      res.status(202).json({
        code: "NEW_DEVICE_APPROVAL_REQUIRED",
        message: "SecureLocker sent a device approval email before this sign-in can continue.",
        status: "new_device_approval_required",
      });
      return;
    }
    console.log("[LOGIN_STEP_DEVICE_TRUSTED]", user.email, "| IP:", ipAddress, "| Device is trusted, checking for 2FA");

    // If 2FA is enabled, create pending session and send code
    // NOTE: This only executes if IP is TRUSTED (untrusted IPs already returned above with approval email)
    if (user.email2faEnabled) {
      console.log("[LOGIN_STEP_2FA_EMAIL_SENT]", user.email, "| IP:", ipAddress, "| Sending 2FA code for trusted device");
      const cooldown = await email2faCodeCooldown(user.id, "login");
      if (cooldown) {
        sendApiError(res, 429, "RESEND_COOLDOWN", `Try again in ${cooldown} seconds.`, { retryAfterSeconds: cooldown });
        return;
      }

      const sessionToken = createOpaqueToken();
      const expiresAt = addMinutes(new Date(), 10);
      
      await prisma.email2faPendingSession.create({
        data: {
          expiresAt,
          ipAddress,
          sessionTokenHash: hashToken(sessionToken),
          userAgent,
          userId: user.id,
        },
      });

      // Generate and send 2FA code
      const code = generate2faCode();
      const codeHash = hash2faCode(code);
      const codeExpiresAt = addMinutes(new Date(), 10);

      await prisma.email2faCode.create({
        data: {
          codeHash,
          expiresAt: codeExpiresAt,
          purpose: "login",
          userId: user.id,
        },
      });

      console.log("Sending 2FA code to", user.email);
      await sendEmail2faCodeEmail(user.email, code, "login");

      await prisma.email2faAuditLog.create({
        data: {
          action: "code_sent",
          details: "Login code sent",
          ipAddress,
          userAgent,
          userId: user.id,
        },
      });

      res.status(202).json({
        code: "2FA_REQUIRED",
        message: "Verification code sent to your email.",
        sessionToken,
        status: "2fa_required",
      });
      return;
    }

    console.log("[LOGIN_STEP_SESSION_CREATED]", user.email, "| IP:", ipAddress, "| Creating authenticated session (no 2FA needed)");
    const sessionToken = createOpaqueToken();
    const expiresAt = input.rememberDevice ? addDays(new Date(), 30) : addDays(new Date(), 7);
    const session = await prisma.session.create({
      data: {
        expiresAt,
        ipAddress,
        tokenHash: hashToken(sessionToken),
        userAgent,
        userId: user.id,
      },
    });
    const accessToken = signSessionJwt({ sessionId: session.id, userId: user.id }, input.rememberDevice);

    await prisma.loginAttempt.create({
      data: { email: input.email, ipAddress, success: true },
    });
    await logSecurityEvent(user.id, SecurityLogAction.LOGIN_SUCCESS, ipAddress, userAgent, "Login successful");
    try {
      await sendLoginAlertEmail(user.email, "successful_login", { ipAddress, userAgent }, user.email);
    } catch (error) {
      console.error("Failed to send login alert:", error);
    }
    res.json({ accessToken, sessionToken, user: publicUser(user) });
  } catch (error) {
    if (email) {
      await prisma.loginAttempt.create({
        data: { email, ipAddress: clientIp(req), reason: "validation", success: false },
      });
    }
    next(error);
  }
});

app.get("/api/auth/verify-email", strictLimiter, async (req, res, next) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const tokenHash = hashToken(token);
    const record = await prisma.emailVerificationToken.findUnique({
      include: { user: true },
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      sendAuthPage(res, "Verification link expired", "Request a new SecureLocker verification email from the sign-in screen.");
      return;
    }

    await prisma.$transaction([
      prisma.emailVerificationToken.update({
        data: { usedAt: new Date() },
        where: { id: record.id },
      }),
      prisma.user.update({
        data: { emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() },
        where: { id: record.userId },
      }),
    ]);

    const setupToken = await issueQuestionSetupToken(record.userId);
    await sendSecurityQuestionSetupEmail(record.user.email, setupToken);
    const setupUrl = `${config.FRONTEND_URL}/?questionSetupToken=${encodeURIComponent(setupToken)}`;
    sendAuthPage(res, "Email verified", `Set up recovery questions to finish protecting your account. Continue in SecureLocker: ${setupUrl}`);
  } catch (error) {
    next(error);
  }
});

app.get("/api/security/trust-ip", strictLimiter, async (req, res, next) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const isJson = req.query.json === "true";
    const record = await prisma.securityActionToken.findUnique({
      include: { event: true, user: true },
      where: { tokenHash: hashToken(token) },
    });

    if (
      !record ||
      record.action !== SecurityActionType.TRUST_IP ||
      record.usedAt ||
      record.expiresAt <= new Date() ||
      record.event.status !== SecurityEventStatus.PENDING
    ) {
      if (isJson) {
        res.status(400).json({ success: false, message: "Invalid or expired token" });
      } else {
        sendAuthPage(res, "Security link expired", "Return to SecureLocker and sign in again to request a new security approval.");
      }
      return;
    }

    if (record.user.lockedAt) {
      if (isJson) {
        res.status(400).json({ success: false, message: "Account locked" });
      } else {
        sendAuthPage(res, "Account locked", "Use SecureLocker password recovery before signing in again.");
      }
      return;
    }

    const resolvedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.securityActionToken.updateMany({
        data: { usedAt: resolvedAt },
        where: { eventId: record.eventId, usedAt: null },
      });
      await trustIpForUser(record.userId, record.event.ipAddress, record.event.userAgent ?? undefined, {
        client: tx,
        firstSeenAt: record.event.createdAt,
        trustedAt: resolvedAt,
      });
      await tx.securityEvent.update({
        data: {
          action: "trusted_by_email",
          resolvedAt,
          status: SecurityEventStatus.TRUSTED,
        },
        where: { id: record.eventId },
      });
    });

    if (isJson) {
      res.json({ success: true, message: "IP trusted" });
    } else {
      sendAuthPage(res, "IP trusted", "This IP is now approved for SecureLocker sign-in. Return to the app to continue.");
    }
  } catch (error) {
    next(error);
  }
});

app.get("/api/security/secure-account", strictLimiter, async (req, res, next) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const record = await prisma.securityActionToken.findUnique({
      include: { event: true },
      where: { tokenHash: hashToken(token) },
    });

    if (
      !record ||
      record.action !== SecurityActionType.SECURE_ACCOUNT ||
      record.usedAt ||
      record.expiresAt <= new Date() ||
      record.event.status !== SecurityEventStatus.PENDING
    ) {
      sendAuthPage(res, "Security link expired", "Use SecureLocker password recovery if you need to secure your account.");
      return;
    }

    const resolvedAt = new Date();
    await prisma.$transaction([
      prisma.securityActionToken.updateMany({
        data: { usedAt: resolvedAt },
        where: { eventId: record.eventId, usedAt: null },
      }),
      prisma.securityEvent.update({
        data: {
          action: "reported_by_email",
          resolvedAt,
          status: SecurityEventStatus.SUSPICIOUS,
        },
        where: { id: record.eventId },
      }),
    ]);

    await lockAccount(record.userId, record.event.ipAddress, record.event.userAgent ?? undefined, "user_reported_suspicious_login");

    sendAuthPage(res, "Account secured", "SecureLocker locked the account and revoked active sessions. Use password recovery before signing in again.");
  } catch (error) {
    next(error);
  }
});

app.get("/api/security/questions", strictLimiter, async (_req, res, _next) => {
  try {
    const questions = await prisma.securityQuestion.findMany({
      orderBy: { prompt: "asc" },
      select: { id: true, prompt: true },
      where: { isActive: true },
    });

    if (questions.length < 3) {
      sendApiError(res, 503, "SECURITY_QUESTIONS_UNAVAILABLE", "Security questions are unavailable. Run the database seed and try again.");
      return;
    }

    res.json({ questions });
  } catch (error) {
    console.error(error);
    sendApiError(res, 503, "SECURITY_QUESTIONS_UNAVAILABLE", "Security questions are unavailable. Check database connectivity and seed data.");
  }
});

app.post("/api/security/questions/setup", strictLimiter, async (req, res, next) => {
  try {
    const input = securityQuestionSetupSchema.parse(req.body);
    const record = await prisma.securityQuestionSetupToken.findUnique({
      include: { user: true },
      where: { tokenHash: hashToken(input.token) },
    });

    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      sendApiError(res, 400, "INVALID_SETUP_TOKEN", "Security question setup link is invalid or expired.");
      return;
    }

    const activeQuestions = await prisma.securityQuestion.count({
      where: { id: { in: input.answers.map((item) => item.questionId) }, isActive: true },
    });
    if (activeQuestions !== 3) {
      sendApiError(res, 400, "INVALID_SECURITY_QUESTIONS", "Choose three active security questions.");
      return;
    }

    const answerRows = await Promise.all(
      input.answers.map(async (item) => ({
        answerHash: await hashSecurityAnswer(item.answer),
        questionId: item.questionId,
        userId: record.userId,
      })),
    );
    const now = new Date();
    await prisma.$transaction([
      prisma.userSecurityQuestion.deleteMany({ where: { userId: record.userId } }),
      prisma.userSecurityQuestion.createMany({ data: answerRows }),
      prisma.securityQuestionSetupToken.update({ data: { usedAt: now }, where: { id: record.id } }),
      prisma.securityEvent.create({
        data: {
          action: "security_questions_configured",
          ipAddress: "account",
          resolvedAt: now,
          status: SecurityEventStatus.TRUSTED,
          type: SecurityEventType.SUSPICIOUS_LOGIN,
          userId: record.userId,
        },
      }),
    ]);

    res.json({ message: "Security questions configured." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/recovery/start", strictLimiter, async (req, res, next) => {
  try {
    const input = recoveryStartSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    if (user?.emailVerifiedAt && user.lockedAt && (await hasSecurityQuestions(user.id))) {
      const retryAfter = await accountRecoveryCooldown(user.id);
      if (retryAfter) {
        sendApiError(res, 429, "RESEND_COOLDOWN", "Recovery email was sent recently. Try again shortly.", {
          retryAfterSeconds: retryAfter,
        });
        return;
      }

      const token = await issueAccountRecoveryToken(user.id);
      await sendAccountRecoveryEmail(user.email, token);
    }

    res.json({ message: "If recovery is available, SecureLocker sent a recovery email." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/recovery/challenge", strictLimiter, async (req, res, next) => {
  try {
    const input = recoveryChallengeSchema.parse(req.body);
    const record = await prisma.accountRecoveryToken.findUnique({
      include: {
        user: {
          include: {
            securityQuestionAnswers: {
              include: { question: { select: { prompt: true } } },
              orderBy: { createdAt: "asc" },
              select: { id: true, question: { select: { prompt: true } } },
            },
          },
        },
      },
      where: { tokenHash: hashToken(input.token) },
    });

    if (!record || record.usedAt || record.expiresAt <= new Date() || !record.user.lockedAt) {
      sendApiError(res, 400, "INVALID_RECOVERY_TOKEN", "Recovery link is invalid or expired.");
      return;
    }

    res.json({
      questions: record.user.securityQuestionAnswers.map((item) => ({
        id: item.id,
        prompt: item.question.prompt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/recovery/complete", strictLimiter, async (req, res, next) => {
  const ipAddress = clientIp(req);
  const userAgent = clientUserAgent(req);
  try {
    const input = recoveryCompleteSchema.parse(req.body);
    const record = await prisma.accountRecoveryToken.findUnique({
      include: {
        user: {
          include: {
            securityQuestionAnswers: {
              orderBy: { createdAt: "asc" },
              select: { answerHash: true },
            },
          },
        },
      },
      where: { tokenHash: hashToken(input.token) },
    });

    if (!record || record.usedAt || record.expiresAt <= new Date() || !record.user.lockedAt) {
      sendApiError(res, 400, "INVALID_RECOVERY_TOKEN", "Recovery link is invalid or expired.");
      return;
    }

    const recentFailures = await prisma.recoveryAttempt.count({
      where: {
        createdAt: { gt: addMinutes(new Date(), -30) },
        success: false,
        userId: record.userId,
      },
    });
    if (recentFailures >= 5) {
      await prisma.recoveryAttempt.create({
        data: { ipAddress, reason: "recovery_rate_limited", success: false, tokenId: record.id, userAgent, userId: record.userId },
      });
      sendApiError(res, 429, "RECOVERY_LOCKED", "Recovery is temporarily locked after repeated failed attempts.");
      return;
    }

    const configuredAnswers = record.user.securityQuestionAnswers;
    const checks = await Promise.all(
      configuredAnswers.map((item, index) => verifySecurityAnswer(item.answerHash, input.answers[index] ?? "")),
    );

    if (checks.some((valid) => !valid)) {
      await prisma.recoveryAttempt.create({
        data: { ipAddress, reason: "answer_mismatch", success: false, tokenId: record.id, userAgent, userId: record.userId },
      });
      sendApiError(res, 401, "RECOVERY_FAILED", "Recovery answers did not match.");
      return;
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.accountRecoveryToken.update({ data: { usedAt: now }, where: { id: record.id } }),
      prisma.user.update({ data: { lockedAt: null, lockedReason: null }, where: { id: record.userId } }),
      prisma.session.updateMany({ data: { revokedAt: now }, where: { revokedAt: null, userId: record.userId } }),
      prisma.accountLockEvent.updateMany({
        data: { resolvedAt: now },
        where: { resolvedAt: null, userId: record.userId },
      }),
      prisma.recoveryAttempt.create({
        data: { ipAddress, reason: "security_questions_verified", success: true, tokenId: record.id, userAgent, userId: record.userId },
      }),
      prisma.securityEvent.create({
        data: {
          action: "security_question_recovery",
          ipAddress,
          resolvedAt: now,
          status: SecurityEventStatus.TRUSTED,
          type: SecurityEventType.ACCOUNT_LOCKED,
          userAgent,
          userId: record.userId,
        },
      }),
    ]);
    await sendRecoverySuccessEmail(record.user.email, ipAddress, userAgent);
    res.json({ message: "Account recovery complete. SecureLocker access is unlocked." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/resend-verification", strictLimiter, async (req, res, next) => {
  try {
    const input = emailSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    if (!user || user.emailVerifiedAt) {
      res.json({ message: "If verification is required, an email has been sent." });
      return;
    }

    const retryAfter = await verificationCooldown(user.id);
    if (retryAfter) {
      sendApiError(res, 429, "RESEND_COOLDOWN", "Verification email was sent recently. Try again shortly.", {
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    const token = await issueVerificationToken(user.id);
    await sendVerificationEmail(user.email, token);
    res.json({ message: "Verification email sent." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/forgot-password", strictLimiter, async (req, res, next) => {
  try {
    const input = emailSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    if (user?.emailVerifiedAt) {
      const retryAfter = await passwordResetCooldown(user.id);
      if (retryAfter) {
        sendApiError(res, 429, "RESEND_COOLDOWN", "Password reset email was sent recently. Try again shortly.", {
          retryAfterSeconds: retryAfter,
        });
        return;
      }

      const token = createOpaqueToken();
      await prisma.passwordResetToken.create({
        data: {
          expiresAt: addMinutes(new Date(), 20),
          tokenHash: hashToken(token),
          userId: user.id,
        },
      });
      await sendPasswordResetEmail(user.email, token);
    }

    res.json({ message: "If the account exists, a password reset email has been sent." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/reset-password", strictLimiter, async (req, res, next) => {
  try {
    const input = resetPasswordSchema.parse(req.body);
    const tokenHash = hashToken(input.token);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      sendApiError(res, 400, "INVALID_RESET_TOKEN", "Password reset link is invalid or expired.");
      return;
    }

    const passwordHash = await hashPassword(input.password);
    await prisma.$transaction([
      prisma.passwordResetToken.update({ data: { usedAt: new Date() }, where: { id: record.id } }),
      prisma.user.update({ data: { lockedAt: null, lockedReason: null, passwordHash }, where: { id: record.userId } }),
      prisma.session.updateMany({ data: { revokedAt: new Date() }, where: { userId: record.userId, revokedAt: null } }),
    ]);

    res.json({ message: "Password reset complete." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/change-password", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const input = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: authReq.auth.user.id } });

    if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Current password is incorrect.");
      return;
    }

    const passwordHash = await hashPassword(input.newPassword);
    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({ data: { passwordHash }, where: { id: authReq.auth.user.id } }),
      prisma.session.updateMany({
        data: { revokedAt: now },
        where: { id: { not: authReq.auth.sessionId }, revokedAt: null, userId: authReq.auth.user.id },
      }),
      prisma.securityEvent.create({
        data: {
          action: "password_changed",
          ipAddress: clientIp(req),
          resolvedAt: now,
          status: SecurityEventStatus.TRUSTED,
          type: SecurityEventType.SUSPICIOUS_LOGIN,
          userAgent: clientUserAgent(req),
          userId: authReq.auth.user.id,
        },
      }),
    ]);

    res.json({ message: "Password changed. Other sessions were revoked." });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/vault", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const user = await prisma.user.findUnique({ where: { id: authReq.auth.user.id } });

    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Password is incorrect.");
      return;
    }

    await prisma.vault.deleteMany({ where: { userId: authReq.auth.user.id } });
    await prisma.securityEvent.create({
      data: {
        action: "vault_deleted",
        ipAddress: clientIp(req),
        resolvedAt: new Date(),
        status: SecurityEventStatus.TRUSTED,
        type: SecurityEventType.SUSPICIOUS_LOGIN,
        userAgent: clientUserAgent(req),
        userId: authReq.auth.user.id,
      },
    });

    res.json({ message: "Vault data deleted." });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/account", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const user = await prisma.user.findUnique({ where: { id: authReq.auth.user.id } });

    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Password is incorrect.");
      return;
    }

    await prisma.user.delete({ where: { id: authReq.auth.user.id } });
    res.json({ message: "Account scheduled for deletion." });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// EMAIL 2FA ENDPOINTS
// ============================================================================

app.post("/api/2fa/enable/send-code", requireAuth, strictLimiter, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await prisma.user.findUnique({ where: { id: authReq.auth.user.id } });

    if (!user) {
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Authentication is required.");
      return;
    }

    // Check cooldown
    const cooldown = await verificationCooldown(user.id);
    if (cooldown) {
      res.status(429).json({
        code: "RATE_LIMITED",
        message: `Try again in ${cooldown} seconds.`,
        retryAfter: cooldown,
      });
      return;
    }

    // Generate and send code
    const code = generate2faCode();
    const codeHash = hash2faCode(code);
    const expiresAt = addMinutes(new Date(), 10);

    await prisma.email2faCode.create({
      data: {
        codeHash,
        expiresAt,
        purpose: "enable",
        userId: user.id,
      },
    });

    await sendEmail2faCodeEmail(user.email, code, "login");

    await prisma.email2faAuditLog.create({
      data: {
        action: "code_sent",
        details: "2FA enable code sent",
        ipAddress: clientIp(req),
        userAgent: clientUserAgent(req),
        userId: user.id,
      },
    });

    res.json({ message: "Verification code sent to your email." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/2fa/enable/verify-code", requireAuth, strictLimiter, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const input = email2faEnableSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: authReq.auth.user.id } });

    if (!user) {
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Authentication is required.");
      return;
    }

    const codeHash = hash2faCode(input.code);
    const codeRecord = await prisma.email2faCode.findFirst({
      where: {
        codeHash,
        expiresAt: { gt: new Date() },
        purpose: "enable",
        usedAt: null,
        userId: user.id,
      },
    });

    if (!codeRecord) {
      await prisma.email2faAuditLog.create({
        data: {
          action: "code_failed",
          details: "Invalid or expired code",
          ipAddress: clientIp(req),
          userAgent: clientUserAgent(req),
          userId: user.id,
        },
      });
      sendApiError(res, 400, "VALIDATION_ERROR", "Invalid or expired code.");
      return;
    }

    // Mark code as used and enable 2FA
    await prisma.$transaction([
      prisma.email2faCode.update({
        data: { usedAt: new Date() },
        where: { id: codeRecord.id },
      }),
      prisma.user.update({
        data: { email2faEnabled: true },
        where: { id: user.id },
      }),
      prisma.email2faAuditLog.create({
        data: {
          action: "enabled",
          details: "2FA enabled",
          ipAddress: clientIp(req),
          userAgent: clientUserAgent(req),
          userId: user.id,
        },
      }),
    ]);

    res.json({ message: "Two-factor authentication enabled." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/2fa/disable/send-code", requireAuth, strictLimiter, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await prisma.user.findUnique({ where: { id: authReq.auth.user.id } });

    if (!user) {
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Authentication is required.");
      return;
    }

    if (!user.email2faEnabled) {
      sendApiError(res, 400, "2FA_NOT_ENABLED", "Two-factor authentication is not enabled.");
      return;
    }

    // Check cooldown
    const cooldown = await verificationCooldown(user.id);
    if (cooldown) {
      res.status(429).json({
        code: "RATE_LIMITED",
        message: `Try again in ${cooldown} seconds.`,
        retryAfter: cooldown,
      });
      return;
    }

    // Generate and send code
    const code = generate2faCode();
    const codeHash = hash2faCode(code);
    const expiresAt = addMinutes(new Date(), 10);

    await prisma.email2faCode.create({
      data: {
        codeHash,
        expiresAt,
        purpose: "disable",
        userId: user.id,
      },
    });

    await sendEmail2faCodeEmail(user.email, code, "disable");

    await prisma.email2faAuditLog.create({
      data: {
        action: "code_sent",
        details: "2FA disable code sent",
        ipAddress: clientIp(req),
        userAgent: clientUserAgent(req),
        userId: user.id,
      },
    });

    res.json({ message: "Verification code sent to your email." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/2fa/disable/verify-code", requireAuth, strictLimiter, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const input = email2faDisableSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: authReq.auth.user.id } });

    if (!user) {
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Authentication is required.");
      return;
    }

    if (!user.email2faEnabled) {
      sendApiError(res, 400, "2FA_NOT_ENABLED", "Two-factor authentication is not enabled.");
      return;
    }

    const codeHash = hash2faCode(input.code);
    const codeRecord = await prisma.email2faCode.findFirst({
      where: {
        codeHash,
        expiresAt: { gt: new Date() },
        purpose: "disable",
        usedAt: null,
        userId: user.id,
      },
    });

    if (!codeRecord) {
      await prisma.email2faAuditLog.create({
        data: {
          action: "code_failed",
          details: "Invalid or expired code",
          ipAddress: clientIp(req),
          userAgent: clientUserAgent(req),
          userId: user.id,
        },
      });
      sendApiError(res, 400, "VALIDATION_ERROR", "Invalid or expired code.");
      return;
    }

    // Mark code as used and disable 2FA
    await prisma.$transaction([
      prisma.email2faCode.update({
        data: { usedAt: new Date() },
        where: { id: codeRecord.id },
      }),
      prisma.user.update({
        data: { email2faEnabled: false },
        where: { id: user.id },
      }),
      prisma.email2faAuditLog.create({
        data: {
          action: "disabled",
          details: "2FA disabled",
          ipAddress: clientIp(req),
          userAgent: clientUserAgent(req),
          userId: user.id,
        },
      }),
    ]);

    res.json({ message: "Two-factor authentication disabled." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/2fa/login/send-code", loginLimiter, async (req, res, next) => {
  try {
    const sessionToken = typeof req.body?.sessionToken === "string" ? req.body.sessionToken : "";
    const sessionTokenHash = hashToken(sessionToken);

    const pendingSession = await prisma.email2faPendingSession.findUnique({
      include: { user: true },
      where: { sessionTokenHash },
    });

    if (!pendingSession || pendingSession.expiresAt <= new Date()) {
      sendApiError(res, 401, "INVALID_SESSION", "Session expired. Sign in again.");
      return;
    }

    // Check cooldown
    const cooldown = await email2faCodeCooldown(pendingSession.userId, "login");
    if (cooldown) {
      res.status(429).json({
        code: "RESEND_COOLDOWN",
        message: `Try again in ${cooldown} seconds.`,
        retryAfterSeconds: cooldown,
      });
      return;
    }

    // Generate and send code
    const code = generate2faCode();
    const codeHash = hash2faCode(code);
    const expiresAt = addMinutes(new Date(), 10);

    await prisma.email2faCode.create({
      data: {
        codeHash,
        expiresAt,
        purpose: "login",
        userId: pendingSession.userId,
      },
    });

    await sendEmail2faCodeEmail(pendingSession.user.email, code, "login");

    await prisma.email2faAuditLog.create({
      data: {
        action: "code_sent",
        details: "Login code sent",
        ipAddress: pendingSession.ipAddress,
        userAgent: pendingSession.userAgent,
        userId: pendingSession.userId,
      },
    });

    res.json({ message: "Verification code sent to your email." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/2fa/login/verify-code", loginLimiter, async (req, res, next) => {
  try {
    const input = email2faLoginCodeSchema.parse(req.body);
    const sessionTokenHash = hashToken(input.sessionToken);

    const pendingSession = await prisma.email2faPendingSession.findUnique({
      include: { user: true },
      where: { sessionTokenHash },
    });

    if (!pendingSession || pendingSession.expiresAt <= new Date()) {
      sendApiError(res, 401, "INVALID_SESSION", "Session expired. Sign in again.");
      return;
    }

    const codeHash = hash2faCode(input.code);
    const codeRecord = await prisma.email2faCode.findFirst({
      where: {
        codeHash,
        expiresAt: { gt: new Date() },
        purpose: "login",
        usedAt: null,
        userId: pendingSession.userId,
      },
    });

    if (!codeRecord) {
      await prisma.email2faAuditLog.create({
        data: {
          action: "code_failed",
          details: "Invalid or expired code",
          ipAddress: pendingSession.ipAddress,
          userAgent: pendingSession.userAgent,
          userId: pendingSession.userId,
        },
      });
      sendApiError(res, 400, "VALIDATION_ERROR", "Invalid or expired code.");
      return;
    }

    // Mark code as used, create session, and clean up pending session
    const sessionToken = createOpaqueToken();
    const expiresAt = addDays(new Date(), 7);
    const session = await prisma.session.create({
      data: {
        expiresAt,
        ipAddress: pendingSession.ipAddress,
        tokenHash: hashToken(sessionToken),
        userAgent: pendingSession.userAgent,
        userId: pendingSession.userId,
      },
    });

    const accessToken = signSessionJwt({ sessionId: session.id, userId: pendingSession.userId }, false);

    await prisma.$transaction([
      prisma.email2faCode.update({
        data: { usedAt: new Date() },
        where: { id: codeRecord.id },
      }),
      prisma.email2faPendingSession.delete({
        where: { id: pendingSession.id },
      }),
      prisma.loginAttempt.create({
        data: {
          email: pendingSession.user.email,
          ipAddress: pendingSession.ipAddress || "unknown",
          success: true,
        },
      }),
      prisma.email2faAuditLog.create({
        data: {
          action: "code_verified",
          details: "Login successful",
          ipAddress: pendingSession.ipAddress,
          userAgent: pendingSession.userAgent,
          userId: pendingSession.userId,
        },
      }),
      prisma.securityLog.create({
        data: {
          action: SecurityLogAction.LOGIN_SUCCESS,
          details: "2FA login successful",
          ipAddress: pendingSession.ipAddress || "unknown",
          userAgent: pendingSession.userAgent,
          userId: pendingSession.userId,
        },
      }),
    ]);

    try {
      await sendLoginAlertEmail(
        pendingSession.user.email,
        "successful_login",
        { ipAddress: pendingSession.ipAddress || "unknown", userAgent: pendingSession.userAgent ?? undefined },
        pendingSession.user.email,
      );
    } catch (error) {
      console.error("Failed to send 2FA login alert:", error);
    }

    res.json({ accessToken, sessionToken, user: publicUser(pendingSession.user) });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof SyntaxError) {
    sendApiError(res, 400, "BAD_JSON", "Request body is invalid.");
    return;
  }

  if (error instanceof Error && "issues" in error) {
    sendApiError(res, 400, "VALIDATION_ERROR", "Submitted details are invalid.");
    return;
  }

  console.error(error);
  sendApiError(res, 500, "SERVER_ERROR", "SecureLocker is temporarily unavailable.");
});

// Advanced Security System Endpoints

// Approve login
app.post("/api/auth/approve-login", strictLimiter, async (req, res, next) => {
  try {
    const { approvalToken } = req.body;
    
    if (!approvalToken || typeof approvalToken !== "string") {
      sendApiError(res, 400, "INVALID_TOKEN", "Approval token is required");
      return;
    }

    const result = await approveLogin(approvalToken);
    
    if (!result.success) {
      sendApiError(res, 400, "APPROVAL_FAILED", result.error || "Failed to approve login");
      return;
    }

    sendApiResponse(res, 200, {
      success: true,
      message: "Login approved successfully"
    });
  } catch (error) {
    next(error);
  }
});

// Reject login
app.post("/api/auth/reject-login", strictLimiter, async (req, res, next) => {
  try {
    const { approvalToken } = req.body;
    
    if (!approvalToken || typeof approvalToken !== "string") {
      sendApiError(res, 400, "INVALID_TOKEN", "Approval token is required");
      return;
    }

    const result = await rejectLogin(approvalToken);
    
    if (!result.success) {
      sendApiError(res, 400, "REJECTION_FAILED", result.error || "Failed to reject login");
      return;
    }

    sendApiResponse(res, 200, {
      success: true,
      message: "Login rejected successfully"
    });
  } catch (error) {
    next(error);
  }
});

// Get security score
app.get("/api/security/score", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.auth.user.id;
    const score = await calculateSecurityScore(userId);
    
    sendApiResponse(res, 200, score);
  } catch (error) {
    next(error);
  }
});

// Get trusted devices
app.get("/api/devices", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.auth.user.id;
    const devices = await getTrustedDevices(userId);
    
    sendApiResponse(res, 200, {
      devices: devices.map((device: any) => ({
        id: device.id,
        deviceName: device.deviceName,
        firstSeenAt: device.firstSeenAt,
        lastSeenAt: device.lastSeenAt,
        trustedAt: device.trustedAt
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Remove trusted device
app.delete("/api/devices/:deviceId", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.auth.user.id;
    const { deviceId } = req.params;
    
    if (!deviceId || typeof deviceId !== "string") {
      sendApiError(res, 400, "INVALID_DEVICE_ID", "Device ID is required");
      return;
    }

    await removeTrustedDevice(userId, deviceId);
    
    sendApiResponse(res, 200, {
      message: "Device removed successfully"
    });
  } catch (error) {
    next(error);
  }
});

// Get security logs
app.get("/api/security/logs", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.auth.user.id;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    
    const logs = await getSecurityLogs(userId, limit, offset);
    
    sendApiResponse(res, 200, {
      logs: logs.map((log: any) => ({
        id: log.id,
        action: log.action,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        details: log.details,
        severity: log.severity,
        createdAt: log.createdAt
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Get security settings
app.get("/api/security/settings", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.auth.user.id;
    const settings = await getSecuritySettings(userId);
    
    sendApiResponse(res, 200, {
      loginAlerts: settings.loginAlerts,
      suspiciousLoginDetection: settings.suspiciousLoginDetection,
      deviceTrustSystem: settings.deviceTrustSystem,
      accountLockProtection: settings.accountLockProtection,
      maxFailedAttempts: settings.maxFailedAttempts,
      lockDurationMinutes: settings.lockDurationMinutes
    });
  } catch (error) {
    next(error);
  }
});

// Update security settings
app.put("/api/security/settings", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.auth.user.id;
    const { 
      loginAlerts, 
      suspiciousLoginDetection, 
      deviceTrustSystem, 
      accountLockProtection,
      maxFailedAttempts,
      lockDurationMinutes
    } = req.body;
    
    const settings = await prisma.securitySettings.update({
      where: { userId },
      data: {
        loginAlerts: loginAlerts !== undefined ? Boolean(loginAlerts) : undefined,
        suspiciousLoginDetection: suspiciousLoginDetection !== undefined ? Boolean(suspiciousLoginDetection) : undefined,
        deviceTrustSystem: deviceTrustSystem !== undefined ? Boolean(deviceTrustSystem) : undefined,
        accountLockProtection: accountLockProtection !== undefined ? Boolean(accountLockProtection) : undefined,
        maxFailedAttempts: maxFailedAttempts !== undefined ? Number(maxFailedAttempts) : undefined,
        lockDurationMinutes: lockDurationMinutes !== undefined ? Number(lockDurationMinutes) : undefined
      }
    });
    
    sendApiResponse(res, 200, {
      message: "Security settings updated successfully"
    });
  } catch (error) {
    next(error);
  }
});

// Account disable routes
app.post("/api/account/disable/send-code", requireAuth, async (req, res, next) => {
  try {
    console.log("[ACCOUNT_DISABLE_SEND_CODE] Request received for user:", (req as AuthenticatedRequest).auth.user.id);
    const authReq = req as AuthenticatedRequest;
    const ipAddress = clientIp(req);
    const userAgent = clientUserAgent(req);

    // Check rate limit (max 3 attempts per hour)
    const recentCodes = await prisma.destructiveActionCode.count({
      where: {
        userId: authReq.auth.user.id,
        action: "account_disable",
        createdAt: { gt: addMinutes(new Date(), -60) },
      },
    });

    if (recentCodes >= 3) {
      sendApiError(res, 429, "TOO_MANY_ATTEMPTS", "Too many disable attempts. Try again later.");
      return;
    }

    // Generate and send code
    const code = generate2faCode();
    const codeHash = hash2faCode(code);
    const expiresAt = addMinutes(new Date(), 10);

    await prisma.destructiveActionCode.create({
      data: {
        action: "account_disable",
        codeHash,
        expiresAt,
        userId: authReq.auth.user.id,
      },
    });

    try {
      await sendAccountDisableCodeEmail(authReq.auth.user.email, code);
    } catch (emailError) {
      console.error("Failed to send account disable code email:", emailError);
      // Don't fail the request if email sending fails, just log it
    }

    // Log security event
    await prisma.securityLog.create({
      data: {
        action: SecurityLogAction.ACCOUNT_LOCKED, // Using ACCOUNT_LOCKED as closest match
        ipAddress,
        userAgent,
        userId: authReq.auth.user.id,
        details: "Account disable code sent",
        severity: SecurityLogSeverity.INFO,
      },
    });

    res.json({ message: "Disable code sent to your email." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/account/disable", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const parsedInput = accountDisableSchema.safeParse(req.body);
    if (!parsedInput.success) {
      sendApiError(res, 400, "VALIDATION_ERROR", parsedInput.error.issues[0]?.message ?? "Invalid input.");
      return;
    }
    const input = parsedInput.data;
    const ipAddress = clientIp(req);
    const userAgent = clientUserAgent(req);

    // Verify password
    const user = await prisma.user.findUnique({
      select: { passwordHash: true },
      where: { id: authReq.auth.user.id },
    });

    if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
      sendApiError(res, 400, "INVALID_CREDENTIALS", "Invalid password.");
      return;
    }

    // Find and verify code
    const codeRecord = await prisma.destructiveActionCode.findFirst({
      where: {
        userId: authReq.auth.user.id,
        action: "account_disable",
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!codeRecord || !(await hash2faCode(input.code) === codeRecord.codeHash)) {
      sendApiError(res, 400, "INVALID_CODE", "Invalid or expired code.");
      return;
    }

    // Mark code as used
    await prisma.destructiveActionCode.update({
      data: { usedAt: new Date() },
      where: { id: codeRecord.id },
    });

    // Disable account
    const disabledAt = new Date();
    await prisma.$transaction([
      prisma.user.update({
        data: {
          accountStatus: "DEACTIVATED",
          lockedAt: disabledAt,
          lockedReason: "user_requested_disable",
        },
        where: { id: authReq.auth.user.id },
      }),
      prisma.session.updateMany({
        data: { revokedAt: disabledAt },
        where: { userId: authReq.auth.user.id, revokedAt: null },
      }),
    ]);

    // Send confirmation email
    await sendAccountDisabledEmail(authReq.auth.user.email, ipAddress, userAgent);

    // Log security event
    await prisma.securityLog.create({
      data: {
        action: SecurityLogAction.ACCOUNT_LOCKED,
        ipAddress,
        userAgent,
        userId: authReq.auth.user.id,
        details: "Account disabled by user",
        severity: SecurityLogSeverity.WARNING,
      },
    });

    res.json({ message: "Account disabled successfully." });
  } catch (error) {
    next(error);
  }
});

// Account reactivation route
app.post("/api/account/reactivate", strictLimiter, async (req, res, next) => {
  try {
    const parsedInput = accountReactivateSchema.safeParse(req.body);
    if (!parsedInput.success) {
      sendApiError(res, 400, "VALIDATION_ERROR", parsedInput.error.issues[0]?.message ?? "Invalid input.");
      return;
    }
    const input = parsedInput.data;
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { securityQuestionAnswers: { include: { question: true } } },
    });

    if (!user || user.accountStatus !== "DEACTIVATED") {
      sendApiError(res, 400, "INVALID_RECOVERY_TOKEN", "Invalid recovery request.");
      return;
    }

    // Verify security answers
    let correctAnswers = 0;
    for (let i = 0; i < input.answers.length; i++) {
      const answer = input.answers[i];
      const questionAnswer = user.securityQuestionAnswers[i];
      if (questionAnswer && (await verifySecurityAnswer(questionAnswer.answerHash, answer))) {
        correctAnswers++;
      }
    }

    if (correctAnswers !== 3) {
      await prisma.recoveryAttempt.create({
        data: {
          ipAddress: clientIp(req),
          reason: "wrong_answers",
          success: false,
          userId: user.id,
        },
      });
      sendApiError(res, 400, "RECOVERY_FAILED", "Security answers do not match.");
      return;
    }

    // Reactivate account
    await prisma.$transaction([
      prisma.user.update({
        data: {
          accountStatus: "ACTIVE",
          lockedAt: null,
          lockedReason: null,
        },
        where: { id: user.id },
      }),
      prisma.recoveryAttempt.create({
        data: {
          ipAddress: clientIp(req),
          success: true,
          userId: user.id,
        },
      }),
    ]);

    // Send success email
    await sendRecoverySuccessEmail(user.email, clientIp(req), clientUserAgent(req));

    res.json({ message: "Account reactivated successfully." });
  } catch (error) {
    next(error);
  }
});

// Email change routes
app.post("/api/account/email-change/send-current-code", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const ipAddress = clientIp(req);
    const userAgent = clientUserAgent(req);

    // Check cooldown (3 hours)
    const recentChanges = await prisma.destructiveActionCode.count({
      where: {
        userId: authReq.auth.user.id,
        action: "email_change_current",
        createdAt: { gt: addMinutes(new Date(), -180) }, // 3 hours
      },
    });

    if (recentChanges > 0) {
      const lastChange = await prisma.destructiveActionCode.findFirst({
        where: {
          userId: authReq.auth.user.id,
          action: "email_change_current",
        },
        orderBy: { createdAt: "desc" },
      });
      const remainingMinutes = Math.ceil((lastChange!.createdAt.getTime() + 180 * 60 * 1000 - Date.now()) / (60 * 1000));
      sendApiError(res, 429, "RESEND_COOLDOWN", `Email change on cooldown. Try again in ${remainingMinutes} minutes.`);
      return;
    }

    // Generate and send code to current email
    const code = generate2faCode();
    const codeHash = hash2faCode(code);
    const expiresAt = addMinutes(new Date(), 10);

    await prisma.destructiveActionCode.create({
      data: {
        action: "email_change_current",
        codeHash,
        expiresAt,
        userId: authReq.auth.user.id,
      },
    });

    try {
      await sendEmailChangeVerificationCodeEmail(authReq.auth.user.email, code, "current");
    } catch (emailError) {
      console.error("Failed to send email change verification code:", emailError);
      // Don't fail the request if email sending fails, just log it
    }

    // Log security event
    await prisma.securityLog.create({
      data: {
        action: SecurityLogAction.PASSWORD_CHANGED,
        ipAddress,
        userAgent,
        userId: authReq.auth.user.id,
        details: "Email change verification code sent to current email",
        severity: SecurityLogSeverity.INFO,
      },
    });

    res.json({ message: "Verification code sent to your current email." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/account/email-change/verify-current", requireAuth, async (req, res, next) => {
  try {
    console.log("[EMAIL_CHANGE_VERIFY_CURRENT] Request received for user:", (req as AuthenticatedRequest).auth.user.id, "code:", req.body?.code);
    const authReq = req as AuthenticatedRequest;
    const parsedInput = emailChangeVerifyCurrentSchema.safeParse(req.body);
    if (!parsedInput.success) {
      sendApiError(res, 400, "VALIDATION_ERROR", parsedInput.error.issues[0]?.message ?? "Invalid input.");
      return;
    }
    const input = parsedInput.data;
    const ipAddress = clientIp(req);
    const userAgent = clientUserAgent(req);

    // Find and verify code
    const codeRecord = await prisma.destructiveActionCode.findFirst({
      where: {
        userId: authReq.auth.user.id,
        action: "email_change_current",
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!codeRecord || !(await hash2faCode(input.code) === codeRecord.codeHash)) {
      sendApiError(res, 400, "INVALID_CODE", "Invalid or expired code.");
      return;
    }

    // Mark code as used
    await prisma.destructiveActionCode.update({
      data: { usedAt: new Date() },
      where: { id: codeRecord.id },
    });

    // Log security event
    await prisma.securityLog.create({
      data: {
        action: SecurityLogAction.PASSWORD_CHANGED,
        ipAddress,
        userAgent,
        userId: authReq.auth.user.id,
        details: "Email change current email verified",
        severity: SecurityLogSeverity.INFO,
      },
    });

    res.json({ message: "Current email verified successfully." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/account/email-change/submit-new", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const parsedInput = emailChangeSubmitNewSchema.safeParse(req.body);
    if (!parsedInput.success) {
      sendApiError(res, 400, "VALIDATION_ERROR", parsedInput.error.issues[0]?.message ?? "Invalid input.");
      return;
    }
    const input = parsedInput.data;
    const ipAddress = clientIp(req);
    const userAgent = clientUserAgent(req);

    // Check if email is already in use
    const existingUser = await prisma.user.findFirst({
      where: { email: input.newEmail },
    });

    if (existingUser) {
      sendApiError(res, 409, "ACCOUNT_EXISTS", "Email already in use.");
      return;
    }

    // Verify current email code was verified recently (within 10 minutes)
    const currentCodeRecord = await prisma.destructiveActionCode.findFirst({
      where: {
        userId: authReq.auth.user.id,
        action: "email_change_current",
        usedAt: { not: null },
        createdAt: { gt: addMinutes(new Date(), -10) },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!currentCodeRecord) {
      sendApiError(res, 400, "INVALID_CODE", "Current email not verified. Please verify your current email first.");
      return;
    }

    // Generate and send code to new email
    const code = generate2faCode();
    const codeHash = hash2faCode(code);
    const expiresAt = addMinutes(new Date(), 10);

    await prisma.destructiveActionCode.create({
      data: {
        action: "email_change_new",
        codeHash,
        expiresAt,
        userId: authReq.auth.user.id,
      },
    });

    try {
      await sendEmailChangeVerificationCodeEmail(input.newEmail, code, "new");
    } catch (emailError) {
      console.error("Failed to send email change verification code to new email:", emailError);
      // Don't fail the request if email sending fails, just log it
    }

    // Log security event
    await prisma.securityLog.create({
      data: {
        action: SecurityLogAction.PASSWORD_CHANGED,
        ipAddress,
        userAgent,
        userId: authReq.auth.user.id,
        details: `Email change code sent to new email: ${input.newEmail}`,
        severity: SecurityLogSeverity.INFO,
      },
    });

    res.json({ message: "Verification code sent to your new email." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/account/email-change/complete", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const parsedInput = emailChangeCompleteSchema.safeParse(req.body);
    if (!parsedInput.success) {
      sendApiError(res, 400, "VALIDATION_ERROR", parsedInput.error.issues[0]?.message ?? "Invalid input.");
      return;
    }
    const input = parsedInput.data;
    const ipAddress = clientIp(req);
    const userAgent = clientUserAgent(req);

    // Verify password
    const user = await prisma.user.findUnique({
      select: { passwordHash: true, email: true },
      where: { id: authReq.auth.user.id },
    });

    if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
      sendApiError(res, 400, "INVALID_CREDENTIALS", "Invalid password.");
      return;
    }

    // Find and verify new email code
    const codeRecord = await prisma.destructiveActionCode.findFirst({
      where: {
        userId: authReq.auth.user.id,
        action: "email_change_new",
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!codeRecord || !(await hash2faCode(input.code) === codeRecord.codeHash)) {
      sendApiError(res, 400, "INVALID_CODE", "Invalid or expired code.");
      return;
    }

    // Check if new email is still available
    const existingUser = await prisma.user.findFirst({
      where: { email: input.newEmail },
    });

    if (existingUser && existingUser.id !== authReq.auth.user.id) {
      sendApiError(res, 409, "ACCOUNT_EXISTS", "Email already in use.");
      return;
    }

    // Mark code as used and change email
    const oldEmail = user.email;
    await prisma.$transaction([
      prisma.destructiveActionCode.update({
        data: { usedAt: new Date() },
        where: { id: codeRecord.id },
      }),
      prisma.user.update({
        data: {
          email: input.newEmail,
          emailVerifiedAt: new Date(),
        },
        where: { id: authReq.auth.user.id },
      }),
    ]);

    // Send confirmation emails
    await sendEmailChangedEmail(oldEmail, oldEmail, input.newEmail, ipAddress, userAgent);
    await sendEmailChangedEmail(input.newEmail, oldEmail, input.newEmail, ipAddress, userAgent);

    // Log security event
    await prisma.securityLog.create({
      data: {
        action: SecurityLogAction.PASSWORD_CHANGED,
        ipAddress,
        userAgent,
        userId: authReq.auth.user.id,
        details: `Email changed from ${oldEmail} to ${input.newEmail}`,
        severity: SecurityLogSeverity.WARNING,
      },
    });

    res.json({ message: "Email address changed successfully." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/account/security-status", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await prisma.user.findUnique({
      where: { id: authReq.auth.user.id },
      select: { emergencyShortcutEnabled: true }
    });
    if (!user) {
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Authentication is required.");
      return;
    }
    res.json({
      emergencyShortcutEnabled: user.emergencyShortcutEnabled,
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/account/security-status", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { emergencyShortcutEnabled } = req.body;
    if (typeof emergencyShortcutEnabled !== "boolean") {
      sendApiError(res, 400, "VALIDATION_ERROR", "emergencyShortcutEnabled must be a boolean.");
      return;
    }
    await prisma.user.update({
      where: { id: authReq.auth.user.id },
      data: { emergencyShortcutEnabled }
    });
    res.json({ message: "Account security status updated." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/emergency-lock/send-code", requireAuth, strictLimiter, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await prisma.user.findUnique({ where: { id: authReq.auth.user.id } });

    if (!user) {
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Authentication is required.");
      return;
    }

    // Check cooldown
    const cooldown = await verificationCooldown(user.id);
    if (cooldown) {
      res.status(429).json({
        code: "RATE_LIMITED",
        message: `Try again in ${cooldown} seconds.`,
        retryAfter: cooldown,
      });
      return;
    }

    // Generate and send code
    const code = generate2faCode();
    const codeHash = hash2faCode(code);
    const expiresAt = addMinutes(new Date(), 10);

    await prisma.email2faCode.create({
      data: {
        codeHash,
        purpose: "emergency-lock-setup",
        expiresAt,
        userId: user.id,
      },
    });

    // Send email
    try {
      await sendEmergencyLockSetupCodeEmail(user.email, code);
    } catch (err) {
      console.error("Emergency email failed:", err);
      return sendApiError(res, 500, "SERVER_ERROR", "Failed to send verification email.");
    }

    res.json({ message: "Verification code sent to your email." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/emergency-lock/verify-code", requireAuth, strictLimiter, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { code } = req.body;

    if (!code || typeof code !== "string" || code.length !== 6 || !/^\d{6}$/.test(code)) {
      sendApiError(res, 400, "VALIDATION_ERROR", "Code must be 6 digits.");
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: authReq.auth.user.id } });

    if (!user) {
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Authentication is required.");
      return;
    }

    const codeHash = hash2faCode(code);

    const emergencyCode = await prisma.email2faCode.findFirst({
      where: {
        userId: user.id,
        purpose: "emergency-lock-setup",
        codeHash,
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
    });

    if (!emergencyCode) {
      sendApiError(res, 400, "VALIDATION_ERROR", "Invalid or expired code.");
      return;
    }

    // Mark code as used
    await prisma.email2faCode.update({
      where: { id: emergencyCode.id },
      data: { usedAt: new Date() },
    });

    res.json({ message: "Code verified. Proceed to set shortcut." });
  } catch (error) {
    next(error);
  }
});



app.post("/api/account/emergency-shortcut/save", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { shortcut } = req.body;

    if (!shortcut || typeof shortcut !== "string" || !/^[A-Za-z0-9+\s]+$/.test(shortcut)) {
      sendApiError(res, 400, "VALIDATION_ERROR", "Invalid shortcut format.");
      return;
    }

    // Hash the shortcut for storage
    const shortcutHash = await hashPassword(shortcut);

    await prisma.user.update({
      where: { id: authReq.auth.user.id },
      data: {
        emergencyShortcutEnabled: true,
        emergencyShortcutHash: shortcutHash,
        emergencyShortcutCreatedAt: new Date(),
      },
    });

    // Audit log
    await logSecurityEvent(
      authReq.auth.user.id,
      SecurityLogAction.EMERGENCY_SHORTCUT_ENABLED,
      clientIp(req),
      clientUserAgent(req),
      "Emergency shortcut enabled",
    );

    res.json({ message: "Emergency Lock Shortcut enabled." });
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled error:", error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("Prisma error:", error.code, error.message);
  }
  sendApiError(res, 500, "SERVER_ERROR", "SecureLocker encountered an unexpected error.");
});

app.listen(config.PORT, "0.0.0.0", () => {
  console.log(`SecureLocker API listening on port ${config.PORT}`);
});
