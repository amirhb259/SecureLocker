import type { Response } from "express";

export type ApiErrorCode =
  | "ACCOUNT_DEACTIVATED"
  | "ACCOUNT_EXISTS"
  | "ACCOUNT_LOCKED"
  | "APPROVAL_FAILED"
  | "BAD_JSON"
  | "CURRENT_SESSION_PROTECTED"
  | "EMAIL_NOT_VERIFIED"
  | "INVALID_CODE"
  | "INVALID_CREDENTIALS"
  | "INVALID_DEVICE_ID"
  | "INVALID_RECOVERY_TOKEN"
  | "INVALID_RESET_TOKEN"
  | "INVALID_SECURITY_QUESTIONS"
  | "INVALID_SESSION"
  | "INVALID_SETUP_TOKEN"
  | "INVALID_TOKEN"
  | "NEW_DEVICE_APPROVAL_REQUIRED"
  | "NOT_FOUND"
  | "RECOVERY_FAILED"
  | "RECOVERY_LOCKED"
  | "REJECTION_FAILED"
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
  | "VERIFICATION_LINK_EXPIRED"
  | "2FA_NOT_ENABLED";

export function sendApiError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  extra?: { retryAfterSeconds?: number },
) {
  res.status(status).json({ code, message, ...extra });
}

export function sendApiResponse(
  res: Response,
  status: number,
  data: any,
) {
  res.status(status).json(data);
}
