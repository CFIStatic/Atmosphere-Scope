import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { START_COOKIE, parseStartScreen, startPath } from "@/auth/start-screen";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const jar = await cookies();
  redirect(startPath(parseStartScreen(jar.get(START_COOKIE)?.value)));
}
