"use client";

import Link from "next/link";
import { useState } from "react";
import { PasswordField } from "@/components/password-field";
import { CONFIRM_SENT, MIN_PASSWORD_LENGTH, passwordProblem, safeNext } from "@/auth/gate";

export function SignupForm({
  step,
  nextPath,
  email: initialEmail,
  initialCompany = "",
  signedIn = false,
}: {
  step: 1 | 2;
  nextPath: string;
  email: string;
  initialCompany?: string;
  signedIn?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [companyName, setCompanyName] = useState(initialCompany);
  const [address, setAddress] = useState("");
  const [licenseNumbers, setLicenseNumbers] = useState("");
  const [confirming, setConfirming] = useState<{ email: string; next: "/onboarding" | "/record" } | null>(null);

  if (confirming) {
    return (
      <div className="grid">
        <h2>Check your email</h2>
        <p className="meta">We sent a confirmation link to {confirming.email}. {confirming.next === "/record" ? "Open it to sign in. You will land on Record." : "Open it, then finish company setup. You will land on Record."}</p>
        <button className="btn secondary" type="button" disabled={pending} onClick={async () => {
          setError(null);
          setNote(null);
          setPending(true);
          const response = await fetch("/api/auth/resend", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: confirming.email, next: confirming.next }),
          });
          const body = await response.json();
          setPending(false);
          if (!response.ok) {
            setError(body.error ?? "The confirmation email was not sent.");
            return;
          }
          setNote(body.message ?? CONFIRM_SENT);
        }}>{pending ? "Sending…" : "Resend confirmation"}</button>
        {note && <p className="meta" role="status">{note}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <p className="auth-switch">Already confirmed? <Link href="/login">Sign in</Link></p>
      </div>
    );
  }

  if (step === 2) {
    return (
      <form className="grid" onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setPending(true);
        const response = await fetch("/api/account/company", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: companyName, address, licenseNumbers }),
        });
        const body = await response.json();
        setPending(false);
        if (!response.ok) {
          setError(body.error ?? "The company was not saved.");
          return;
        }
        const destination = !nextPath || nextPath === "/" ? "/record" : safeNext(nextPath);
        window.location.assign(destination);
      }}>
        <label className="field">Company name
          <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required minLength={2} autoComplete="organization" />
        </label>
        <label className="field">Address
          <input value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" />
        </label>
        <label className="field">License numbers
          <input value={licenseNumbers} onChange={(event) => setLicenseNumbers(event.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn signin-btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Continue"}</button>
      </form>
    );
  }

  return (
    <form className="grid" onSubmit={async (event) => {
      event.preventDefault();
      setError(null);
      const password = String(new FormData(event.currentTarget).get("password") ?? "");
      const problem = passwordProblem(password);
      if (problem) {
        setError(problem);
        return;
      }
      setPending(true);
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, fullName, companyName }),
      });
      const body = await response.json();
      setPending(false);
      if (!response.ok) {
        setError(body.error ?? "The account was not created.");
        return;
      }
      if (body.needsEmailConfirmation) {
        setConfirming({ email, next: body.joined ? "/record" : "/onboarding" });
        return;
      }
      window.location.assign(body.joined ? "/record" : "/onboarding");
    }}>
      <label className="field">Full name
        <input value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={2} autoComplete="name" />
      </label>
      <label className="field">Company name
        <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required minLength={2} autoComplete="organization" />
      </label>
      <label className="field">Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} readOnly={signedIn} placeholder="you@company.com" />
      </label>
      <PasswordField name="password" label="Password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} strength />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn signin-btn" type="submit" disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
      <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
    </form>
  );
}
