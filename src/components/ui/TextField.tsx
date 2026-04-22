import type { InputHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  action?: ReactNode;
  error?: string;
  icon?: ReactNode;
  label: string;
  onChange: (value: string) => void;
  touched?: boolean;
};

export function TextField({
  action,
  className,
  error,
  icon,
  id,
  label,
  onBlur,
  onChange,
  touched = false,
  value,
  ...props
}: TextFieldProps) {
  const showError = touched && Boolean(error);

  return (
    <div className={clsx("field", showError && "field--error", className)}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <span className="field__control">
        {icon ? <span className="field__icon">{icon}</span> : null}
        <input
          aria-describedby={showError && id ? `${id}-error` : undefined}
          aria-invalid={showError}
          id={id}
          onBlur={onBlur}
          onChange={(event) => onChange(event.currentTarget.value)}
          value={value}
          {...props}
        />
        {action ? <span className="field__action">{action}</span> : null}
      </span>
      {showError ? (
        <span className="field__error" id={id ? `${id}-error` : undefined}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
