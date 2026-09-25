import { pricingModel, redact, webSearchTool, type Env } from "@/analysis/config";
import { blankOffer, fetchPublicPage, judgeOffer, type FetchPageOptions, type ReplacementOffer } from "@/analysis/pricing-check";

const OFFER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "retailer", "price", "currency", "url"],
  properties: {
    title: { anyOf: [{ type: "string" }, { type: "null" }] },
    retailer: { anyOf: [{ type: "string" }, { type: "null" }] },
    price: { anyOf: [{ type: "number" }, { type: "null" }] },
    currency: { anyOf: [{ type: "string" }, { type: "null" }] },
    url: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
} as const;

export function extractResponseText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { output_text?: unknown; output?: unknown };
  if (typeof record.output_text === "string" && record.output_text.trim()) return record.output_text;
  if (!Array.isArray(record.output)) return null;
  const parts: string[] = [];
  for (const item of record.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string") {
        parts.push((block as { text: string }).text);
      }
    }
  }
  const joined = parts.join("\n").trim();
  return joined || null;
}

export function parseOfferJson(text: string): { title: string | null; retailer: string | null; price: number | null; currency: string | null; url: string | null } | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const title = nullableString(record.title);
    const retailer = nullableString(record.retailer);
    const currency = nullableString(record.currency);
    const url = nullableString(record.url);
    const price = record.price == null ? null : typeof record.price === "number" && Number.isFinite(record.price) ? record.price : null;
    if (record.price != null && price == null) return null;
    if (record.title != null && title == null) return null;
    if (record.retailer != null && retailer == null) return null;
    if (record.currency != null && currency == null) return null;
    if (record.url != null && url == null) return null;
    return { title, retailer, price, currency, url };
  } catch {
    return null;
  }
}

export async function priceWithOpenAI(
  query: string,
  options: { apiKey: string; fetchImpl: typeof fetch; now: Date; env?: Env; page?: FetchPageOptions },
): Promise<ReplacementOffer> {
  const env = options.env ?? process.env;
  const retrievedAt = options.now.toISOString();
  try {
    const response = await options.fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: pricingModel(env),
        tools: [{ type: webSearchTool(env) }],
        input: [
          {
            role: "user",
            content: `Find one current retail replacement offer for: ${query}. Use web search. Return only an offer you actually retrieved. If you cannot find both a price and a product page URL, return nulls. Do not guess a price, a retailer, or a date.`,
          },
        ],
        text: { format: { type: "json_schema", name: "replacement_offer", strict: true, schema: OFFER_SCHEMA } },
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return blankOffer(query, `OpenAI pricing failed (${response.status}). No price was invented.`);
    }
    const text = extractResponseText(payload);
    const parsed = text ? parseOfferJson(text) : null;
    if (!parsed) {
      return blankOffer(query, "The pricing model did not return a usable offer. No price was kept.");
    }
    const page = parsed.url ? await fetchPublicPage(parsed.url, options.page) : null;
    return judgeOffer({ ...parsed, query, retrievedAt, page });
  } catch (error) {
    return blankOffer(query, `${redact(error instanceof Error ? error.message : "Pricing request failed.")} No price was invented.`);
  }
}

function nullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
