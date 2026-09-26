import { listCostUsd } from "@/domain/workspace";

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type UsageAttribution = { orgId: string | null; userEmail: string };

export async function callerAttribution(): Promise<UsageAttribution> {
  try {
    const { getActor } = await import("@/auth/request-session");
    const { actor } = await getActor();
    if (!actor) return { orgId: null, userEmail: "" };
    const { membershipFor } = await import("@/storage/workspace-book");
    const membership = await membershipFor(actor.userId).catch(() => null);
    return { orgId: membership?.org.id ?? null, userEmail: actor.email };
  } catch {
    return { orgId: null, userEmail: "" };
  }
}

export async function noteModelUse(payload: unknown, model: string, jobId?: string | null, attribution?: UsageAttribution): Promise<void> {
  const usage = payload && typeof payload === "object"
    ? (payload as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; input_tokens?: unknown; output_tokens?: unknown } }).usage
    : null;
  if (!usage) return;
  const inputTokens = tokenCount(usage.prompt_tokens) ?? tokenCount(usage.input_tokens);
  const outputTokens = tokenCount(usage.completion_tokens) ?? tokenCount(usage.output_tokens);
  if (inputTokens == null && outputTokens == null) return;
  try {
    let orgId: string | null = null;
    let userEmail = "";
    if (attribution) {
      orgId = attribution.orgId;
      userEmail = attribution.userEmail;
    } else {
      const caller = await callerAttribution();
      orgId = caller.orgId;
      userEmail = caller.userEmail;
    }
    const { addUsage } = await import("@/storage/workspace-book");
    await addUsage({
      orgId,
      userEmail,
      jobId: jobId ?? null,
      model,
      inputTokens,
      outputTokens,
      costUsd: listCostUsd(model, inputTokens, outputTokens),
    });
  } catch {
    /* a usage write must not fail the model call */
  }
}
