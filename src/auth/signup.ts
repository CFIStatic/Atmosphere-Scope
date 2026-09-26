import type { AccountRole } from "@/auth/gate";

export const SIGNUP_EXISTS = "An account with this email already exists. Sign in, or open the invite from your admin.";

export type SignupMembership = { orgId: string; role: AccountRole; revoked: boolean } | null;

export type SignupPlan =
  | { kind: "create"; role: "admin"; companyName: string }
  | { kind: "join"; role: AccountRole; orgId: string }
  | { kind: "error"; error: string };

/** A new company makes the signer its admin. An existing invite joins that company instead. */
export function signupPlan(input: { companyName: string; membership: SignupMembership }): SignupPlan {
  if (input.membership && !input.membership.revoked) {
    return { kind: "join", role: input.membership.role, orgId: input.membership.orgId };
  }
  const companyName = input.companyName.trim();
  if (companyName.length < 2) return { kind: "error", error: "Enter your company name." };
  return { kind: "create", role: "admin", companyName };
}

export type SignupOutcome = "session" | "confirm" | "exists" | "error";

/**
 * Supabase returns a session when email confirmation is off.
 * A new unconfirmed user has no session and at least one identity.
 * An existing email comes back with an error, or with an empty identities list and no session.
 */
export function signupOutcome(input: { error: string | null; hasSession: boolean; identityCount: number | null }): SignupOutcome {
  if (input.error) {
    if (/already registered|already exists|already been registered/i.test(input.error)) return "exists";
    return "error";
  }
  if (input.hasSession) return "session";
  if (input.identityCount === 0) return "exists";
  return "confirm";
}
