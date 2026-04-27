import { useState } from "react";
import { motion } from "motion/react";
import { AuthPanel, type AuthMode } from "../../components/auth/AuthPanel";
import { BrandDeck } from "../../components/auth/BrandDeck";
import "../../styles/auth.css";

export function AuthPage() {
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get("resetToken");
  const questionSetupToken = params.get("questionSetupToken");
  const recoveryToken = params.get("recoveryToken");
  const approveSignInToken = params.get("approveSignInToken");
  const initialMode: AuthMode = recoveryToken
    ? "recovery"
    : questionSetupToken
      ? "question-setup"
      : approveSignInToken
        ? "approve-sign-in"
        : resetToken
          ? "reset"
          : "login";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [emailForVerification, setEmailForVerification] = useState("");
  const [lockedEmail, setLockedEmail] = useState("");
  const [twoFactorSessionToken, setTwoFactorSessionToken] = useState("");

  function showVerificationPending(email: string) {
    setEmailForVerification(email);
    setMode("pending-verification");
  }

  function showSecurityReviewPending() {
    setMode("pending-security");
  }

  function showTwoFactorRequired(sessionToken: string) {
    setTwoFactorSessionToken(sessionToken);
    setMode("2fa");
  }

  function showLockedAccount(email: string) {
    setLockedEmail(email);
    setMode("locked");
  }

  return (
    <main className="auth-page">
      <div className="ambient-grid" aria-hidden="true" />
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="auth-shell"
        initial={{ opacity: 0, scale: 0.985 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <BrandDeck />
        <AuthPanel
          approveSignInToken={approveSignInToken}
          emailForVerification={emailForVerification}
          lockedEmail={lockedEmail}
          mode={mode}
          onAccountLocked={showLockedAccount}
          onModeChange={setMode}
          onSecurityReviewRequired={showSecurityReviewPending}
          onTwoFactorRequired={showTwoFactorRequired}
          onVerificationRequired={showVerificationPending}
          questionSetupToken={questionSetupToken}
          recoveryToken={recoveryToken}
          resetToken={resetToken}
          twoFactorSessionToken={twoFactorSessionToken}
        />
      </motion.div>
    </main>
  );
}
