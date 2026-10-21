import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest, requireIdempotencyKey } from "../lib/ads-client.js";
import { acct, dateField, idem, out } from "../lib/validators.js";

export function registerAdAccountTools(server: McpServer) {
  server.tool(
    "get_ad_account",
    "Ad account metadata for this API key — call first to verify auth; shows timezone, currency, review status.",
    { ad_account_id: acct },
    async ({ ad_account_id }) => out(await adsRequest({ method: "GET", path: "/ad_account", adAccountId: ad_account_id }))
  );

  server.tool(
    "list_ad_accounts",
    "Ad accounts accessible to this key/OAuth token; use ids as ad_account_id elsewhere.",
    { ad_account_id: acct },
    async ({ ad_account_id }) => out(await adsRequest({ method: "GET", path: "/ad_accounts", adAccountId: ad_account_id }))
  );

  server.tool(
    "update_ad_account_brand",
    "Update advertiser names or icon (POST /ad_account/brand). Send >=1 field; legacy `name` sets all three names and cannot combine with legal_name/account_name/brand_name. Names 2–1000 chars, no < or >. Needs enablement (else 403). On 503 the change may have saved — get_ad_account, then retry.",
    {
      ad_account_id: acct,
      legal_name: z.string().optional().describe("Legal business name."),
      account_name: z.string().optional().describe("Internal name (Ads Manager)."),
      brand_name: z.string().optional().describe("Public advertiser name shown in ads."),
      name: z.string().optional().describe("Legacy: sets legal, account and brand name at once."),
      url: z.string().url().optional().describe("Brand website URL."),
      favicon_file_id: z.string().optional().describe("file_id from upload_image with purpose=account_favicon."),
    },
    async ({ ad_account_id, ...rest }) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
      if (Object.keys(body).length === 0) throw new Error("Send at least one field.");
      if (body.name !== undefined && ["legal_name", "account_name", "brand_name"].some((k) => k in body)) {
        throw new Error("`name` cannot be combined with legal_name, account_name or brand_name.");
      }
      return out(await adsRequest({ method: "POST", path: "/ad_account/brand", body, adAccountId: ad_account_id }));
    }
  );

  server.tool(
    "update_ad_account_negative_keywords",
    "Replace account-level negative keywords (full list, not append; empty array clears).",
    {
      ad_account_id: acct,
      negative_keywords: z.array(z.string().min(1)).describe("Full desired keyword list."),
    },
    async ({ ad_account_id, negative_keywords }) =>
      out(await adsRequest({ method: "POST", path: "/ad_account/negative_keywords", body: { negative_keywords }, adAccountId: ad_account_id }))
  );

  server.tool(
    "activate_ad_account",
    "Resume serving. Campaigns/ad groups/ads must also be active to serve.",
    { ad_account_id: acct },
    async ({ ad_account_id }) => out(await adsRequest({ method: "POST", path: "/ad_account/activate", adAccountId: ad_account_id }))
  );

  server.tool(
    "pause_ad_account",
    "Stop all serving. Reversible via activate_ad_account.",
    { ad_account_id: acct },
    async ({ ad_account_id }) => out(await adsRequest({ method: "POST", path: "/ad_account/pause", adAccountId: ad_account_id }))
  );

  server.tool(
    "get_ad_account_spend_limit_windows",
    "Account spend limits (postpaid billing, needs billing permission). Returns date-range windows, daily_limit, revision (pass as expected_revision), can_create_daily_limit.",
    { ad_account_id: acct },
    async ({ ad_account_id }) => out(await adsRequest({ method: "GET", path: "/ad_account/spend_limit_windows", adAccountId: ad_account_id }))
  );

  server.tool(
    "create_ad_account_spend_limit_window",
    "Create a date-range spend limit (up to 60 future ones; no overlaps). Dates YYYY-MM-DD in account timezone, start >= today, end exclusive. amount_micros in account currency (100000000 = 100 units).",
    {
      ad_account_id: acct,
      start_date: dateField.describe("Start date YYYY-MM-DD."),
      end_date: dateField.describe("Exclusive end date YYYY-MM-DD, after start_date."),
      amount_micros: z.number().int().min(0).describe("Total allowance for the period, in micros."),
      name: z.string().max(256).nullable().optional().describe("Optional label."),
      io_id: z.string().max(256).nullable().optional().describe("Optional insertion order reference."),
    },
    async ({ ad_account_id, ...rest }) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
      return out(await adsRequest({ method: "POST", path: "/ad_account/spend_limit_windows", body, adAccountId: ad_account_id }));
    }
  );

  server.tool(
    "update_ad_account_spend_limit_window",
    "Edit a date-range spend limit (>=1 field). Only upcoming limits can change start_date; completed are read-only. null clears name/io_id.",
    {
      ad_account_id: acct,
      window_id: z.string().min(1).describe("Spend limit window ID (slw_...)."),
      start_date: dateField.optional(),
      end_date: dateField.optional(),
      amount_micros: z.number().int().min(0).optional(),
      name: z.string().max(256).nullable().optional(),
      io_id: z.string().max(256).nullable().optional(),
    },
    async ({ ad_account_id, window_id, ...rest }) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
      if (Object.keys(body).length === 0) throw new Error("Send at least one field.");
      return out(
        await adsRequest({
          method: "POST",
          path: `/ad_account/spend_limit_windows/${encodeURIComponent(window_id)}`,
          body,
          adAccountId: ad_account_id,
        })
      );
    }
  );

  server.tool(
    "delete_ad_account_spend_limit_window",
    "Delete an active/upcoming date-range spend limit (not completed). Historical spend kept.",
    {
      ad_account_id: acct,
      window_id: z.string().min(1).describe("Spend limit window ID."),
    },
    async ({ ad_account_id, window_id }) =>
      out(
        await adsRequest({
          method: "POST",
          path: `/ad_account/spend_limit_windows/${encodeURIComponent(window_id)}/delete`,
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "set_ad_account_daily_spend_limit",
    "Create/update the daily spend limit (renews at midnight account timezone). Pass revision from get_ad_account_spend_limit_windows as expected_revision; amount_micros required even when only changing end_date. start_date: omit when editing, required when re-creating (starts tomorrow+). end_date: omit to keep, null for none. 409 = stale revision.",
    {
      ad_account_id: acct,
      amount_micros: z.number().int().min(0).describe("Allowance per day, in micros."),
      expected_revision: z.number().int().min(0).describe("`revision` from the latest list response."),
      start_date: dateField.optional().describe("First allowed day YYYY-MM-DD."),
      end_date: dateField.nullable().optional().describe("Exclusive end date, or null for none."),
      window_id: z.string().nullable().optional().describe("Optional existing window id."),
    },
    async ({ ad_account_id, ...rest }) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
      return out(await adsRequest({ method: "POST", path: "/ad_account/daily_spend_limit", body, adAccountId: ad_account_id }));
    }
  );

  server.tool(
    "delete_ad_account_daily_spend_limit",
    "Remove the daily spend limit. Pass revision as expected_revision.",
    {
      ad_account_id: acct,
      expected_revision: z.number().int().min(0).describe("`revision` from the latest list response."),
      window_id: z.string().optional(),
    },
    async ({ ad_account_id, ...rest }) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
      return out(await adsRequest({ method: "POST", path: "/ad_account/daily_spend_limit/delete", body, adAccountId: ad_account_id }));
    }
  );

  server.tool(
    "create_ad_account_creation_session",
    "Partner flow: start an ad account creation session; advertiser returns to return_uri with your state. Idempotency key auto-generated if omitted.",
    {
      return_uri: z.string().url().describe("Where to send the advertiser afterwards."),
      state: z.string().min(1).describe("Opaque value echoed back (CSRF/correlation)."),
      idempotency_key: idem,
    },
    async ({ return_uri, state, idempotency_key }) =>
      out(
        await adsRequest({
          method: "POST",
          path: "/ad_account_creation_sessions",
          body: { return_uri, state },
          idempotencyKey: requireIdempotencyKey(idempotency_key),
        })
      )
  );

  server.tool(
    "get_oauth_me",
    "Authenticated user's stable opaque ID (OAuth only) — verify token identity for partner flows.",
    {},
    async () => out(await adsRequest({ method: "GET", path: "/me" }))
  );

  server.tool(
    "create_api_key",
    "Create an API key scoped to the ad account (needs AdsOAuth write or a permitted key). Returns the key once — store it securely.",
    {
      ad_account_id: acct,
      name: z.string().min(1).optional().describe("Human-readable key name (sent as key_name)."),
    },
    async ({ ad_account_id, name }) =>
      out(await adsRequest({ method: "POST", path: "/api_keys", body: name ? { key_name: name } : {}, adAccountId: ad_account_id }))
  );
}
