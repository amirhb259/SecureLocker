import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LockKeyhole, Mail } from "lucide-react";
import { AuthNotice, type AuthNoticeState } from "./AuthNotice";
import { PasswordToggle } from "./PasswordToggle";
import { Button } from "../ui/Button";
import { PasswordField } from "../ui/PasswordField";
import { TextField } from "../ui/TextField";
import { useFormField } from "../../hooks/useFormField";
import { ApiError, authApi, storeSession } from "../../lib/authApi";
import { validateEmail, validateRequired } from "../../lib/validation";
import { checkForLoginApproval, approveLogin, rejectLogin } from "../../lib/securityApi";

type LoginFormProps = {
  onAccountLocked: (email: string) => void;
  onForgotPassword: () => void;
  onSecurityReviewRequired: (email: string) => void;
  onSwitchMode: () => void;
  onTwoFactorRequired: (sessionToken: string) => void;
  onVerificationRequired: (email: string) => void;
};

export function LoginForm({
  onAccountLocked,
  onForgotPassword,
  onSecurityReviewRequired,
  onSwitchMode,
  onTwoFactorRequired,
  onVerificationRequired,
}: LoginFormProps) {
  const email = useFormField();
  const password = useFormField();
  const [rememberDevice, setRememberDevice] = useState(true);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<AuthNoticeState | null>(null);

  const errors = useMemo(
    () => ({
      email: validateEmail(email.value),
      password: validateRequired(password.value, "Password"),
    }),
    [email.value, password.value],
  );
  const canSubmit = !errors.email && !errors.password;

  // Check for login approval on mount
  useEffect(() => {
    const handleLoginApproval = async () => {
      const approval = checkForLoginApproval();
      if (approval.token && approval.action) {
        setIsSubmitting(true);
        try {
          if (approval.action === 'approve') {
            const result = await approveLogin(approval.token);
            if (result.success) {
              setNotice({
                tone: "success",
                title: "Login approved",
                message: "This device is approved. Sign in again to continue.",
              });
              // Clear URL params
              window.history.replaceState({}, document.title, window.location.pathname);
            } else {
              setNotice({
                tone: "error",
                title: "Approval failed",
                message: result.error || "Failed to approve login.",
              });
            }
          } else if (approval.action === 'reject') {
            const result = await rejectLogin(approval.token);
            if (result.success) {
              setNotice({
                tone: "info",
                title: "Login rejected",
                message: "The sign-in attempt has been rejected.",
              });
            } else {
              setNotice({
                tone: "error",
                title: "Rejection failed",
                message: result.error || "Failed to reject login.",
              });
            }
          }
          // Clear URL params
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          setNotice({
            tone: "error",
            title: "Approval error",
            message: error instanceof Error ? error.message : "An error occurred during login approval.",
          });
        } finally {
          setIsSubmitting(false);
        }
      }
    };

    handleLoginApproval();
  }, []);

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    email.touch();
    password.touch();

    if (errors.email || errors.password) {
      setNotice({
        tone: "error",
        title: "Check required fields",
        message: "Enter valid SecureLocker credentials to continue.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const session = await authApi.login({
        email: email.value,
        password: password.value,
        rememberDevice,
      });

      if (!("accessToken" in session)) {
        if ("sessionToken" in session && session.status === "2fa_required") {
          onTwoFactorRequired(session.sessionToken);
          return;
        }
        onSecurityReviewRequired(email.value);
        return;
      }

      storeSession(session);
      setNotice({
        tone: "success",
        title: "Secure session established",
        message: `Signed in as ${session.user.email}.`,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "EMAIL_NOT_VERIFIED") {
        onVerificationRequired(email.value);
        return;
      }
      if (error instanceof ApiError && error.code === "SECURITY_QUESTIONS_REQUIRED") {
        setNotice({
          message: error.message,
          title: "Recovery questions required",
          tone: "warning",
        });
        return;
      }
      if (error instanceof ApiError && (error.code === "ACCOUNT_LOCKED" || error.code === "ACCOUNT_DEACTIVATED")) {
        onAccountLocked(email.value);
        return;
      }
      setNotice({
        tone: "error",
        title: "Sign-in failed",
        message: error instanceof Error ? error.message : "SecureLocker could not sign in.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function requestPasswordRecovery() {
    email.touch();

    if (errors.email) {
      setNotice({
        tone: "warning",
        title: "Email required for recovery",
        message: "Enter a valid email address before requesting password recovery.",
      });
      return;
    }

    onForgotPassword();
  }

  return (
    <motion.form
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      className="auth-form"
      exit={{ opacity: 0, x: -24, filter: "blur(4px)" }}
      initial={{ opacity: 0, x: 24, filter: "blur(4px)" }}
      onSubmit={submitLogin}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="auth-form__header">
        <span className="eyebrow">Secure access</span>
        <h1>Unlock SecureLocker</h1>
        <p>Authenticate before accessing encrypted workstation controls.</p>
      </div>

      <AnimatePresence>{notice ? <AuthNotice notice={notice} /> : null}</AnimatePresence>

      <div className="auth-form__fields">
        <TextField
          autoComplete="email"
          error={errors.email}
          icon={<Mail aria-hidden="true" />}
          id="login-email"
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
          autoComplete="current-password"
          error={errors.password}
          icon={<LockKeyhole aria-hidden="true" />}
          id="login-password"
          label="Password"
          onBlur={password.onBlur}
          onChange={password.onChange}
          placeholder="Enter password"
          touched={password.touched}
          value={password.value}
          visible={passwordVisible}
        />
      </div>

      <div className="auth-form__options">
        <label className="secure-check">
          <input
            checked={rememberDevice}
            onChange={(event) => setRememberDevice(event.currentTarget.checked)}
            type="checkbox"
          />
          <span aria-hidden="true" />
          Remember this device
        </label>
        <button className="text-action" onClick={requestPasswordRecovery} type="button">
          Forgot password?
        </button>
      </div>

      <Button className="auth-form__submit" disabled={!canSubmit} loading={isSubmitting} type="submit">
        Continue securely
      </Button>

      <p className="auth-form__switch">
        New to SecureLocker?
        <button onClick={onSwitchMode} type="button">
          Create account
        </button>
      </p>
    </motion.form>
  );
}
