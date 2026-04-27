import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { Button } from "../ui/Button";

type ApproveSignInProps = {
  onBack: () => void;
  token: string | null;
};

export function ApproveSignIn({ onBack, token }: ApproveSignInProps) {
  const [status, setStatus] = useState<"approving" | "success" | "error">("approving");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid approval link");
      return;
    }

    fetch(`/api/security/trust-ip?token=${encodeURIComponent(token)}&json=true`, {
      method: "GET",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStatus("success");
          setMessage(data.message);
        } else {
          setStatus("error");
          setMessage(data.message);
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Failed to approve sign-in");
      });
  }, [token]);

  return (
    <motion.div
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      className="auth-form"
      exit={{ opacity: 0, x: 24, filter: "blur(4px)" }}
      initial={{ opacity: 0, x: -24, filter: "blur(4px)" }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="auth-form__header">
        <span className="eyebrow">Sign-in approval</span>
        <h1>
          {status === "approving" ? "Approving sign-in..." : status === "success" ? "Sign-in approved" : "Approval failed"}
        </h1>
        <p>{message || "Processing your approval request..."}</p>
      </div>

      <div className="verification-mark verification-mark--success" aria-hidden="true">
        <ShieldCheck />
      </div>

      {status === "success" ? (
        <Button className="auth-form__submit" onClick={onBack}>
          Return to login
        </Button>
      ) : status === "error" ? (
        <Button className="auth-form__submit" onClick={onBack}>
          Back to login
        </Button>
      ) : null}
    </motion.div>
  );
}