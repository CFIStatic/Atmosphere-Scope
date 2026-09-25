import { redirect } from "next/navigation";

export default function UnderwritingPage() {
  redirect("/estimate?report=underwriting");
}