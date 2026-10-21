import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest } from "../lib/ads-client.js";
import { acct, idem, listParams, out, restQuery } from "../lib/validators.js";

const budget = z
  .object({
    lifetime_spend_limit_micros: z.number().int().min(1_000_000).optional(),
    daily_spend_limit_micros: z.number().int().min(1_000_000).optional(),
  })
  .describe("Budget caps in micros (1 USD = 1,000,000).");

export function registerCampaignTools(server: McpServer) {
  server.tool(
    "list_campaigns",
    "List campaigns (paginated). Returned campaign_id chains to get/update_campaign, create_ad_group, insights.",
    {
      ad_account_id: acct,
      name: z.string().min(3).max(1000).optional().describe("Filter by name (partial, min 3 chars)."),
      ...listParams,
      include: z.array(z.enum(["serving_issues"])).optional().describe("Optional includes."),
    },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "GET", path: "/campaigns", query: restQuery(rest), adAccountId: ad_account_id }))
  );

  server.tool(
    "get_campaign",
    "One campaign by ID. include=[serving_issues] audits delivery problems.",
    {
      ad_account_id: acct,
      campaign_id: z.string().min(1).describe("Campaign ID (cmpn_...)."),
      include: z.array(z.enum(["serving_issues"])).optional(),
    },
    async ({ ad_account_id, campaign_id, include }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/campaigns/${encodeURIComponent(campaign_id)}`,
          query: restQuery({ include }),
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "create_campaign",
    "Create a campaign; returns campaign_id for create_ad_group. For bidding_type=conversions pass exactly one conversion_event_setting_ids entry.",
    {
      ad_account_id: acct,
      idempotency_key: idem,
      name: z.string().min(3).max(1000).regex(/.*\S.*/).describe("Campaign name 3–1000 chars."),
      status: z.enum(["active", "paused"]).optional().describe("Initial status; use activate/pause tools after."),
      budget,
      description: z.string().optional(),
      start_time: z.number().int().optional().describe("Start unix seconds (946684800–4102444800)."),
      end_time: z.number().int().optional().describe("End unix seconds."),
      bidding_type: z.enum(["impressions", "clicks", "conversions"]).optional(),
      objective: z.enum(["reach", "clicks", "conversions"]).optional().describe("Campaign objective."),
      billing_event_type: z.enum(["impression", "click"]).optional(),
      mode: z.enum(["product_feed", "business_agent"]).optional().describe("Catalog or business-agent campaign mode."),
      product_feed_id: z.string().optional().describe("Feed ID if mode=product_feed."),
      business_agent_id: z.string().optional().describe("Business agent ID if mode=business_agent."),
      targeting: z
        .object({
          locations: z
            .object({
              include: z
                .array(z.object({ id: z.string(), name: z.string().optional(), type: z.string().optional(), country_code: z.string().optional(), region_code: z.string().optional() }))
                .optional(),
              countries: z.array(z.string()).optional(),
            })
            .optional(),
          excluded_locations: z.object({ include: z.array(z.object({ id: z.string() })).optional() }).optional(),
          custom_audiences: z.object({ ids: z.array(z.string()) }).optional(),
          excluded_custom_audiences: z.object({ ids: z.array(z.string()) }).optional(),
          platforms: z.object({ included: z.array(z.string()) }).optional(),
        })
        .optional()
        .describe("Targeting (locations, audiences, platforms). Resolve location IDs via search_geo_lookup first."),
      landing_page_configuration: z.object({ query_string_template: z.string().optional() }).optional(),
      conversion_event_setting_ids: z.array(z.string()).optional().describe("Conversion event setting IDs."),
    },
    async ({ ad_account_id, idempotency_key, ...rest }) =>
      out(
        await adsRequest({
          method: "POST",
          path: "/campaigns",
          body: rest,
          adAccountId: ad_account_id,
          idempotencyKey: idempotency_key?.trim() || undefined,
        })
      )
  );

  server.tool(
    "update_campaign",
    "Update a campaign by ID (only provided fields). Send null to clear description/start_time/end_time.",
    {
      ad_account_id: acct,
      campaign_id: z.string().min(1).describe("Campaign ID."),
      name: z.string().min(3).max(1000).regex(/.*\S.*/).optional(),
      status: z.enum(["active", "paused", "archived"]).optional(),
      budget: budget.optional(),
      description: z.string().nullable().optional(),
      start_time: z.number().int().nullable().optional(),
      end_time: z.number().int().nullable().optional(),
      bidding_type: z.enum(["impressions", "clicks", "conversions"]).optional(),
      objective: z.enum(["reach", "clicks", "conversions"]).optional(),
      billing_event_type: z.enum(["impression", "click"]).optional(),
      targeting: z.record(z.unknown()).optional(),
      landing_page_configuration: z.record(z.unknown()).optional(),
      conversion_event_setting_ids: z.array(z.string()).optional(),
    },
    async ({ ad_account_id, campaign_id, ...rest }) =>
      out(
        await adsRequest({
          method: "POST",
          path: `/campaigns/${encodeURIComponent(campaign_id)}`,
          body: rest,
          adAccountId: ad_account_id,
        })
      )
  );

  const lifecycle = (action: string, desc: string) =>
    server.tool(
      `${action}_campaign`,
      desc,
      {
        ad_account_id: acct,
        campaign_id: z.string().min(1).describe("Campaign ID."),
      },
      async ({ ad_account_id, campaign_id }) =>
        out(await adsRequest({ method: "POST", path: `/campaigns/${encodeURIComponent(campaign_id)}/${action}`, adAccountId: ad_account_id }))
    );

  lifecycle("activate", "Activate a paused campaign. All ancestors must be active for ads to serve.");
  lifecycle("pause", "Pause an active campaign. Reversible via activate_campaign.");
  lifecycle("archive", "Archive a campaign (terminal — cannot be reactivated).");
}
