import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LockKeyhole, Mail, UserRound } from "lucide-react";
import { AuthNotice, type AuthNoticeState } from "./AuthNotice";
import { PasswordStrength } from "./PasswordStrength";
import { PasswordToggle } from "./PasswordToggle";
import { Button } from "../ui/Button";
import { PasswordField } from "../ui/PasswordField";
import { TextField } from "../ui/TextField";
import { useFormField } from "../../hooks/useFormField";
import { authApi } from "../../lib/authApi";
import {
  scorePassword,
  validateConfirmPassword,
  validateEmail,
  validateRegistrationPassword,
  validateUsername,
} from "../../lib/validation";

type RegisterFormProps = {
  onSwitchMode: () => void;
  onVerificationRequired: (email: string) => void;
};

export function RegisterForm({ onSwitchMode, onVerificationRequired }: RegisterFormProps) {
  const username = useFormField();
  const email = useFormField();
  const password = useFormField();
  const confirmPassword = useFormField();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<AuthNoticeState | null>(null);

  const passwordStrength = useMemo(() => scorePassword(password.value), [password.value]);
  const errors = useMemo(
    () => ({
      confirmPassword: validateConfirmPassword(password.value, confirmPassword.value),
      email: validateEmail(email.value),
      password: validateRegistrationPassword(password.value),
      username: validateUsername(username.value),
    }),
    [confirmPassword.value, email.value, password.value, username.value],
  );
  const canSubmit =
    !errors.username && !errors.email && !errors.password && !errors.confirmPassword;

  async function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    username.touch();
    email.touch();
    password.touch();
    confirmPassword.touch();

    if (errors.username || errors.email || errors.password || errors.confirmPassword) {
      setNotice({
        tone: "error",
        title: "Registration details need attention",
        message: "Resolve the highlighted fields before creating your SecureLocker identity.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await authApi.register({
        email: email.value,
        password: password.value,
        username: username.value,
      });
      onVerificationRequired(email.value);
    } catch (error) {
      setNotice({
        tone: "error",
        title: "Registration failed",
        message: error instanceof Error ? error.message : "SecureLocker could not create the account.",
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
      onSubmit={submitRegistration}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="auth-form__header">
        <span className="eyebrow">Provision access</span>
        <h1>Create SecureLocker account</h1>
        <p>Create a verified identity for protected workstation access.</p>
      </div>

      <AnimatePresence>{notice ? <AuthNotice notice={notice} /> : null}</AnimatePresence>

      <div className="auth-form__fields">
        <TextField
          autoComplete="username"
          error={errors.username}
          icon={<UserRound aria-hidden="true" />}
          id="register-username"
          label="Username"
          onBlur={username.onBlur}
          onChange={username.onChange}
          placeholder="Username"
          touched={username.touched}
          type="text"
          value={username.value}
        />

        <TextField
          autoComplete="email"
          error={errors.email}
          icon={<Mail aria-hidden="true" />}
          id="register-email"
          inputMode="email"
          label="Email address"
          onBlur={email.onBlur}
          onChange={email.onChange}
          placeholder="name@company.com"
          touched={email.touched}
          type="email"
          value={email.value}
        />

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
          id="register-password"
          label="Password"
          onBlur={password.onBlur}
          onChange={password.onChange}
          placeholder="Create password"
          touched={password.touched}
          value={password.value}
          visible={passwordVisible}
        />

        <PasswordStrength strength={passwordStrength} visible={password.value.length > 0} />

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
          id="register-confirm-password"
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
        Create secure account
      </Button>

      <p className="auth-form__switch">
        Already provisioned?
        <button onClick={onSwitchMode} type="button">
          Return to login
        </button>
      </p>
    </motion.form>
  );
}
