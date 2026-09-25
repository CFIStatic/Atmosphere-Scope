"use client";

import { useState } from "react";

export function PasswordField({
  name,
  label,
  autoComplete,
  minLength,
}: {
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}) {
  const [shown, setShown] = useState(false);
  return (
    <label className="field">
      {label}
      <span className="password-row">
        <input name={name} type={shown ? "text" : "password"} autoComplete={autoComplete} required minLength={minLength} />
        <button className="btn secondary" type="button" aria-pressed={shown} onClick={() => setShown((value) => !value)}>
          {shown ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );
}
