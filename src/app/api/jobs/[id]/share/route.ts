import { NextResponse } from "next/server";
import { siteOrigin } from "@/auth/http";
import { getActor, getRequestSession } from "@/auth/request-session";
import { resendConfigured, sendMail, shareEmail } from "@/email/resend";
import { addJobShare } from "@/storage/shares";
import { addJobEvent, membershipFor } from "@/storage/workspace-book";
import { assertJobWriter, loadVisibleJob } from "@/storage/visible-jobs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const loaded = await loadVisibleJob(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const writer = await assertJobWriter();
  if ("error" in writer) return NextResponse.json({ error: writer.error }, { status: writer.status });
  const { session } = await getRequestSession();
  if (session && session.role === "customer") return NextResponse.json({ error: "This account cannot share a job." }, { status: 403 });
  const body = (await request.json()) as { email?: string };
  try {
    const share = await addJobShare(id, body.email ?? "");
    const { actor } = await getActor();
    const membership = actor ? await membershipFor(actor.userId).catch(() => null) : null;
    await addJobEvent({
      jobId: id,
      orgId: membership?.org.id ?? null,
      actorEmail: actor?.email ?? "",
      summary: "Job shared with a customer",
    }).catch(() => undefined);
    let mailed = false;
    if (resendConfigured() && share.email) {
      const link = `${siteOrigin(request)}/jobs/${id}`;
      const name = loaded.job.customer.name.trim() || loaded.job.property.address.trim() || "A job";
      mailed = (await sendMail(shareEmail({ email: share.email, jobName: name, link }))).sent;
    }
    return NextResponse.json({ share, mailed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The job was not shared.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
