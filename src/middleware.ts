import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authMode } from "@/auth/access";
import { decideRequest, roleFromAppMetadata } from "@/auth/gate";
import { absoluteUrl, siteOrigin } from "@/auth/http";

export async function middleware(request: NextRequest) {
  const mode = authMode();
  if (mode !== "supabase") return NextResponse.next();

  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const anon = process.env.SUPABASE_ANON_KEY?.trim() ?? "";
  let response = NextResponse.next({ request });
  let signedIn = false;
  let role = null as ReturnType<typeof roleFromAppMetadata>;

  if (url && anon) {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
    role = roleFromAppMetadata(data.user?.app_metadata);
    if (data.user && !role) signedIn = true;
  }

  const decision = decideRequest({
    mode,
    pathname: request.nextUrl.pathname,
    method: request.method,
    signedIn,
    role,
    configured: Boolean(url && anon),
  });

  if (decision.type === "unauthorized") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (decision.type === "redirect") {
    const destination = new URL(absoluteUrl(siteOrigin(request), decision.pathname));
    destination.search = decision.search;
    return NextResponse.redirect(destination);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|brand/|icon-|apple-touch-icon.png|manifest.webmanifest|sw.js).*)"],
};
