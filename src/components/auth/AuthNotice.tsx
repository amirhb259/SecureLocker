import { AlertCircle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";

export type AuthNoticeTone = "info" | "warning" | "success" | "error";

export type AuthNoticeState = {
  message: string;
  title: string;
  tone: AuthNoticeTone;
};

const noticeIcons = {
  error: ShieldAlert,
  info: Info,
  success: CheckCircle2,
  warning: AlertCircle,
};

type AuthNoticeProps = {
  notice: AuthNoticeState;
};

export function AuthNotice({ notice }: AuthNoticeProps) {
  const Icon = noticeIcons[notice.tone];

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={`auth-notice auth-notice--${notice.tone}`}
      exit={{ opacity: 0, y: -8 }}
      initial={{ opacity: 0, y: -8 }}
      role={notice.tone === "error" ? "alert" : "status"}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <Icon aria-hidden="true" />
      <span>
        <strong>{notice.title}</strong>
        <small>{notice.message}</small>
      </span>
    </motion.div>
  );
}
