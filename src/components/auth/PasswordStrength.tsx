import { clsx } from "clsx";
import type { PasswordStrength as PasswordStrengthState } from "../../lib/validation";

type PasswordStrengthProps = {
  strength: PasswordStrengthState;
  visible: boolean;
};

export function PasswordStrength({ strength, visible }: PasswordStrengthProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className={clsx("password-strength", `password-strength--${strength.level}`)}>
      <div className="password-strength__track" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className={index < strength.score ? "is-active" : undefined} />
        ))}
      </div>
      <div className="password-strength__copy">
        <strong>{strength.label}</strong>
        <span>{strength.details}</span>
      </div>
    </div>
  );
}
