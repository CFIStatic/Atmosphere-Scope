import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "@/components/login-form";
import { authMode } from "@/auth/access";
import { safeNext } from "@/auth/gate";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const notice = params.error === "config"
    ? "Sign-in is not available until Supabase is configured."
    : params.error === "link"
      ? "This link is expired or invalid. Request another reset email."
      : null;
  return (
    <AuthCard title="Sign in">
      <LoginForm devFallback={authMode() !== "supabase"} nextPath={safeNext(params.next)} notice={notice} />
    </AuthCard>
  );
}
