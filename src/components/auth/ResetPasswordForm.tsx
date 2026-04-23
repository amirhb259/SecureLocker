import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LockKeyhole } from "lucide-react";
import { AuthNotice, type AuthNoticeState } from "./AuthNotice";
import { PasswordStrength } from "./PasswordStrength";
import { PasswordToggle } from "./PasswordToggle";
import { Button } from "../ui/Button";
import { PasswordField } from "../ui/PasswordField";
import { useFormField } from "../../hooks/useFormField";
import { authApi } from "../../lib/authApi";
import {
  scorePassword,
  validateConfirmPassword,
  validateRegistrationPassword,
} from "../../lib/validation";

type ResetPasswordFormProps = {
  onBack: () => void;
  token: string | null;
};

export function ResetPasswordForm({ onBack, token }: ResetPasswordFormProps) {
  const password = useFormField();
  const confirmPassword = useFormField();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<AuthNoticeState | null>(
    token
      ? null
      : {
          message: "Request a new password reset email to continue.",
          title: "Reset link missing",
          tone: "error",
        },
  );

  const strength = useMemo(() => scorePassword(password.value), [password.value]);
  const errors = useMemo(
    () => ({
      confirmPassword: validateConfirmPassword(password.value, confirmPassword.value),
      password: validateRegistrationPassword(password.value),
    }),
    [confirmPassword.value, password.value],
  );
  const canSubmit = Boolean(token) && !errors.password && !errors.confirmPassword;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    password.touch();
    confirmPassword.touch();

    if (!token || errors.password || errors.confirmPassword) {
      setNotice({
        message: "Resolve the highlighted fields before updating your password.",
        title: "Password details need attention",
        tone: "error",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await authApi.resetPassword(token, password.value);
      setNotice({ message: result.message, title: "Password updated", tone: "success" });
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : "SecureLocker could not reset the password.",
        title: "Reset failed",
        tone: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.form
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      className="auth-form"
      exit={{ opacity: 0, x: 24, filter: "blur(4px)" }}
      initial={{ opacity: 0, x: -24, filter: "blur(4px)" }}
      onSubmit={submit}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="auth-form__header">
        <span className="eyebrow">Credential recovery</span>
        <h1>Create new password</h1>
        <p>Set a new password for your SecureLocker account.</p>
      </div>

      <AnimatePresence>{notice ? <AuthNotice notice={notice} /> : null}</AnimatePresence>

      <div className="auth-form__fields">
        <PasswordField
          action={
            <PasswordToggle
              isVisible={passwordVisible}
              onToggle={() => setPasswordVisible((current) => !current)}
            />
          }
          autoComplete="new-password"
          error={errors.password}
          icon={<LockKeyhole aria-hidden="true" />}
          id="reset-password"
          label="New password"
          onBlur={password.onBlur}
          onChange={password.onChange}
          placeholder="Create password"
          touched={password.touched}
          value={password.value}
          visible={passwordVisible}
        />
        <PasswordStrength strength={strength} visible={password.value.length > 0} />
        <PasswordField
          action={
            <PasswordToggle
              isVisible={confirmPasswordVisible}
              onToggle={() => setConfirmPasswordVisible((current) => !current)}
            />
          }
          autoComplete="new-password"
          error={errors.confirmPassword}
          icon={<LockKeyhole aria-hidden="true" />}
          id="reset-confirm-password"
          label="Confirm password"
          onBlur={confirmPassword.onBlur}
          onChange={confirmPassword.onChange}
          placeholder="Confirm password"
          touched={confirmPassword.touched}
          value={confirmPassword.value}
          visible={confirmPasswordVisible}
        />
      </div>

      <Button className="auth-form__submit" disabled={!canSubmit} loading={isSubmitting} type="submit">
        Update password
      </Button>

      <p className="auth-form__switch">
        Back to access?
        <button onClick={onBack} type="button">
          Return to login
        </button>
      </p>
    </motion.form>
  );
}
