export type PasswordStrengthLevel = "low" | "guarded" | "hardened" | "sealed";

export type PasswordStrength = {
  score: number;
  level: PasswordStrengthLevel;
  label: string;
  details: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateRequired(value: string, label: string) {
  return value.trim() ? "" : `${label} is required.`;
}

export function validateEmail(value: string) {
  const required = validateRequired(value, "Email");

  if (required) {
    return required;
  }

  return emailPattern.test(value.trim()) ? "" : "Enter a valid email address.";
}

export function validateUsername(value: string) {
  const required = validateRequired(value, "Username");

  if (required) {
    return required;
  }

  const trimmed = value.trim();

  if (trimmed.length < 5) {
    return "Username must be at least 5 characters";
  }

  if (trimmed.length > 32) {
    return "Username must be 32 characters or less.";
  }

  if (/^[a-z]/.test(trimmed)) {
    return "Username must start with a capital letter";
  }

  if (!/^[A-Z]/.test(trimmed)) {
    return "Username cannot start with a number or symbol";
  }

  if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
    return "Username can only contain letters and numbers";
  }

  return "";
}

export function scorePassword(value: string): PasswordStrength {
  let score = 0;

  if (value.length >= 10) score += 1;
  if (value.length >= 14) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^a-zA-Z0-9]/.test(value)) score += 1;

  if (score <= 1) {
    return {
      score,
      level: "low",
      label: "Low",
      details: "Use at least 10 characters with more variation.",
    };
  }

  if (score <= 3) {
    return {
      score,
      level: "guarded",
      label: "Guarded",
      details: "Add length, numbers, and symbols for stronger protection.",
    };
  }

  if (score === 4) {
    return {
      score,
      level: "hardened",
      label: "Hardened",
      details: "Strong password profile for this device.",
    };
  }

  return {
    score,
    level: "sealed",
    label: "Sealed",
    details: "Excellent password profile for account creation.",
  };
}

export function validateRegistrationPassword(value: string) {
  const required = validateRequired(value, "Password");

  if (required) {
    return required;
  }

  if (value.length < 10) {
    return "Password must be at least 10 characters.";
  }

  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value)) {
    return "Use both uppercase and lowercase letters.";
  }

  if (!/\d/.test(value)) {
    return "Include at least one number.";
  }

  if (!/[^a-zA-Z0-9]/.test(value)) {
    return "Include at least one symbol.";
  }

  return "";
}

export function validateConfirmPassword(password: string, confirmPassword: string) {
  const required = validateRequired(confirmPassword, "Confirm password");

  if (required) {
    return required;
  }

  return password === confirmPassword ? "" : "Passwords do not match.";
}
