import { z } from "zod";

/** Per-tool ad account override; falls back to OPENAI_AD_ACCOUNT_ID env. */
export const acct = z
  .string()
  .optional()
  .describe("Ad account ID override; defaults to OPENAI_AD_ACCOUNT_ID env.");

/** Common list-endpoint parameters. */
export const listParams = {
  limit: z.number().int().min(1).max(500).optional().describe("Max results (1–500)."),
  after: z.string().optional().describe("Forward pagination cursor."),
  before: z.string().optional().describe("Backward pagination cursor."),
  order: z.enum(["asc", "desc"]).optional().describe("Sort by creation time."),
};

/** Optional idempotency key — supply one to make agent retries safe. */
export const idem = z.string().min(1).max(255).optional().describe("Idempotency key; reuse the same value to dedupe retries.");

/** Required idempotency key — save it to resume safely after 503/409. */
export const idemRequired = z.string().min(1).max(255).describe("Idempotency key; reuse the same value to resume safely after 503/409.");

export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Build a query record from parsed args, skipping null/undefined values. */
export function restQuery(rest: Record<string, unknown>): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v == null) continue;
    query[k] = Array.isArray(v) ? (v as string[]) : String(v);
  }
  return query;
}

/** Wrap a payload as MCP text content (pretty JSON). */
export function out(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
