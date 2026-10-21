/**
 * String-level SSRF guard for user-supplied URLs (creatives, feeds, webhooks).
 * Blocks private/loopback/link-local/CGNAT hosts (IPv4 + IPv6, including
 * mapped forms), non-http(s) schemes, embedded credentials, overlong URLs.
 * Deterministic — no DNS lookups; DNS rebinding is out of scope.
 */

const MAX_URL_LENGTH = 2048;
const BLOCKED_SCHEMES: Record<string, true> = {
  "file:": true,
  "javascript:": true,
  "data:": true,
  "ftp:": true,
  "gopher:": true,
};

// Tested against the bracket-stripped, lowercased host (WHATWG URL keeps
// brackets on IPv6 literals, e.g. "[::1]").
const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/,
  // IPv4 special ranges
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/, // link-local incl. cloud metadata
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/, // CGNAT 100.64/10
  /^0\.0\.0\.0$/,
  // IPv6 loopback / ULA / link-local
  /^::1$/,
  /^f[cd][0-9a-f]{2}:/,
  /^fe80:/,
];
/** Host forms to check: bare hostname plus any embedded IPv4 (mapped/NAT64). */
function hostCandidates(hostname: string): string[] {
  const bare = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  const out = [bare];
  if (/^::ffff:/.test(bare) || bare.includes("64:ff9b:")) {
    // ::ffff:0:0/96 (IPv4-mapped) and 64:ff9b::/96 (NAT64): low 32 bits are IPv4.
    const dotted = bare.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) out.push(dotted[1]);
    const tail = bare.split(":").filter(Boolean).slice(-2);
    if (tail.length === 2 && tail.every((h) => /^[0-9a-f]{1,4}$/.test(h))) {
      const hi = parseInt(tail[0], 16);
      const lo = parseInt(tail[1], 16);
      out.push(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
  }
  return out;
}

export function validateExternalUrl(
  raw: string,
  opts: { requireHttps?: boolean; paramName?: string } = {}
): URL {
  const paramName = opts.paramName ?? "url";
  const requireHttps = opts.requireHttps ?? true;

  if (!raw || typeof raw !== "string") {
    throw new Error(`${paramName} is required and must be a string.`);
  }
  if (raw.length > MAX_URL_LENGTH) {
    throw new Error(`${paramName} exceeds max length ${MAX_URL_LENGTH}.`);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${paramName} is not a valid URL: ${raw.slice(0, 80)}`);
  }

  if (BLOCKED_SCHEMES[url.protocol]) {
    throw new Error(`${paramName} uses blocked scheme ${url.protocol}.`);
  }
  if (requireHttps && url.protocol !== "https:") {
    throw new Error(`${paramName} must use https: (got ${url.protocol}).`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${paramName} must be https: or http: (got ${url.protocol}).`);
  }
  if (url.username || url.password) {
    throw new Error(`${paramName} must not contain embedded credentials.`);
  }

  for (const host of hostCandidates(url.hostname)) {
    if (PRIVATE_HOST_PATTERNS.some((re) => re.test(host))) {
      throw new Error(`${paramName} points to a private/internal host (${url.hostname}) — blocked to prevent SSRF.`);
    }
  }

  return url;
}
