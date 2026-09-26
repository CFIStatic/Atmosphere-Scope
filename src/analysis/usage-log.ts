import { listCostUsd } from "@/domain/workspace";

export function noteModelUse(payload: unknown, model: string, jobId?: string | null): void {
  const usage = payload && typeof payload === "object" ? (payload as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } }).usage : null;
  if (!usage) return;
  const inputTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null;
  const outputTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : null;
  if (inputTokens == null && outputTokens == null) return;
  void import("@/storage/workspace-book")
    .then(({ addUsage }) => addUsage({
      orgId: null,
      userEmail: "",
      jobId: jobId ?? null,
      model,
      inputTokens,
      outputTokens,
      costUsd: listCostUsd(model, inputTokens, outputTokens),
    }))
    .catch(() => undefined);
}
