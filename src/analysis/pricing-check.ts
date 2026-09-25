import http from "node:http";
import https from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";

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

export type ResolvedAddress = { address: string; family: 4 | 6 };

export type AddressLookup = (hostname: string) => Promise<ResolvedAddress[]>;

export const PRICE_CHECK_USER_AGENT = "AtmosphereScope/1.0 (price verification; +https://github.com/CFIStatic/Atmosphere-Scope)";

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
  if (isBlockedName(host)) return false;
  if (isPrivateIp(host)) return false;
  return true;
}

export function isBlockedAddress(address: string): boolean {
  const host = address.replace(/^\[|\]$/g, "").toLowerCase();
  const mapped = ipv4FromMapped(host);
  const candidate = mapped ?? host;
  const v4 = candidate.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    return isBlockedV4(parts);
  }
  if (host.includes(":")) return isBlockedV6(host);
  return false;
}

function isPrivateIp(host: string): boolean {
  return isBlockedAddress(host);
}

function isBlockedV4(parts: number[]): boolean {
  const ip = ipv4ToInt(parts);
  const inRange = (base: number[], bits: number) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ip & mask) === (ipv4ToInt(base) & mask);
  };
  return (
    inRange([0, 0, 0, 0], 8) ||
    inRange([10, 0, 0, 0], 8) ||
    inRange([100, 64, 0, 0], 10) ||
    inRange([127, 0, 0, 0], 8) ||
    inRange([169, 254, 0, 0], 16) ||
    inRange([172, 16, 0, 0], 12) ||
    inRange([192, 0, 0, 0], 24) ||
    inRange([192, 0, 2, 0], 24) ||
    inRange([192, 168, 0, 0], 16) ||
    inRange([198, 18, 0, 0], 15) ||
    inRange([198, 51, 100, 0], 24) ||
    inRange([203, 0, 113, 0], 24) ||
    inRange([224, 0, 0, 0], 4) ||
    inRange([240, 0, 0, 0], 4)
  );
}

function ipv4ToInt(parts: number[]): number {
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

function isBlockedV6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("2001:db8:") || normalized === "2001:db8") return true;
  return false;
}

export async function defaultAddressLookup(hostname: string): Promise<ResolvedAddress[]> {
  if (isBlockedAddress(hostname) || isIpLiteral(hostname)) {
    return [{ address: hostname.replace(/^\[|\]$/g, ""), family: hostname.includes(":") ? 6 : 4 }];
  }
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({ address: record.address, family: record.family === 6 ? 6 : 4 }));
}

export function assertPublicResolution(hostname: string, addresses: ResolvedAddress[]): { ok: true } | { ok: false; reason: string } {
  if (!addresses.length) return { ok: false, reason: "The product host did not resolve." };
  const blocked = addresses.find((item) => isBlockedAddress(item.address));
  if (blocked) return { ok: false, reason: `The product host resolved to a blocked address (${blocked.address}), so the page was not fetched.` };
  if (isBlockedName(hostname)) return { ok: false, reason: "The product host is not a public web host." };
  return { ok: true };
}

function isBlockedName(hostname: string): boolean {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  return !host || BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal");
}

function isIpLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":");
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

export type IntervalQueue = {
  intervalMs: number;
  wait: (now: () => number, sleep: (ms: number) => Promise<void>) => Promise<void>;
};

export function createIntervalQueue(minIntervalMs: number): IntervalQueue {
  let tail = Promise.resolve();
  let lastStarted = Number.NEGATIVE_INFINITY;
  return {
    intervalMs: minIntervalMs,
    wait(now, sleep) {
      const job = tail.then(async () => {
        const delay = Math.max(0, lastStarted + minIntervalMs - now());
        if (delay > 0) await sleep(delay);
        lastStarted = now();
      });
      tail = job.then(() => undefined, () => undefined);
      return job;
    },
  };
}

let sharedQueue: IntervalQueue | null = null;

function productionQueue(): IntervalQueue {
  const interval = positiveInt(process.env.PRICE_FETCH_MIN_INTERVAL_MS, 1000);
  if (!sharedQueue || sharedQueue.intervalMs !== interval) sharedQueue = createIntervalQueue(interval);
  return sharedQueue;
}

