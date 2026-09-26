import { listCostUsd } from "@/domain/workspace";

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function noteModelUse(payload: unknown, model: string, jobId?: string | null): Promise<void> {
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
    try {
      const { getActor } = await import("@/auth/request-session");
      const { actor } = await getActor();
      if (actor) {
        userEmail = actor.email;
        const { membershipFor } = await import("@/storage/workspace-book");
        const membership = await membershipFor(actor.userId);
        orgId = membership?.org.id ?? null;
      }
    } catch {
      /* attribution stays empty outside a request */
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
