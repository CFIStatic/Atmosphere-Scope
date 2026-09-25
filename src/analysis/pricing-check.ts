export type PriceStatus = "verified" | "unverified" | "unpriced";

export type ReplacementOffer = {
  query: string;
  title: string | null;
  retailer: string | null;
  price: number | null;
  currency: string | null;
  url: string | null;
  retrievedAt: string | null;
  status: PriceStatus;
  note: string;
};

export type PageFetch = { ok: true; body: string } | { ok: false; reason: string };

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (isPrivateIp(host)) return false;
  return true;
}

function isPrivateIp(host: string): boolean {
  const candidate = ipv4FromMapped(host) ?? host;
  const v4 = candidate.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (host.includes(":")) {
    const normalized = host.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    return false;
  }
  return false;
}

function ipv4FromMapped(host: string): string | null {
  const dotted = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) return dotted[1];
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return null;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

export function priceAppearsOnPage(price: number, page: string): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  const cents = Math.round(price * 100);
  if (cents <= 0) return false;
  const dollars = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  const plain = `${dollars}.${frac}`;
  const grouped = `${dollars.toLocaleString("en-US")}.${frac}`;
  const text = page
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#36;|&dollar;/gi, "$")
    .replace(/\s+/g, " ");
  if (findPriceToken(text, plain, true)) return true;
  if (grouped !== plain && findPriceToken(text, grouped, true)) return true;
  if (frac === "00") {
    if (findPriceToken(text, String(dollars), false)) return true;
    const whole = dollars.toLocaleString("en-US");
    if (whole !== String(dollars) && findPriceToken(text, whole, false)) return true;
  }
  return false;
}

function findPriceToken(text: string, token: string, decimal: boolean): boolean {
  let from = 0;
  while (from <= text.length) {
    const at = text.indexOf(token, from);
    if (at < 0) return false;
    const before = at > 0 ? text[at - 1] : "";
    const after = text[at + token.length] ?? "";
    const beforeOk = before === "" || !/[0-9.]/.test(before);
    const afterOk = after === "" || !/[0-9]/.test(after);
    if (beforeOk && afterOk) {
      if (decimal) return true;
      const window = text.slice(Math.max(0, at - 12), at);
      if (/\$|usd|us\$/i.test(window)) return true;
    }
    from = at + Math.max(token.length, 1);
  }
  return false;
}

export function judgeOffer(input: {
  query: string;
  title: string | null;
  retailer: string | null;
  price: number | null;
  currency: string | null;
  url: string | null;
  retrievedAt: string;
  page: PageFetch | null;
}): ReplacementOffer {
  const title = clean(input.title);
  const retailer = clean(input.retailer);
  const currency = clean(input.currency);
  const url = clean(input.url);
  const price = normalizePrice(input.price);
  const base = { query: input.query, title, retailer, currency, retrievedAt: null as string | null };
  if (price == null) {
    return { ...base, price: null, url, status: "unpriced", note: "No price was returned. Nothing was invented." };
  }
  if (!url || !isPublicHttpUrl(url)) {
    return {
      ...base,
      price: null,
      url: null,
      status: "unpriced",
      note: url ? "The product URL is not a public web page, so the price was not kept." : "No product URL was returned, so the price was not kept.",
    };
  }
  if (!input.page) {
    return { ...base, price: null, url, status: "unpriced", note: "The product page was not checked, so the price was not kept." };
  }
  if (!input.page.ok) {
    return {
      ...base,
      price,
      url,
      retrievedAt: input.retrievedAt,
      status: "unverified",
      note: `${input.page.reason} The price is unverified.`,
    };
  }
  if (priceAppearsOnPage(price, input.page.body)) {
    return { ...base, price, url, retrievedAt: input.retrievedAt, status: "verified", note: "The price text appears on the product page." };
  }
  return {
    ...base,
    price,
    url,
    retrievedAt: input.retrievedAt,
    status: "unverified",
    note: "The product page was fetched and this price was not found on it. The price is unverified.",
  };
}

export async function fetchPublicPage(rawUrl: string, fetchImpl: typeof fetch, hops = 3): Promise<PageFetch> {
  if (!isPublicHttpUrl(rawUrl)) return { ok: false, reason: "URL is not a public http(s) address." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(rawUrl, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "AtmosphereScopePriceCheck/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hops <= 0) return { ok: false, reason: "Redirect could not be followed." };
      const next = new URL(location, rawUrl).toString();
      if (!isPublicHttpUrl(next)) return { ok: false, reason: "Redirect left the public web, so the page was not fetched." };
      return fetchPublicPage(next, fetchImpl, hops - 1);
    }
    if (!response.ok) return { ok: false, reason: `Product page returned ${response.status}.` };
    const text = await response.text();
    return { ok: true, body: text.slice(0, 500_000) };
  } catch {
    return { ok: false, reason: "Product page could not be fetched." };
  } finally {
    clearTimeout(timer);
  }
}

export function blankOffer(query: string, note: string): ReplacementOffer {
  return {
    query,
    title: null,
    retailer: null,
    price: null,
    currency: null,
    url: null,
    retrievedAt: null,
    status: "unpriced",
    note,
  };
}

function clean(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePrice(price: number | null): number | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  return Math.round(price * 100) / 100;
}
