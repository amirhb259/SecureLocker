import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AuthNotice, type AuthNoticeState } from "./AuthNotice";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { ApiError, authApi, storeSession } from "../../lib/authApi";
import { validateRequired } from "../../lib/validation";

type TwoFactorLoginProps = {
  onBack: () => void;
  sessionToken: string;
};

export function TwoFactorLogin({ onBack, sessionToken }: TwoFactorLoginProps) {
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [notice, setNotice] = useState<AuthNoticeState | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const errors = useMemo(
    () => ({
      code: validateRequired(code, "Verification code"),
    }),
    [code],
  );

  const canSubmit = !errors.code && code.length === 6;

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (errors.code || code.length !== 6) {
      setNotice({
        tone: "error",
        title: "Invalid code",
        message: "Enter the 6-digit verification code from your email.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const session = await authApi.verify2faLoginCode({ code, sessionToken });

      storeSession(session);
      setNotice({
        tone: "success",
        title: "Secure session established",
        message: `Signed in with 2FA as ${session.user.email}.`,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setNotice({
          tone: "error",
          title: "2FA verification failed",
          message: error.message,
        });
      } else {
        setNotice({
          tone: "error",
          title: "2FA verification failed",
          message: "SecureLocker could not verify the code.",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resendCode() {
    if (resendCooldown > 0) return;

    try {
      setIsResending(true);
      await authApi.send2faLoginCode(sessionToken);
      
      setNotice({
        tone: "success",
        title: "Code resent",
        message: "A new verification code has been sent to your email.",
      });

      // Start 60-second cooldown
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((current) => {
          if (current <= 1) {
            clearInterval(interval);
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    } catch (error) {
      if (error instanceof ApiError) {
        setNotice({
          tone: "error",
          title: "Resend failed",
          message: error.message,
        });
      } else {
        setNotice({
          tone: "error",
          title: "Resend failed", 
          message: "Could not resend verification code.",
        });
      }
    } finally {
      setIsResending(false);
    }
  }

  return (
    <motion.form
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      className="auth-form"
      exit={{ opacity: 0, x: -24, filter: "blur(4px)" }}
      initial={{ opacity: 0, x: 24, filter: "blur(4px)" }}
      onSubmit={submitCode}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="auth-form__header">
        <span className="eyebrow">Two-factor authentication</span>
        <h1>Verify your identity</h1>
        <p>Enter the 6-digit code sent to your email to complete SecureLocker sign-in.</p>
      </div>

      <AnimatePresence>{notice ? <AuthNotice notice={notice} /> : null}</AnimatePresence>

      <div className="auth-form__fields">
        <TextField
          autoComplete="one-time-code"
          error={errors.code}
          icon={<ShieldCheck aria-hidden="true" />}
          id="2fa-code"
          inputMode="numeric"
          label="Verification code"
          maxLength={6}
          onChange={setCode}
          placeholder="000000"
          value={code}
        />
      </div>

      <div className="auth-form__options">
        <button 
          className="text-action" 
          onClick={resendCode} 
          type="button"
          disabled={isResending || resendCooldown > 0}
        >
          {isResending ? "Sending..." : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
        </button>
        <button className="text-action" onClick={onBack} type="button">
          <ArrowLeft size={16} style={{ marginRight: "4px" }} />
          Back to sign-in
        </button>
      </div>

      <Button className="auth-form__submit" disabled={!canSubmit} loading={isSubmitting} type="submit">
        Verify and continue
      </Button>
    </motion.form>
  );
}
