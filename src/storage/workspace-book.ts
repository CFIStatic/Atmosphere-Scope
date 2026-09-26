import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { authMode } from "@/auth/access";
import type { AccountRole } from "@/auth/gate";
import { createSupabaseAdmin } from "@/auth/supabase-server";
import {
  blankDefaults,
  type EstimateDefaults,
  type JobEvent,
  type LocalCredential,
  type Member,
  type NotificationPref,
  type Org,
  type Profile,
  type UsageRow,
} from "@/domain/workspace";

const MIGRATION = "Apply supabase/migrations/20260926160000_account_settings.sql";

type Book = {
  profiles: Profile[];
  orgs: Org[];
  members: Member[];
  defaults: EstimateDefaults[];
  notifications: NotificationPref[];
  events: JobEvent[];
  usage: UsageRow[];
  credentials: LocalCredential[];
};

const empty = (): Book => ({
  profiles: [],
  orgs: [],
  members: [],
  defaults: [],
  notifications: [],
  events: [],
  usage: [],
  credentials: [],
});

function dir(): string {
  return process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), "data", "account");
}

let chain: Promise<unknown> = Promise.resolve();

function remote(): boolean {
  return authMode() === "supabase";
}

async function readBook(): Promise<Book> {
  try {
    const raw = await readFile(path.join(dir(), "book.json"), "utf8");
    const parsed = JSON.parse(raw) as Partial<Book>;
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

async function writeBook(book: Book): Promise<void> {
  const folder = dir();
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "book.json"), JSON.stringify(book, null, 2));
}

