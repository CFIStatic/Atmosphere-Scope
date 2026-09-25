import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase() ?? "";
const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim() || "";
const site = (process.env.SITE_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");

if (!email || !email.includes("@") || !url || !key) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SITE_URL=https://your-domain node scripts/create-admin.mjs you@example.com");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let user = null;
for (let page = 1; page <= 10 && !user; page += 1) {
  const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (listed.error) {
    console.error("The user list was not loaded.");
    process.exit(1);
  }
  user = listed.data.users.find((item) => item.email?.toLowerCase() === email) ?? null;
  if (listed.data.users.length < 200) break;
}

if (!user) {
  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${site}/auth/callback?next=/auth/reset`,
  });
  if (invited.error || !invited.data.user) {
    console.error("The invite was not sent. Check the Supabase auth logs. The key was not printed.");
    process.exit(1);
  }
  user = invited.data.user;
  console.log("Invite sent. They set a password from the email.");
}

const updated = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: { ...user.app_metadata, role: "admin" },
});
if (updated.error) {
  console.error("The role was not saved. The key was not printed.");
  process.exit(1);
}

console.log("app_metadata.role is admin for " + email + ". Sign in again so the session picks up the role.");
