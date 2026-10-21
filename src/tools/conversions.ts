import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest } from "../lib/ads-client.js";
import { acct, listParams, out, restQuery } from "../lib/validators.js";

export function registerConversionTools(server: McpServer) {
  server.tool(
    "create_conversion_pixel",
    "Create a conversion pixel (web client data source); returns pixel id (pid) for attribution and event listing. Chain: create_conversion_event_setting.",
    {
      ad_account_id: acct,
      name: z.string().min(3).max(1000).regex(/.*\S.*/).describe("Pixel name 3–1000 chars."),
      client_type: z.enum(["web"]).default("web").describe("Client type (only web)."),
    },
    async ({ ad_account_id, name, client_type }) =>
      out(await adsRequest({ method: "POST", path: "/conversions/pixels", body: { name, client_type }, adAccountId: ad_account_id }))
  );

  server.tool(
    "list_conversion_pixels",
    "List conversion pixels; pid chains to list_conversion_events.",
    {
      ad_account_id: acct,
      ...listParams,
    },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "GET", path: "/conversions/pixels", query: restQuery(rest), adAccountId: ad_account_id }))
  );

  server.tool(
    "create_conversion_api_key",
    "Create a Conversions API key for server-side events via bzr.openai.com (outside this MCP). Returned once — store securely.",
    {
      ad_account_id: acct,
      name: z.string().min(3).max(1000).regex(/.*\S.*/).describe("Key name 3–1000 chars."),
    },
    async ({ ad_account_id, name }) =>
      out(await adsRequest({ method: "POST", path: "/conversions/api_keys", body: { name }, adAccountId: ad_account_id }))
  );

  server.tool(
    "create_conversion_event_setting",
    "Link an event type to a pixel source for conversions bidding (campaign conversion_event_setting_ids).",
    {
      ad_account_id: acct,
      name: z.string().min(1).describe("Event setting name."),
      event_type: z.string().min(1).describe("e.g. order_created, page_viewed, custom, app_installed."),
      custom_event_name: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/).optional().describe("Required if event_type=custom."),
      attribution_window_days: z.number().int().default(30).describe("Use 30 (the only documented value)."),
      source_ids: z.array(z.string().min(1)).length(1).describe("Exactly one source `id` (clidsrc_...) from create_conversion_pixel (not pixel_id)."),
    },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "POST", path: "/conversions/event_settings", body: rest, adAccountId: ad_account_id }))
  );

  server.tool(
    "list_conversion_event_settings",
    "List event settings; IDs feed campaign conversion_event_setting_ids and conversions bidding.",
    {
      ad_account_id: acct,
      ...listParams,
    },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "GET", path: "/conversions/event_settings", query: restQuery(rest), adAccountId: ad_account_id }))
  );

  server.tool(
    "list_conversion_events",
    "Recent sampled conversion events for a pixel (<=50/call) — verify ingestion from bzr.openai.com.",
    {
      ad_account_id: acct,
      pid: z.string().min(1).describe("Pixel ID (pid) from list_conversion_pixels."),
      limit: z.number().int().min(1).max(50).optional().describe("Max 1–50."),
    },
    async ({ ad_account_id, pid, limit }) =>
      out(await adsRequest({ method: "GET", path: "/conversions/events", query: restQuery({ pid, limit }), adAccountId: ad_account_id }))
  );
}
