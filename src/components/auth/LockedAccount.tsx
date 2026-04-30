import { motion } from "motion/react";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { AuthNotice, type AuthNoticeState } from "./AuthNotice";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { useCooldown } from "../../hooks/useCooldown";
import { useFormField } from "../../hooks/useFormField";
import { ApiError, authApi } from "../../lib/authApi";
import { validateEmail } from "../../lib/validation";

type LockedAccountProps = {
  onBack: () => void;
  initialEmail: string;
};

export function LockedAccount({ initialEmail, onBack }: LockedAccountProps) {
  const email = useFormField(initialEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<AuthNoticeState | null>(null);
  const { isCoolingDown, remainingSeconds, startCooldown } = useCooldown();
  const error = useMemo(() => validateEmail(email.value), [email.value]);
  const canSubmit = !error;

  // Reactivation state
  const [mode, setMode] = useState<"recovery" | "reactivate">("recovery");
  const [reactivateAnswers, setReactivateAnswers] = useState(["", "", ""]);

  async function requestRecovery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    email.touch();

    if (error) {
      setNotice({ message: "Enter the locked account email address.", title: "Email required", tone: "error" });
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await authApi.startAccountRecovery(email.value);
      setNotice({ message: result.message, title: "Recovery email requested", tone: "success" });
      startCooldown();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === "RESEND_COOLDOWN") {
        startCooldown(requestError.retryAfterSeconds ?? 60);
      }
      setNotice({
        message: requestError instanceof Error ? requestError.message : "SecureLocker could not request recovery.",
        title: "Recovery request failed",
        tone: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReactivate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    email.touch();

    if (error) {
      setNotice({ message: "Enter the account email address.", title: "Email required", tone: "error" });
      return;
    }

    if (reactivateAnswers.some(answer => !answer.trim())) {
      setNotice({ message: "All security questions must be answered.", title: "Answers required", tone: "error" });
      return;
    }

    try {
      setIsSubmitting(true);
      await authApi.reactivateAccount({ email: email.value, answers: reactivateAnswers });
      setNotice({ message: "Account reactivated successfully.", title: "Reactivation successful", tone: "success" });
      // Redirect to login after success
      setTimeout(() => onBack(), 2000);
    } catch (requestError) {
      setNotice({
        message: requestError instanceof Error ? requestError.message : "SecureLocker could not reactivate account.",
        title: "Reactivation failed",
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
      {mode === "recovery" ? (
        <motion.form onSubmit={requestRecovery}>
          <div className="auth-form__header">
            <span className="eyebrow">Account protected</span>
            <h1>SecureLocker locked access</h1>
            <p>Recover the account and set a new password before signing in again.</p>
          </div>

          <div className="verification-mark verification-mark--danger" aria-hidden="true">
            <LockKeyhole />
          </div>

          <AnimatePresence>{notice ? <AuthNotice notice={notice} /> : null}</AnimatePresence>

          <div className="auth-form__fields">
            <TextField
              autoComplete="email"
              error={error}
              icon={<Mail aria-hidden="true" />}
              id="locked-email"
              inputMode="email"
              label="Account email"
              onBlur={email.onBlur}
              onChange={email.onChange}
              placeholder="name@company.com"
              touched={email.touched}
              type="email"
              value={email.value}
            />
          </div>

          <Button className="auth-form__submit" disabled={!canSubmit || isCoolingDown} loading={isSubmitting} type="submit">
            {isCoolingDown ? `Resend in ${remainingSeconds}s` : "Send recovery email"}
          </Button>

          <p className="auth-form__switch">
            Account deactivated instead?
            <button onClick={() => setMode("reactivate")} type="button">
              Reactivate account
            </button>
          </p>
          <p className="auth-form__switch">
            Back to access?
            <button onClick={onBack} type="button">
              Return to login
            </button>
          </p>
        </motion.form>
      ) : (
        <motion.form onSubmit={handleReactivate}>
          <div className="auth-form__header">
            <span className="eyebrow">Account reactivation</span>
            <h1>Reactivate your account</h1>
            <p>Answer your security questions to restore access to your account.</p>
          </div>

          <div className="verification-mark verification-mark--success" aria-hidden="true">
            <ShieldCheck />
          </div>

          <AnimatePresence>{notice ? <AuthNotice notice={notice} /> : null}</AnimatePresence>

          <div className="auth-form__fields">
            <TextField
              autoComplete="email"
              error={error}
              icon={<Mail aria-hidden="true" />}
              id="reactivate-email"
              inputMode="email"
              label="Account email"
              onBlur={email.onBlur}
              onChange={email.onChange}
              placeholder="name@company.com"
              touched={email.touched}
              type="email"
              value={email.value}
            />
            {["First", "Second", "Third"].map((ordinal, index) => (
              <TextField
                key={index}
                autoComplete="off"
                id={`security-answer-${index}`}
                label={`${ordinal} security question answer`}
                onChange={(value) => {
                  const newAnswers = [...reactivateAnswers];
                  newAnswers[index] = value;
                  setReactivateAnswers(newAnswers);
                }}
                placeholder="Your answer"
                type="password"
                value={reactivateAnswers[index]}
              />
            ))}
          </div>

          <Button className="auth-form__submit" disabled={!canSubmit || isSubmitting} loading={isSubmitting} type="submit">
            Reactivate account
          </Button>

          <p className="auth-form__switch">
            Need password recovery instead?
            <button onClick={() => setMode("recovery")} type="button">
              Account recovery
            </button>
          </p>
          <p className="auth-form__switch">
            Back to access?
            <button onClick={onBack} type="button">
              Return to login
            </button>
          </p>
        </motion.form>
      )}
    </motion.div>
  );
}
