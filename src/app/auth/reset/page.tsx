import { AuthCard } from "@/components/auth-card";
import { ResetForm } from "@/components/reset-form";

export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <AuthCard title="Set a new password" lede="Choose at least 8 characters. Open this page from the invite or reset link.">
      <ResetForm invalid={params.error === "invalid"} />
    </AuthCard>
  );
}
