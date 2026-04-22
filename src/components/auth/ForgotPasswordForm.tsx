import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mail } from "lucide-react";
import { AuthNotice, type AuthNoticeState } from "./AuthNotice";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { useCooldown } from "../../hooks/useCooldown";
import { useFormField } from "../../hooks/useFormField";
import { ApiError, authApi } from "../../lib/authApi";
import { validateEmail } from "../../lib/validation";

type ForgotPasswordFormProps = {
  onBack: () => void;
};

export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const email = useFormField();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<AuthNoticeState | null>(null);
  const { isCoolingDown, remainingSeconds, startCooldown } = useCooldown();
  const error = useMemo(() => validateEmail(email.value), [email.value]);
  const canSubmit = !error;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    email.touch();

    if (error) {
      setNotice({
        tone: "error",
        title: "Email required",
        message: "Enter a valid email address to continue.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await authApi.forgotPassword(email.value);
      setNotice({ tone: "success", title: "Reset email requested", message: result.message });
      startCooldown();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === "RESEND_COOLDOWN") {
        startCooldown(requestError.retryAfterSeconds ?? 60);
      }
      setNotice({
        tone: "error",
        title: "Reset request failed",
        message: requestError instanceof Error ? requestError.message : "SecureLocker could not request a reset.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.form
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      className="auth-form"
      exit={{ opacity: 0, x: -24, filter: "blur(4px)" }}
      initial={{ opacity: 0, x: 24, filter: "blur(4px)" }}
      onSubmit={submit}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="auth-form__header">
        <span className="eyebrow">Account recovery</span>
        <h1>Reset password</h1>
        <p>Receive a secure reset link for your verified SecureLocker account.</p>
      </div>

      <AnimatePresence>{notice ? <AuthNotice notice={notice} /> : null}</AnimatePresence>

      <div className="auth-form__fields">
        <TextField
          autoComplete="email"
          error={error}
          icon={<Mail aria-hidden="true" />}
          id="forgot-email"
          inputMode="email"
          label="Email address"
          onBlur={email.onBlur}
          onChange={email.onChange}
          placeholder="name@company.com"
          touched={email.touched}
          type="email"
          value={email.value}
        />
      </div>

      <Button className="auth-form__submit" disabled={!canSubmit || isCoolingDown} loading={isSubmitting} type="submit">
        {isCoolingDown ? `Resend in ${remainingSeconds}s` : "Send reset link"}
      </Button>

      <p className="auth-form__switch">
        Remember your password?
        <button onClick={onBack} type="button">
          Return to login
        </button>
      </p>
    </motion.form>
  );
}
