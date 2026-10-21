import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest } from "../lib/ads-client.js";
import { acct, idem, listParams, out, restQuery } from "../lib/validators.js";

export function registerAdGroupTools(server: McpServer) {
  server.tool(
    "list_ad_groups",
    "List ad groups (optionally by campaign_id). Returned ad_group_id chains to create_ad and insights.",
    {
      ad_account_id: acct,
      campaign_id: z.string().optional().describe("Filter by campaign ID."),
      name: z.string().min(3).max(1000).optional().describe("Filter by name (min 3 chars)."),
      ...listParams,
      include: z.array(z.string()).optional(),
    },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "GET", path: "/ad_groups", query: restQuery(rest), adAccountId: ad_account_id }))
  );

  server.tool(
    "get_ad_group",
    "One ad group by ID.",
    {
      ad_account_id: acct,
      ad_group_id: z.string().min(1).describe("Ad group ID."),
      include: z.array(z.string()).optional(),
    },
    async ({ ad_account_id, ad_group_id, include }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/ad_groups/${encodeURIComponent(ad_group_id)}`,
          query: restQuery({ include }),
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "create_ad_group",
    "Create an ad group under a campaign; returns ad_group_id for create_ad. Requires campaign_id + bidding_config.",
    {
      ad_account_id: acct,
      idempotency_key: idem,
      campaign_id: z.string().min(1).describe("Parent campaign ID."),
      name: z.string().min(3).max(1000).regex(/.*\S.*/).describe("Ad group name."),
      status: z.enum(["active", "paused"]).optional(),
      description: z.string().optional(),
      context_hints: z.array(z.string()).optional().describe("Context hints (<=2000 chars each)."),
      bidding_config: z
        .object({
          billing_event_type: z.enum(["impression", "click"]).describe("Required billing event."),
          strategy: z.string().optional(),
          max_bid_micros: z.number().int().min(1).max(30400000000000).optional(),
          custom_audience_bid_multipliers: z
            .array(z.object({ custom_audience_id: z.string().min(1), bid_multiplier_micros: z.number().int().min(100000).max(10000000) }))
            .optional(),
        })
        .describe("Bidding config (billing_event_type required)."),
      product_set: z
        .object({
          product_feed_id: z.string(),
          filters: z
            .array(z.object({ field: z.string(), operator: z.enum(["in", "gt", "gte", "lt", "lte"]), values: z.array(z.string()) }))
            .optional(),
        })
        .optional()
        .describe("Product feed set for feed campaigns."),
      landing_page_configuration: z.object({ query_string_template: z.string().optional() }).optional(),
    },
    async ({ ad_account_id, idempotency_key, ...rest }) =>
      out(
        await adsRequest({
          method: "POST",
          path: "/ad_groups",
          body: rest,
          adAccountId: ad_account_id,
          idempotencyKey: idempotency_key?.trim() || undefined,
        })
      )
  );

  server.tool(
    "update_ad_group",
    "Update an ad group by ID (only provided fields).",
    {
      ad_account_id: acct,
      ad_group_id: z.string().min(1).describe("Ad group ID."),
      name: z.string().min(3).max(1000).regex(/.*\S.*/).optional(),
      status: z.enum(["active", "paused", "archived"]).optional(),
      description: z.string().nullable().optional(),
      context_hints: z.array(z.string()).nullable().optional(),
      bidding_config: z.record(z.unknown()).optional(),
      product_set: z.record(z.unknown()).nullable().optional(),
      landing_page_configuration: z.record(z.unknown()).optional(),
    },
    async ({ ad_account_id, ad_group_id, ...rest }) =>
      out(
        await adsRequest({
          method: "POST",
          path: `/ad_groups/${encodeURIComponent(ad_group_id)}`,
          body: rest,
          adAccountId: ad_account_id,
        })
      )
  );

  const lifecycle = (action: string, desc: string) =>
    server.tool(
      `${action}_ad_group`,
      desc,
      {
        ad_account_id: acct,
        ad_group_id: z.string().min(1).describe("Ad group ID."),
      },
      async ({ ad_account_id, ad_group_id }) =>
        out(await adsRequest({ method: "POST", path: `/ad_groups/${encodeURIComponent(ad_group_id)}/${action}`, adAccountId: ad_account_id }))
    );

  lifecycle("activate", "Activate a paused ad group.");
  lifecycle("pause", "Pause an active ad group.");
  lifecycle("archive", "Archive an ad group (terminal).");
}
