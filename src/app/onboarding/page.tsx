import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { SignupForm } from "@/components/signup-form";
import { safeNext } from "@/auth/gate";
import { getActor } from "@/auth/request-session";
import { membershipFor } from "@/storage/workspace-book";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const { actor } = await getActor();
  if (!actor) redirect(`/signup?step=2&next=${encodeURIComponent(safeNext(params.next))}`);
  const membership = await membershipFor(actor.userId).catch(() => null);
  return (
    <AuthCard title="Set up the company" lede="Add the address and license that will appear on estimates. Empty fields stay empty. Next is Record.">
      <SignupForm step={2} nextPath={safeNext(params.next)} email={actor.email} initialCompany={membership?.org.name ?? ""} signedIn />
    </AuthCard>
  );
}
