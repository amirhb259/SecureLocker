import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { AuthNotice, type AuthNoticeState } from "./AuthNotice";
import { Button } from "../ui/Button";
import { useCooldown } from "../../hooks/useCooldown";
import { ApiError, authApi } from "../../lib/authApi";

type VerificationPendingProps = {
  email: string;
  onBack: () => void;
};

export function VerificationPending({ email, onBack }: VerificationPendingProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<AuthNoticeState | null>(null);
  const { isCoolingDown, remainingSeconds, startCooldown } = useCooldown();

  async function resend() {
    try {
      setIsSubmitting(true);
      const result = await authApi.resendVerification(email);
      setNotice({ message: result.message, title: "Verification email sent", tone: "success" });
      startCooldown();
    } catch (error) {
      if (error instanceof ApiError && error.code === "RESEND_COOLDOWN") {
        startCooldown(error.retryAfterSeconds ?? 60);
      }
      setNotice({
        message: error instanceof Error ? error.message : "SecureLocker could not resend verification.",
        title: "Resend failed",
        tone: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.div
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      className="auth-form"
      exit={{ opacity: 0, x: 24, filter: "blur(4px)" }}
      initial={{ opacity: 0, x: -24, filter: "blur(4px)" }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="auth-form__header">
        <span className="eyebrow">Verification required</span>
        <h1>Check your email</h1>
        <p>SecureLocker sent a verification link to {email || "your email address"}.</p>
      </div>

      <div className="verification-mark" aria-hidden="true">
        <ShieldCheck />
      </div>

      <AnimatePresence>{notice ? <AuthNotice notice={notice} /> : null}</AnimatePresence>

      <Button className="auth-form__submit" disabled={!email || isCoolingDown} loading={isSubmitting} onClick={resend}>
        {isCoolingDown ? `Resend in ${remainingSeconds}s` : "Resend verification"}
      </Button>

      <p className="auth-form__switch">
        Already verified?
        <button onClick={onBack} type="button">
          Return to login
        </button>
      </p>
    </motion.div>
  );
}
