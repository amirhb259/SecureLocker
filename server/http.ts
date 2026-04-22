import type { Response } from "express";

export type ApiErrorCode =
  | "ACCOUNT_EXISTS"
  | "ACCOUNT_LOCKED"
  | "BAD_JSON"
  | "CURRENT_SESSION_PROTECTED"
  | "EMAIL_NOT_VERIFIED"
  | "INVALID_CREDENTIALS"
  | "INVALID_RECOVERY_TOKEN"
  | "INVALID_RESET_TOKEN"
  | "INVALID_SECURITY_QUESTIONS"
  | "INVALID_SETUP_TOKEN"
  | "NOT_FOUND"
  | "RECOVERY_FAILED"
  | "RECOVERY_LOCKED"
  | "RESEND_COOLDOWN"
  | "SECURITY_QUESTIONS_REQUIRED"
  | "SECURITY_QUESTIONS_UNAVAILABLE"
  | "SECURITY_REVIEW_REQUIRED"
  | "SERVER_ERROR"
  | "TOO_MANY_ATTEMPTS"
  | "USERNAME_EXISTS"
  | "VAULT_EXISTS"
  | "VAULT_NOT_CONFIGURED"
  | "VALIDATION_ERROR"
  | "VERIFICATION_LINK_EXPIRED";

export function sendApiError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  extra?: { retryAfterSeconds?: number },
) {
  res.status(status).json({ code, message, ...extra });
}
