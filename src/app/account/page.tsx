import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const query = params.error ? `?error=${encodeURIComponent(params.error)}` : "";
  redirect(`/settings${query}`);
}
