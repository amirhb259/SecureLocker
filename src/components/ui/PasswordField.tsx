import type { FormEvent, KeyboardEvent } from "react";
import { TextField, type TextFieldProps } from "./TextField";

type PasswordFieldProps = Omit<TextFieldProps, "type"> & {
  visible?: boolean;
};

function stopPasswordKeyPropagation(event: KeyboardEvent<HTMLInputElement>) {
  event.stopPropagation();
}

function stopPasswordInputPropagation(event: FormEvent<HTMLInputElement>) {
  event.stopPropagation();
}

export function PasswordField({ onInput, onKeyDown, visible = false, ...props }: PasswordFieldProps) {
  return (
    <TextField
      {...props}
      onInput={(event) => {
        stopPasswordInputPropagation(event);
        onInput?.(event);
      }}
      onKeyDown={(event) => {
        stopPasswordKeyPropagation(event);
        onKeyDown?.(event);
      }}
      type={visible ? "text" : "password"}
    />
  );
}
