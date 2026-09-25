import { openaiKey, pricingModel, type Env } from "@/analysis/config";
import { ASSIST_PARAMETERS, ASSIST_TOOL_NAME, parseProposal, type AssistProposal } from "@/domain/assist";

export async function proposeCommand(
  prompt: string,
  context: string,
  options: { env?: Env; fetchImpl?: typeof fetch } = {},
): Promise<{ ready: boolean; proposal: AssistProposal | null }> {
  const env = options.env ?? process.env;
  const key = openaiKey(env);
  if (!key || !prompt.trim()) return { ready: false, proposal: null };
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: pricingModel(env),
        temperature: 0,
        messages: [
          { role: "system", content: "Propose job edits only through the tool. Never invent a measurement, price, or rate. If you do not know, set unknown and leave changes empty." },
          { role: "user", content: `${prompt}\n\n${context}` },
        ],
        tools: [{ type: "function", function: { name: ASSIST_TOOL_NAME, description: "Propose a reviewable edit. Do not include a price or a measurement.", parameters: ASSIST_PARAMETERS } }],
        tool_choice: { type: "function", function: { name: ASSIST_TOOL_NAME } },
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return { ready: true, proposal: null };
    const call = payload && typeof payload === "object" ? toolArguments(payload) : null;
    if (!call) return { ready: true, proposal: null };
    return { ready: true, proposal: parseProposal(call) };
  } catch {
    return { ready: true, proposal: null };
  }
}

function toolArguments(payload: object): unknown {
  const message = (payload as { choices?: { message?: { tool_calls?: { function?: { arguments?: unknown } }[] } }[] }).choices?.[0]?.message;
  const raw = message?.tool_calls?.[0]?.function?.arguments;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
