import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { SignupForm } from "@/components/signup-form";
import { authMode } from "@/auth/access";
import { safeNext } from "@/auth/gate";
import { getActor } from "@/auth/request-session";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const { actor } = await getActor();
  if (!actor) redirect(`/signup?step=2&next=${encodeURIComponent(safeNext(params.next))}`);
  return (
    <AuthCard title="Set up the company" lede="This is the first-run company step. Empty license and address fields stay empty.">
      <SignupForm step={2} nextPath={safeNext(params.next)} email={actor.email} hosted={authMode() === "supabase"} signedIn />
    </AuthCard>
  );
}
