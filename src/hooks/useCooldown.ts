import { useEffect, useState } from "react";

export function useCooldown() {
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (remainingSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [remainingSeconds]);

  return {
    isCoolingDown: remainingSeconds > 0,
    remainingSeconds,
    startCooldown: (seconds = 60) => setRemainingSeconds(Math.max(0, Math.ceil(seconds))),
  };
}
