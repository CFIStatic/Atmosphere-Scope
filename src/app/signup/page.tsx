import { AuthCard } from "@/components/auth-card";
import { SignupForm } from "@/components/signup-form";
import { authMode } from "@/auth/access";
import { safeNext } from "@/auth/gate";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ step?: string; next?: string; email?: string }> }) {
  const params = await searchParams;
  const step = params.step === "2" ? 2 : 1;
  return (
    <AuthCard
      title={step === 2 ? "Set up the company" : "Create your account"}
      lede={step === 2 ? "Name the company that will appear on estimates." : "Atmosphere Scope workspaces start with an invite on a hosted server."}
    >
      <SignupForm step={step} nextPath={safeNext(params.next)} email={params.email ?? ""} hosted={authMode() === "supabase"} />
    </AuthCard>
  );
}
