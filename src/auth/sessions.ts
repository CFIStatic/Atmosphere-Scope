import { createSupabaseAdmin } from "@/auth/supabase-server";

/** Ends other Supabase sessions after a password change. Failure does not undo the new password. */
export async function revokeUserSessions(userId: string): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin || !userId) return;
  try {
    await admin.auth.admin.signOut(userId, "global");
  } catch {
    /* the password change already succeeded */
  }
}
