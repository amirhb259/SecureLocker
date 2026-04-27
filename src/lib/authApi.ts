export type ApiUser = {
  email: string;
  emailVerified: boolean;
  id: string;
  locked: boolean;
  username: string;
};

export type AuthSession = {
  accessToken: string;
  sessionToken: string;
  user: ApiUser;
};

export type RegisterInput = {
  email: string;
  password: string;
  username: string;
};

export type LoginInput = {
  email: string;
  password: string;
  rememberDevice: boolean;
};

export type SecurityReviewResponse = {
  code: "SECURITY_REVIEW_REQUIRED";
  message: string;
  status: "security_review_required";
};

export type TwoFactorLoginResponse = {
  code: "2FA_REQUIRED";
  message: string;
  sessionToken: string;
  status: "2fa_required";
};

export type LoginResponse = AuthSession | SecurityReviewResponse | TwoFactorLoginResponse;

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4100/api";

type ApiErrorBody = {
  code?: string;
  message?: string;
  retryAfterSeconds?: number;
};

export type SecurityQuestion = {
  id: string;
  prompt: string;
};

export class ApiError extends Error {
  code?: string;
  retryAfterSeconds?: number;
  status: number;

  constructor(message: string, status: number, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.status = status;
  }
}

function userMessageFor(code: string | undefined, fallback: string | undefined) {
  switch (code) {
    case "ACCOUNT_EXISTS":
      return "Email already in use.";
    case "ACCOUNT_LOCKED":
      return "Account temporarily locked due to suspicious activity.";
    case "CURRENT_SESSION_PROTECTED":
      return "Use sign out to end the current session.";
    case "EMAIL_NOT_VERIFIED":
      return "Verify your email before signing in.";
    case "INVALID_CREDENTIALS":
      return "Invalid credentials.";
    case "INVALID_RECOVERY_TOKEN":
      return "Invalid or expired recovery token.";
    case "INVALID_RESET_TOKEN":
      return "Invalid or expired reset token.";
    case "NOT_FOUND":
      return fallback ?? "Requested item was not found.";
    case "RECOVERY_FAILED":
      return "Recovery answers did not match.";
    case "RECOVERY_LOCKED":
      return "Too many failed recovery attempts. Please try again later.";
    case "RESEND_COOLDOWN":
      return "A message was sent recently. Please wait before requesting another.";
    case "SECURITY_QUESTIONS_REQUIRED":
      return "Set up SecureLocker recovery questions before signing in.";
    case "SECURITY_QUESTIONS_UNAVAILABLE":
      return "Security questions are unavailable. Check that the database has been seeded.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many attempts, please try again later.";
    case "USERNAME_EXISTS":
      return "Username already exists";
    case "VAULT_EXISTS":
      return "Vault is already configured.";
    case "VAULT_NOT_CONFIGURED":
      return "Set up your vault before continuing.";
    case "VALIDATION_ERROR":
      return fallback ?? "Submitted details are invalid.";
    case "VERIFICATION_LINK_EXPIRED":
      return "Verification link expired.";
    case "SERVER_ERROR":
      return "SecureLocker is temporarily unavailable.";
    default:
      return fallback ?? "SecureLocker could not complete the request.";
  }
}

async function request<T>(path: string, body: unknown): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch {
    throw new ApiError("SecureLocker service is unreachable.", 0, "SERVICE_UNAVAILABLE");
  }

  const data = (await response.json().catch(() => ({}))) as ApiErrorBody;

  if (!response.ok) {
    throw new ApiError(userMessageFor(data.code, data.message), response.status, data.code, data.retryAfterSeconds);
  }

  return data as T;
}

async function getRequest<T>(path: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`);
  } catch {
    throw new ApiError("SecureLocker service is unreachable.", 0, "SERVICE_UNAVAILABLE");
  }

  const data = (await response.json().catch(() => ({}))) as ApiErrorBody;

  if (!response.ok) {
    throw new ApiError(userMessageFor(data.code, data.message), response.status, data.code, data.retryAfterSeconds);
  }

  return data as T;
}

export const authApi = {
  forgotPassword: (email: string) =>
    request<{ message: string }>("/auth/forgot-password", { email }),
  login: (input: LoginInput) => request<LoginResponse>("/auth/login", input),
  register: (input: RegisterInput) =>
    request<{ message: string; status: "verification_required"; user: ApiUser }>("/auth/register", input),
  resendVerification: (email: string) =>
    request<{ message: string }>("/auth/resend-verification", { email }),
  resetPassword: (token: string, password: string) =>
    request<{ message: string }>("/auth/reset-password", { password, token }),
  getSecurityQuestions: () => getRequest<{ questions: SecurityQuestion[] }>("/security/questions"),
  setupSecurityQuestions: (token: string, answers: Array<{ questionId: string; answer: string }>) =>
    request<{ message: string }>("/security/questions/setup", { answers, token }),
  startAccountRecovery: (email: string) =>
    request<{ message: string }>("/auth/recovery/start", { email }),
  getRecoveryChallenge: (token: string) =>
    request<{ questions: SecurityQuestion[] }>("/auth/recovery/challenge", { token }),
  completeAccountRecovery: (token: string, answers: string[]) =>
    request<{ message: string }>("/auth/recovery/complete", { answers, token }),
  send2faLoginCode: (sessionToken: string) =>
    request<{ message: string }>("/2fa/login/send-code", { sessionToken }),
  verify2faLoginCode: (input: { code: string; sessionToken: string }) =>
    request<AuthSession>("/2fa/login/verify-code", input),
};

const sessionStorageKey = "securelocker.session";
export const sessionChangedEvent = "securelocker.session.changed";

export function storeSession(session: AuthSession) {
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
  window.dispatchEvent(new Event(sessionChangedEvent));
}

export function getStoredSession() {
  const rawSession = window.localStorage.getItem(sessionStorageKey);
  if (!rawSession) return null;

  try {
    return JSON.parse(rawSession) as AuthSession;
  } catch {
    window.localStorage.removeItem(sessionStorageKey);
    return null;
  }
}

export function clearStoredSession() {
  window.localStorage.removeItem(sessionStorageKey);
  window.dispatchEvent(new Event(sessionChangedEvent));
}

export async function authenticatedRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getStoredSession();
  if (!session) {
    throw new ApiError("Sign in to continue.", 401, "INVALID_CREDENTIALS");
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError("SecureLocker service is unreachable.", 0, "SERVICE_UNAVAILABLE");
  }

  const data = (await response.json().catch(() => ({}))) as ApiErrorBody;

  if (!response.ok) {
    if (response.status === 401 || response.status === 423) {
      clearStoredSession();
    }
    throw new ApiError(userMessageFor(data.code, data.message), response.status, data.code, data.retryAfterSeconds);
  }

  return data as T;
}
