import { motion } from "motion/react";
import { ShieldAlert } from "lucide-react";
import { Button } from "../ui/Button";

type SecurityReviewPendingProps = {
  email: string;
  onBack: () => void;
};

export function SecurityReviewPending({ email, onBack }: SecurityReviewPendingProps) {
  return (
    <motion.div
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      className="auth-form"
      exit={{ opacity: 0, x: 24, filter: "blur(4px)" }}
      initial={{ opacity: 0, x: -24, filter: "blur(4px)" }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="auth-form__header">
        <span className="eyebrow">Security approval</span>
        <h1>Confirm this sign-in</h1>
        <p>SecureLocker sent approval links to {email || "your verified email"} for this new IP.</p>
      </div>

      <div className="verification-mark verification-mark--warning" aria-hidden="true">
        <ShieldAlert />
      </div>

      <Button className="auth-form__submit" onClick={onBack}>
        Return to login
      </Button>
    </motion.div>
  );
}
