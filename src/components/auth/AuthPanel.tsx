import { AnimatePresence } from "motion/react";
import { AccountRecoveryForm } from "./AccountRecoveryForm";
import { ApproveSignIn } from "./ApproveSignIn";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm } from "./LoginForm";
import { LockedAccount } from "./LockedAccount";
import { RegisterForm } from "./RegisterForm";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { SecurityReviewPending } from "./SecurityReviewPending";
import { SecurityQuestionSetup } from "./SecurityQuestionSetup";
import { TwoFactorLogin } from "./TwoFactorLogin";
import { VerificationPending } from "./VerificationPending";

export type AuthMode =
  | "2fa"
  | "approve-sign-in"
  | "forgot"
  | "locked"
  | "login"
  | "question-setup"
  | "recovery"
  | "pending-security"
  | "pending-verification"
  | "register"
  | "reset";

type AuthPanelProps = {
  approveSignInToken: string | null;
  emailForVerification: string;
  lockedEmail: string;
  mode: AuthMode;
  onAccountLocked: (email: string) => void;
  onModeChange: (mode: AuthMode) => void;
  onSecurityReviewRequired: (email: string) => void;
  onTwoFactorRequired: (sessionToken: string) => void;
  onVerificationRequired: (email: string) => void;
  questionSetupToken: string | null;
  recoveryToken: string | null;
  resetToken: string | null;
  twoFactorSessionToken: string | null;
};

export function AuthPanel({
  approveSignInToken,
  emailForVerification,
  lockedEmail,
  mode,
  onAccountLocked,
  onModeChange,
  onSecurityReviewRequired,
  onTwoFactorRequired,
  onVerificationRequired,
  questionSetupToken,
  recoveryToken,
  resetToken,
  twoFactorSessionToken,
}: AuthPanelProps) {
  const showModeSwitch = mode === "login" || mode === "register";

  return (
    <section className="auth-panel" aria-label="SecureLocker authentication">
      <div className="auth-panel__stack">
        {showModeSwitch ? (
          <div className="auth-panel__mode" aria-label="Authentication mode">
            <button
              aria-pressed={mode === "login"}
              className={mode === "login" ? "is-active" : undefined}
              onClick={() => onModeChange("login")}
              type="button"
            >
              Login
            </button>
            <button
              aria-pressed={mode === "register"}
              className={mode === "register" ? "is-active" : undefined}
              onClick={() => onModeChange("register")}
              type="button"
            >
              Register
            </button>
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          {mode === "login" ? (
            <LoginForm
              key="login"
              onAccountLocked={onAccountLocked}
              onForgotPassword={() => onModeChange("forgot")}
              onSecurityReviewRequired={onSecurityReviewRequired}
              onSwitchMode={() => onModeChange("register")}
              onTwoFactorRequired={onTwoFactorRequired}
              onVerificationRequired={onVerificationRequired}
            />
          ) : null}
          {mode === "2fa" ? (
            <TwoFactorLogin
              key="2fa"
              onBack={() => onModeChange("login")}
              sessionToken={twoFactorSessionToken || ""}
            />
          ) : null}
          {mode === "register" ? (
            <RegisterForm
              key="register"
              onSwitchMode={() => onModeChange("login")}
              onVerificationRequired={onVerificationRequired}
            />
          ) : null}
          {mode === "forgot" ? (
            <ForgotPasswordForm key="forgot" onBack={() => onModeChange("login")} />
          ) : null}
          {mode === "reset" ? (
            <ResetPasswordForm key="reset" onBack={() => onModeChange("login")} token={resetToken} />
          ) : null}
          {mode === "approve-sign-in" ? (
            <ApproveSignIn
              key="approve-sign-in"
              onBack={() => onModeChange("login")}
              token={approveSignInToken}
            />
          ) : null}
          {mode === "pending-verification" ? (
            <VerificationPending
              email={emailForVerification}
              key="pending-verification"
              onBack={() => onModeChange("login")}
            />
          ) : null}
          {mode === "pending-security" ? (
            <SecurityReviewPending
              key="pending-security"
              onBack={() => onModeChange("login")}
            />
          ) : null}
          {mode === "locked" ? (
            <LockedAccount
              initialEmail={lockedEmail}
              key="locked"
              onBack={() => onModeChange("login")}
            />
          ) : null}
          {mode === "question-setup" ? (
            <SecurityQuestionSetup
              key="question-setup"
              onComplete={() => onModeChange("login")}
              token={questionSetupToken}
            />
          ) : null}
          {mode === "recovery" ? (
            <AccountRecoveryForm
              key="recovery"
              onComplete={() => onModeChange("login")}
              token={recoveryToken}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