export type FetchPageOptions = {
  fetchImpl?: typeof fetch;
  lookup?: AddressLookup;
  timeoutMs?: number;
  maxBytes?: number;
  queue?: IntervalQueue;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  hops?: number;
  userAgent?: string;
};

export async function fetchPublicPage(rawUrl: string, options: FetchPageOptions = {}, hops?: number): Promise<PageFetch> {
  const remaining = hops ?? options.hops ?? 3;
  if (!isPublicHttpUrl(rawUrl)) return { ok: false, reason: "URL is not a public http(s) address." };
  const target = new URL(rawUrl);
  const lookup = options.lookup ?? defaultAddressLookup;
  let addresses: ResolvedAddress[];
  try {
    addresses = await lookup(target.hostname);
  } catch {
    return { ok: false, reason: "The product host could not be resolved. The price is unverified." };
  }
  const resolved = assertPublicResolution(target.hostname, addresses);
  if (!resolved.ok) return resolved;
  const queue = options.queue ?? productionQueue();
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  await queue.wait(now, sleep);
  const timeoutMs = options.timeoutMs ?? positiveInt(process.env.PRICE_FETCH_TIMEOUT_MS, 8000);
  const maxBytes = options.maxBytes ?? positiveInt(process.env.PRICE_FETCH_MAX_BYTES, 500_000);
  const userAgent = options.userAgent ?? PRICE_CHECK_USER_AGENT;
  try {
    const response = options.fetchImpl
      ? await fetchWithLimit(options.fetchImpl, target, timeoutMs, maxBytes, userAgent)
      : await pinnedGet(target, addresses, timeoutMs, maxBytes, userAgent);
    if (response.status >= 300 && response.status < 400) {
      const location = response.location;
      if (!location || remaining <= 0) return { ok: false, reason: "Redirect could not be followed. The price is unverified." };
      const next = new URL(location, target).toString();
      if (!isPublicHttpUrl(next)) return { ok: false, reason: "Redirect left the public web, so the page was not fetched. The price is unverified." };
      return fetchPublicPage(next, options, remaining - 1);
    }
    if (response.status === 401 || response.status === 403 || response.status === 429 || response.status === 503) {
      return { ok: false, reason: `The retailer blocked the price check (${response.status}).` };
    }
    if (response.status < 200 || response.status >= 300) return { ok: false, reason: `Product page returned ${response.status}.` };
    if (!response.body.trim()) return { ok: false, reason: "The product page was empty and could not be parsed." };
    return { ok: true, body: response.body };
  } catch {
    return { ok: false, reason: "Product page could not be fetched." };
  }
}

async function fetchWithLimit(fetchImpl: typeof fetch, target: URL, timeoutMs: number, maxBytes: number, userAgent: string): Promise<{ status: number; location: string | null; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(target.toString(), {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": userAgent },
    });
    const body = await readLimited(response, maxBytes);
    return { status: response.status, location: response.headers.get("location"), body };
  } finally {
    clearTimeout(timer);
  }
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return (await response.text()).slice(0, maxBytes);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const room = maxBytes - total;
    chunks.push(value.byteLength > room ? value.slice(0, room) : value);
    total += Math.min(value.byteLength, room);
    if (value.byteLength > room) {
      await reader.cancel();
      break;
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function pinnedGet(target: URL, addresses: ResolvedAddress[], timeoutMs: number, maxBytes: number, userAgent: string): Promise<{ status: number; location: string | null; body: string }> {
  const lib = target.protocol === "https:" ? https : http;
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": userAgent,
          Host: target.host,
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, pinned.address, pinned.family);
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve({
            status: res.statusCode ?? 0,
            location: typeof res.headers.location === "string" ? res.headers.location : null,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        };
        res.on("data", (chunk: Buffer) => {
          if (total >= maxBytes) return;
          const room = maxBytes - total;
          const slice = chunk.byteLength > room ? chunk.subarray(0, room) : chunk;
          chunks.push(slice);
          total += slice.byteLength;
          if (total >= maxBytes) res.destroy();
        });
        res.on("end", finish);
        res.on("error", finish);
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
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
