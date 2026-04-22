import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { AuthNotice, type AuthNoticeState } from "./AuthNotice";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { authApi, type SecurityQuestion } from "../../lib/authApi";

type SecurityQuestionSetupProps = {
  token: string | null;
  onComplete: () => void;
};

const emptyRows = [
  { questionId: "", answer: "" },
  { questionId: "", answer: "" },
  { questionId: "", answer: "" },
];

export function SecurityQuestionSetup({ onComplete, token }: SecurityQuestionSetupProps) {
  const [questions, setQuestions] = useState<SecurityQuestion[]>([]);
  const [rows, setRows] = useState(emptyRows);
  const [touched, setTouched] = useState([false, false, false]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<AuthNoticeState | null>(null);

  useEffect(() => {
    let active = true;
    authApi
      .getSecurityQuestions()
      .then((result) => {
        if (!active) return;

        if (result.questions.length < 3) {
          setNotice({
            message: "Security questions are unavailable. Check that the database has been seeded.",
            title: "Questions unavailable",
            tone: "error",
          });
          return;
        }

        setQuestions(result.questions);
      })
      .catch((error) => {
        if (active) {
          setNotice({
            message: error instanceof Error ? error.message : "SecureLocker could not load recovery questions.",
            title: "Questions unavailable",
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
  }, []);

  const duplicateQuestion = useMemo(() => {
    const selected = rows.map((row) => row.questionId).filter(Boolean);
    return selected.length !== new Set(selected).size;
  }, [rows]);

  const canSubmit =
    Boolean(token) &&
    !isLoading &&
    !duplicateQuestion &&
    rows.every((row) => row.questionId && row.answer.trim().length >= 2);

  function updateRow(index: number, value: Partial<(typeof rows)[number]>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...value } : row)));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched([true, true, true]);

    if (!canSubmit || !token) {
      setNotice({
        message: "Choose three different questions and enter your answers.",
        title: "Recovery setup needs attention",
        tone: "error",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await authApi.setupSecurityQuestions(token, rows);
      setNotice({ message: result.message, title: "Recovery questions secured", tone: "success" });
      window.history.replaceState({}, document.title, window.location.pathname);
      window.setTimeout(onComplete, 900);
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : "SecureLocker could not save recovery questions.",
        title: "Setup failed",
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
        <span className="eyebrow">Recovery protection</span>
        <h1>Set recovery questions</h1>
        <p>Choose three questions only you can answer.</p>
      </div>

      <div className="verification-mark" aria-hidden="true">
        <ShieldCheck />
      </div>

      <AnimatePresence>{notice ? <AuthNotice notice={notice} /> : null}</AnimatePresence>

      <div className="auth-form__fields">
        {rows.map((row, index) => (
          <div className="secure-question-row" key={index}>
            <label className="field">
              <span className="field__label">Security question {index + 1}</span>
              <span className="field__control">
                <select
                  className="secure-select"
                  disabled={isLoading}
                  onBlur={() => setTouched((current) => current.map((value, i) => (i === index ? true : value)))}
                  onChange={(event) => updateRow(index, { questionId: event.currentTarget.value })}
                  value={row.questionId}
                >
                  <option value="">Choose a question</option>
                  {questions.map((question) => (
                    <option
                      disabled={rows.some((selected, selectedIndex) => selectedIndex !== index && selected.questionId === question.id)}
                      key={question.id}
                      value={question.id}
                    >
                      {question.prompt}
                    </option>
                  ))}
                </select>
              </span>
              {touched[index] && (!row.questionId || duplicateQuestion) ? (
                <span className="field__error">Choose a different question.</span>
              ) : null}
            </label>
            <TextField
              error={row.answer.trim().length < 2 ? "Answer is required." : undefined}
              id={`security-answer-${index}`}
              label={`Answer ${index + 1}`}
              onBlur={() => setTouched((current) => current.map((value, i) => (i === index ? true : value)))}
              onChange={(answer) => updateRow(index, { answer })}
              placeholder="Enter answer"
              touched={touched[index]}
              type="password"
              value={row.answer}
            />
          </div>
        ))}
      </div>

      <Button className="auth-form__submit" disabled={!canSubmit} loading={isSubmitting || isLoading} type="submit">
        {isLoading ? "Loading questions" : "Secure recovery"}
      </Button>
    </motion.form>
  );
}
