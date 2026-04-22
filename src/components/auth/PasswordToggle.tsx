import { Eye, EyeOff } from "lucide-react";

type PasswordToggleProps = {
  isVisible: boolean;
  onToggle: () => void;
};

export function PasswordToggle({ isVisible, onToggle }: PasswordToggleProps) {
  return (
    <button
      aria-label={isVisible ? "Hide password" : "Show password"}
      className="password-toggle"
      onClick={onToggle}
      type="button"
    >
      {isVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </button>
  );
}