function mutate<T>(fn: (book: Book) => T | Promise<T>): Promise<T> {
  const run = chain.then(() => readBook()).then(async (book) => {
    const result = await fn(book);
    await writeBook(book);
    return result;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function admin() {
  const client = createSupabaseAdmin();
  if (!client) throw new Error("The service role key is missing on the server.");
  return client;
}

function fail(error: { message?: string } | null): void {
  if (error) throw new Error(`${MIGRATION} (${error.message ?? "request failed"})`);
}

export async function getProfile(userId: string, email: string): Promise<Profile> {
  if (remote()) {
    const client = admin();
    const { data, error } = await client.from("profiles").select("*").eq("user_id", userId).maybeSingle();
    fail(error);
    if (!data) {
      const created: Profile = { userId, email, fullName: "", avatarUrl: "", onboardingComplete: false };
      const inserted = await client.from("profiles").insert({
        user_id: userId,
        email,
        full_name: "",
        avatar_url: "",
        onboarding_complete: false,
      });
      fail(inserted.error);
      return created;
    }
    return {
      userId: data.user_id,
      email: data.email,
      fullName: data.full_name ?? "",
      avatarUrl: data.avatar_url ?? "",
      onboardingComplete: Boolean(data.onboarding_complete),
    };
  }
  return mutate((book) => {
    const found = book.profiles.find((item) => item.userId === userId);
    if (found) return found;
    const created: Profile = { userId, email, fullName: "", avatarUrl: "", onboardingComplete: false };
    book.profiles.push(created);
    return created;
  });
}

export async function saveProfile(userId: string, email: string, patch: Partial<Pick<Profile, "fullName" | "avatarUrl" | "onboardingComplete">>): Promise<Profile> {
  const current = await getProfile(userId, email);
  const next = { ...current, ...patch, userId, email };
  if (remote()) {
    const { error } = await admin().from("profiles").upsert({
      user_id: userId,
      email,
      full_name: next.fullName,
      avatar_url: next.avatarUrl,
      onboarding_complete: next.onboardingComplete,
      updated_at: new Date().toISOString(),
    });
    fail(error);
    return next;
  }
  return mutate((book) => {
    const index = book.profiles.findIndex((item) => item.userId === userId);
    if (index >= 0) book.profiles[index] = next;
    else book.profiles.push(next);
    return next;
  });
}

export async function membershipFor(userId: string): Promise<{ org: Org; member: Member; defaults: EstimateDefaults } | null> {
  if (remote()) {
    const client = admin();
    const { data, error } = await client.from("org_members").select("*").eq("user_id", userId).is("revoked_at", null).maybeSingle();
    fail(error);
    if (!data) return null;
    const orgRow = await client.from("orgs").select("*").eq("id", data.org_id).maybeSingle();
    fail(orgRow.error);
    if (!orgRow.data) return null;
    const defaultsRow = await client.from("org_estimate_defaults").select("*").eq("org_id", data.org_id).maybeSingle();
    fail(defaultsRow.error);
    const org: Org = {
      id: orgRow.data.id,
      name: orgRow.data.name ?? "",
      address: orgRow.data.address ?? "",
      logoUrl: orgRow.data.logo_url ?? "",
      licenseNumbers: orgRow.data.license_numbers ?? "",
    };
    const member: Member = {
      orgId: data.org_id,
      userId: data.user_id,
      email: data.email,
      fullName: data.full_name ?? "",
      role: data.role,
      revokedAt: data.revoked_at,
    };
    const defaults = defaultsRow.data
      ? {
          orgId: data.org_id,
          taxRate: defaultsRow.data.tax_rate ?? "",
          overheadPct: defaultsRow.data.overhead_pct ?? "",
          profitPct: defaultsRow.data.profit_pct ?? "",
          priceListRegion: defaultsRow.data.price_list_region ?? "",
          laborRates: Array.isArray(defaultsRow.data.labor_rates) ? defaultsRow.data.labor_rates : [],
        }
      : blankDefaults(data.org_id);
    return { org, member, defaults };
  }
  return mutate((book) => {
    const member = book.members.find((item) => item.userId === userId && !item.revokedAt);
    if (!member) return null;
    const org = book.orgs.find((item) => item.id === member.orgId);
    if (!org) return null;
    const defaults = book.defaults.find((item) => item.orgId === org.id) ?? blankDefaults(org.id);
    return { org, member, defaults };
  });
}

export async function saveOrg(userId: string, email: string, role: AccountRole, input: { name: string; address: string; licenseNumbers: string; logoUrl?: string }): Promise<Org> {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Enter the company name.");
  const existing = await membershipFor(userId);
  if (remote()) {
    const client = admin();
    if (existing) {
      const { error } = await client.from("orgs").update({
        name,
        address: input.address.trim(),
        license_numbers: input.licenseNumbers.trim(),
        logo_url: input.logoUrl ?? existing.org.logoUrl,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.org.id);
      fail(error);
      await saveProfile(userId, email, { onboardingComplete: true });
      return { ...existing.org, name, address: input.address.trim(), licenseNumbers: input.licenseNumbers.trim(), logoUrl: input.logoUrl ?? existing.org.logoUrl };
    }
    const id = crypto.randomUUID();
    const inserted = await client.from("orgs").insert({ id, name, address: input.address.trim(), license_numbers: input.licenseNumbers.trim(), logo_url: input.logoUrl ?? "" });
    fail(inserted.error);
    const member = await client.from("org_members").insert({
      org_id: id,
      user_id: userId,
      email,
      full_name: "",
      role,
    });
    fail(member.error);
    await saveProfile(userId, email, { onboardingComplete: true });
    return { id, name, address: input.address.trim(), logoUrl: input.logoUrl ?? "", licenseNumbers: input.licenseNumbers.trim() };
  }
  return mutate((book) => {
    if (existing) {
      const org = book.orgs.find((item) => item.id === existing.org.id);
      if (!org) throw new Error("The company was not found.");
      org.name = name;
      org.address = input.address.trim();
      org.licenseNumbers = input.licenseNumbers.trim();
      if (input.logoUrl != null) org.logoUrl = input.logoUrl;
      const profile = book.profiles.find((item) => item.userId === userId);
      if (profile) profile.onboardingComplete = true;
      return org;
    }
    const org: Org = { id: crypto.randomUUID(), name, address: input.address.trim(), logoUrl: input.logoUrl ?? "", licenseNumbers: input.licenseNumbers.trim() };
    book.orgs.push(org);
    book.members.push({ orgId: org.id, userId, email, fullName: "", role, revokedAt: null });
    book.defaults.push(blankDefaults(org.id));
    const profile = book.profiles.find((item) => item.userId === userId);
    if (profile) profile.onboardingComplete = true;
    else book.profiles.push({ userId, email, fullName: "", avatarUrl: "", onboardingComplete: true });
    return org;
  });
}

export async function saveDefaults(userId: string, defaults: EstimateDefaults): Promise<EstimateDefaults> {
  const member = await membershipFor(userId);
  if (!member) throw new Error("Set up the company before estimate defaults.");
  const next = { ...defaults, orgId: member.org.id };
  if (remote()) {
    const { error } = await admin().from("org_estimate_defaults").upsert({
      org_id: member.org.id,
      tax_rate: next.taxRate,
      overhead_pct: next.overheadPct,
      profit_pct: next.profitPct,
      price_list_region: next.priceListRegion,
      labor_rates: next.laborRates,
    });
    fail(error);
    return next;
  }
  return mutate((book) => {
    const index = book.defaults.findIndex((item) => item.orgId === member.org.id);
    if (index >= 0) book.defaults[index] = next;
    else book.defaults.push(next);
    return next;
  });
}

export async function listMembers(userId: string): Promise<Member[]> {
  const member = await membershipFor(userId);
  if (!member) return [];
  if (remote()) {
    const { data, error } = await admin().from("org_members").select("*").eq("org_id", member.org.id);
    fail(error);
    return (data ?? []).map((row) => ({
      orgId: row.org_id,
      userId: row.user_id,
      email: row.email,
      fullName: row.full_name ?? "",
      role: row.role,
      revokedAt: row.revoked_at,
    }));
  }
  return mutate((book) => book.members.filter((item) => item.orgId === member.org.id));
}

export async function addMember(actorId: string, input: { email: string; role: AccountRole; userId?: string; fullName?: string }): Promise<Member> {
  const actor = await membershipFor(actorId);
  if (!actor || actor.member.role !== "admin") throw new Error("An admin has to invite someone.");
  if (input.role !== "estimator" && input.role !== "customer") throw new Error("Invite an estimator or a customer.");
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Enter an email.");
  const row: Member = {
    orgId: actor.org.id,
    userId: input.userId || email,
    email,
    fullName: input.fullName?.trim() ?? "",
    role: input.role,
    revokedAt: null,
  };
  if (remote()) {
    const { error } = await admin().from("org_members").upsert({
      org_id: row.orgId,
      user_id: row.userId,
      email: row.email,
      full_name: row.fullName,
      role: row.role,
      revoked_at: null,
    });
    fail(error);
    return row;
  }
  return mutate((book) => {
    const index = book.members.findIndex((item) => item.orgId === row.orgId && item.email === email);
    if (index >= 0) book.members[index] = { ...book.members[index], ...row, revokedAt: null };
    else book.members.push(row);
    return row;
  });
}

export async function revokeMember(actorId: string, email: string): Promise<void> {
  const actor = await membershipFor(actorId);
  if (!actor || actor.member.role !== "admin") throw new Error("An admin has to revoke someone.");
  const target = email.trim().toLowerCase();
  if (target === actor.member.email) throw new Error("You cannot revoke your own account here.");
  if (remote()) {
    const { error } = await admin().from("org_members").update({ revoked_at: new Date().toISOString() }).eq("org_id", actor.org.id).eq("email", target);
    fail(error);
    return;
  }
  await mutate((book) => {
    const member = book.members.find((item) => item.orgId === actor.org.id && item.email === target);
    if (member) member.revokedAt = new Date().toISOString();
  });
}

export async function notificationPref(userId: string): Promise<NotificationPref> {
  const fallback = { userId, jobShared: true, invites: true };
  if (remote()) {
    const { data, error } = await admin().from("notification_prefs").select("*").eq("user_id", userId).maybeSingle();
    fail(error);
    if (!data) return fallback;
    return { userId, jobShared: Boolean(data.job_shared), invites: Boolean(data.invites) };
  }
  return mutate((book) => book.notifications.find((item) => item.userId === userId) ?? fallback);
}

export async function saveNotificationPref(userId: string, pref: NotificationPref): Promise<NotificationPref> {
  const next = { userId, jobShared: Boolean(pref.jobShared), invites: Boolean(pref.invites) };
  if (remote()) {
    const { error } = await admin().from("notification_prefs").upsert({ user_id: userId, job_shared: next.jobShared, invites: next.invites });
    fail(error);
    return next;
  }
  return mutate((book) => {
    const index = book.notifications.findIndex((item) => item.userId === userId);
    if (index >= 0) book.notifications[index] = next;
    else book.notifications.push(next);
    return next;
  });
}

export async function addJobEvent(event: Omit<JobEvent, "id" | "createdAt">): Promise<JobEvent> {
  const row: JobEvent = { ...event, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  if (remote()) {
    const { error } = await admin().from("job_events").insert({
      id: row.id,
      job_id: row.jobId,
      org_id: row.orgId,
      actor_email: row.actorEmail,
      summary: row.summary,
      created_at: row.createdAt,
    });
    fail(error);
    return row;
  }
  return mutate((book) => {
    book.events.push(row);
    return row;
  });
}

export async function eventsForJob(jobId: string): Promise<JobEvent[]> {
  if (remote()) {
    const { data, error } = await admin().from("job_events").select("*").eq("job_id", jobId).order("created_at", { ascending: false });
    fail(error);
    return (data ?? []).map((row) => ({
      id: row.id,
      jobId: row.job_id,
      orgId: row.org_id,
      actorEmail: row.actor_email,
      summary: row.summary,
      createdAt: row.created_at,
    }));
  }
  return mutate((book) => book.events.filter((item) => item.jobId === jobId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function addUsage(row: Omit<UsageRow, "id" | "createdAt">): Promise<void> {
  const next: UsageRow = { ...row, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  if (remote()) {
    const { error } = await admin().from("api_usage").insert({
      id: next.id,
      org_id: next.orgId,
      user_email: next.userEmail,
      job_id: next.jobId,
      model: next.model,
      input_tokens: next.inputTokens,
      output_tokens: next.outputTokens,
      cost_usd: next.costUsd,
      created_at: next.createdAt,
    });
    if (error) return;
    return;
  }
  await mutate((book) => {
    book.usage.push(next);
  });
}

export async function usageSince(userId: string, sinceIso: string): Promise<UsageRow[]> {
  const member = await membershipFor(userId);
  if (remote()) {
    let query = admin().from("api_usage").select("*").gte("created_at", sinceIso).order("created_at", { ascending: true });
    if (member) query = query.eq("org_id", member.org.id);
    const { data, error } = await query;
    fail(error);
    return (data ?? []).map((row) => ({
      id: row.id,
      orgId: row.org_id,
      userEmail: row.user_email ?? "",
      jobId: row.job_id,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      costUsd: row.cost_usd == null ? null : Number(row.cost_usd),
      createdAt: row.created_at,
    }));
  }
  return mutate((book) => book.usage.filter((item) => item.createdAt >= sinceIso && (!member || item.orgId === member.org.id || item.orgId == null)));
}

export async function findCredential(email: string): Promise<LocalCredential | null> {
  if (remote()) return null;
  const key = email.trim().toLowerCase();
  return mutate((book) => book.credentials.find((item) => item.email === key) ?? null);
}

export async function saveCredential(credential: LocalCredential): Promise<void> {
  if (remote()) return;
  await mutate((book) => {
    const index = book.credentials.findIndex((item) => item.email === credential.email);
    if (index >= 0) book.credentials[index] = credential;
    else book.credentials.push(credential);
  });
}
