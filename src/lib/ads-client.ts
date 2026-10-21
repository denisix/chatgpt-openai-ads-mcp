import { getBaseUrl, requireApiKey, resolveAdAccountId } from "../config.js";

export type AdsRequestOptions = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: URLSearchParams | Record<string, string | string[] | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  adAccountId?: string;
  idempotencyKey?: string;
  /** Multipart upload — body is FormData; Content-Type is set by fetch. */
  formData?: FormData;
};

// Array params the API expects as `key[]=v` (fields[], time_ranges[], ...).
const BRACKET_KEYS: Record<string, true> = {
  fields: true,
  filters: true,
  sort: true,
  segments: true,
  override_segment_group_order: true,
  includes: true,
  include: true,
  time_ranges: true,
};

function buildUrl(base: string, path: string, query?: AdsRequestOptions["query"]): string {
  const url = new URL(`${base}${path}`);
  if (query instanceof URLSearchParams) {
    query.forEach((v, k) => url.searchParams.append(k, v));
  } else if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v == null) continue;
      const key = BRACKET_KEYS[k] ? `${k}[]` : k;
      if (Array.isArray(v)) {
        for (const item of v) if (item != null) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(v));
      }
    }
  }
  return url.toString();
}

export function getAuthHeaders(adAccountId?: string, extra?: Record<string, string>, idempotencyKey?: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${requireApiKey()}`,
    Accept: "application/json",
  };
  const account = resolveAdAccountId(adAccountId);
  if (account) h["OpenAI-Ad-Account"] = account;
  if (idempotencyKey) h["Idempotency-Key"] = idempotencyKey;
  if (extra) Object.assign(h, extra);
  return h;
}

export async function adsRequest<T = unknown>(opts: AdsRequestOptions): Promise<T> {
  const url = buildUrl(getBaseUrl(), opts.path, opts.query);
  const headers = getAuthHeaders(opts.adAccountId, opts.headers, opts.idempotencyKey);

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData as unknown as BodyInit;
    delete headers["Content-Type"]; // fetch sets the multipart boundary
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    body = JSON.stringify(opts.body);
  }

  // The bearer key may only go to OpenAI hosts over https (localhost/127.0.0.1 allowed for local testing).
  const u = new URL(url);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (!local && !(u.protocol === "https:" && (u.hostname === "openai.com" || u.hostname.endsWith(".openai.com")))) {
    throw new Error(`Refusing to send the API key to ${u.origin}: base URL must be https on *.openai.com.`);
  }

  const res = await fetch(url, { method: opts.method, headers, body });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    const detail =
      typeof json === "object" && json !== null && "error" in json ? JSON.stringify(json) : text.slice(0, 2000);
    const retryAfter = res.headers.get("Retry-After");
    const hint =
      res.status === 429
        ? ` Rate limited. ${retryAfter ? `Retry-After: ${retryAfter}s.` : "Back off and retry."}`
        : res.status === 401
          ? " Check your OPENAI_ADS_API_KEY is correct and not expired. Issue a new key at https://ads.openai.com > Settings."
          : res.status === 403
            ? " Your ad account may not be enabled for this operation (e.g., conversions, brand updates). Contact your OpenAI partner representative."
            : "";
    const err = new Error(`Ads API ${opts.method} ${opts.path} failed: ${res.status} ${res.statusText}. ${detail}${hint}`) as Error & {
      status?: number;
      retryAfter?: string | null;
      body?: unknown;
    };
    err.status = res.status;
    err.retryAfter = retryAfter;
    err.body = json;
    throw err;
  }

  return json as T;
}

/** Use the provided key or generate a fresh UUID (for endpoints that require one). */
export function requireIdempotencyKey(provided?: string): string {
  return provided?.trim() || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
