import { useState } from "react";

export function useFormField(initialValue = "") {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  return {
    value,
    touched,
    setValue,
    onChange: (nextValue: string) => setValue(nextValue),
    onBlur: () => setTouched(true),
    touch: () => setTouched(true),
  };
}
