"use client";

import Link from "next/link";
import { useState } from "react";
import { PasswordField } from "@/components/password-field";
import { MIN_PASSWORD_LENGTH, passwordProblem, safeNext } from "@/auth/gate";

export function SignupForm({
  step,
  nextPath,
  email: initialEmail,
  hosted,
  signedIn = false,
}: {
  step: 1 | 2;
  nextPath: string;
  email: string;
  hosted: boolean;
  signedIn?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [licenseNumbers, setLicenseNumbers] = useState("");

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
        window.location.assign(safeNext(nextPath === "/" ? "/settings?section=company" : nextPath));
      }}>
        <label className="field">Company name
          <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required minLength={2} />
        </label>
        <label className="field">Address
          <input value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label className="field">License numbers
          <input value={licenseNumbers} onChange={(event) => setLicenseNumbers(event.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save company"}</button>
        <p className="auth-switch"><Link href="/signup">Back to account</Link></p>
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
      window.location.assign("/onboarding");
    }}>
      {hosted && <p className="meta">Hosted accounts are invite-only. Use the link from your admin. This form does not grant a role.</p>}
      {!hosted && <p className="meta">This server keeps the password as a hash and signs you in as an estimator. It does not create an admin.</p>}
      <label className="field">Name
        <input value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={2} autoComplete="name" />
      </label>
      <label className="field">Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" readOnly={signedIn} />
      </label>
      <PasswordField name="password" label="Password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
      <label className="field">Company name
        <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
      <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
    </form>
  );
}
