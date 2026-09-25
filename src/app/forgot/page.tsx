import { AuthCard } from "@/components/auth-card";
import { ForgotForm } from "@/components/forgot-form";

export const dynamic = "force-dynamic";

export default function ForgotPage() {
  return (
    <AuthCard title="Forgot password" lede="Ask for a reset link. The reply is the same whether or not that email has an account.">
      <ForgotForm />
    </AuthCard>
  );
}
