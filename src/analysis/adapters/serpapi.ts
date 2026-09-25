import { blankOffer, fetchPublicPage, judgeOffer, type FetchPageOptions, type ReplacementOffer } from "@/analysis/pricing-check";
import { redact } from "@/analysis/config";

type ShoppingHit = {
  title?: unknown;
  source?: unknown;
  extracted_price?: unknown;
  link?: unknown;
};

export async function priceWithSerpApi(
  query: string,
  options: { apiKey: string; fetchImpl: typeof fetch; now: Date; page?: FetchPageOptions },
): Promise<ReplacementOffer> {
  const retrievedAt = options.now.toISOString();
  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_shopping");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", options.apiKey);
    const response = await options.fetchImpl(url.toString());
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== "object") {
      return blankOffer(query, `SerpAPI failed (${response.status}). No price was invented.`);
    }
    const results = (payload as { shopping_results?: unknown }).shopping_results;
    const first = Array.isArray(results) ? (results[0] as ShoppingHit | undefined) : undefined;
    if (!first) return blankOffer(query, "SerpAPI returned no shopping result. No price was invented.");
    const price = typeof first.extracted_price === "number" && Number.isFinite(first.extracted_price) ? first.extracted_price : null;
    const link = typeof first.link === "string" ? first.link : null;
    const title = typeof first.title === "string" ? first.title : null;
    const retailer = typeof first.source === "string" ? first.source : null;
    const page = link ? await fetchPublicPage(link, options.page) : null;
    return judgeOffer({ query, title, retailer, price, currency: null, url: link, retrievedAt, page });
  } catch (error) {
    return blankOffer(query, `${redact(error instanceof Error ? error.message : "SerpAPI failed.")} No price was invented.`);
  }
}
