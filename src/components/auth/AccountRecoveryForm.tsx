import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ShieldAlert } from "lucide-react";
import { AuthNotice, type AuthNoticeState } from "./AuthNotice";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { authApi, type SecurityQuestion } from "../../lib/authApi";

type AccountRecoveryFormProps = {
  token: string | null;
  onComplete: () => void;
};

export function AccountRecoveryForm({ onComplete, token }: AccountRecoveryFormProps) {
  const [questions, setQuestions] = useState<SecurityQuestion[]>([]);
  const [answers, setAnswers] = useState(["", "", ""]);
  const [touched, setTouched] = useState([false, false, false]);
  const [isLoading, setIsLoading] = useState(Boolean(token));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<AuthNoticeState | null>(
    token ? null : { message: "Request a new recovery email before continuing.", title: "Recovery link missing", tone: "error" },
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    authApi
      .getRecoveryChallenge(token)
      .then((result) => {
        if (active) setQuestions(result.questions);
      })
      .catch((error) => {
        if (active) {
          setNotice({
            message: error instanceof Error ? error.message : "SecureLocker could not load recovery challenge.",
            title: "Recovery unavailable",
            tone: "error",
          });
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const canSubmit = Boolean(token) && !isLoading && questions.length === 3 && answers.every((answer) => answer.trim().length >= 2);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched([true, true, true]);

    if (!canSubmit || !token) {
      setNotice({ message: "Answer all three recovery questions.", title: "Recovery needs attention", tone: "error" });
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await authApi.completeAccountRecovery(token, answers);
      setNotice({ message: result.message, title: "Account unlocked", tone: "success" });
      window.history.replaceState({}, document.title, window.location.pathname);
      window.setTimeout(onComplete, 1000);
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : "SecureLocker could not complete recovery.",
        title: "Recovery failed",
        tone: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.form
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      className="auth-form auth-form--dense"
      exit={{ opacity: 0, x: 24, filter: "blur(4px)" }}
      initial={{ opacity: 0, x: -24, filter: "blur(4px)" }}
      onSubmit={submit}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="auth-form__header">
        <span className="eyebrow">Locked account recovery</span>
        <h1>Verify recovery answers</h1>
        <p>Answer your selected questions to unlock SecureLocker access.</p>
      </div>

      <div className="verification-mark verification-mark--warning" aria-hidden="true">
        <ShieldAlert />
      </div>

      <AnimatePresence>{notice ? <AuthNotice notice={notice} /> : null}</AnimatePresence>

      <div className="auth-form__fields">
        {questions.map((question, index) => (
          <TextField
            error={answers[index]?.trim().length < 2 ? "Answer is required." : undefined}
            id={`recovery-answer-${index}`}
            key={question.id}
            label={question.prompt}
            onBlur={() => setTouched((current) => current.map((value, i) => (i === index ? true : value)))}
            onChange={(answer) => setAnswers((current) => current.map((value, i) => (i === index ? answer : value)))}
            placeholder="Enter answer"
            touched={touched[index]}
            type="password"
            value={answers[index] ?? ""}
          />
        ))}
      </div>

      <Button className="auth-form__submit" disabled={!canSubmit} loading={isSubmitting || isLoading} type="submit">
        {isLoading ? "Loading recovery" : "Unlock account"}
      </Button>
    </motion.form>
  );
}
