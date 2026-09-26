"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { passwordHint } from "@/auth/gate";

export function PasswordField({
  name,
  label,
  autoComplete,
  minLength,
  extra,
  strength = false,
}: {
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  extra?: ReactNode;
  strength?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const [value, setValue] = useState("");
  return (
    <label className="field">
      <span className="field-label">
        <span>{label}</span>
        {extra}
      </span>
      <span className="password-row">
        <input
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          value={strength ? value : undefined}
          onChange={strength ? (event) => setValue(event.target.value) : undefined}
        />
        <button className="password-eye" type="button" aria-pressed={shown} aria-label={shown ? "Hide" : "Show"} onClick={() => setShown((value) => !value)}>
          <EyeIcon open={shown} />
        </button>
      </span>
      {strength ? <span className="meta password-hint">{passwordHint(value)}</span> : null}
    </label>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
      {open ? <path d="M4 5l16 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /> : null}
    </svg>
  );
}
