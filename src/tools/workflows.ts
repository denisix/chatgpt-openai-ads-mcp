import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest } from "../lib/ads-client.js";
import { validateExternalUrl } from "../lib/ssrf-guard.js";
import { acct, idem, out } from "../lib/validators.js";

/** Pull an entity id out of varied API response shapes ({id}, {data:{id}}, {kind:{id}}). */
function extractId(res: Record<string, unknown>): string | undefined {
  if (typeof res.id === "string") return res.id;
  const data = res.data;
  if (data && typeof data === "object" && "id" in data && typeof data.id === "string") return data.id;
  for (const v of Object.values(res)) {
    if (v && typeof v === "object" && "id" in v && typeof v.id === "string") return v.id;
  }
  return undefined;
}

export function registerWorkflowTools(server: McpServer) {
  server.tool(
    "create_campaign_hierarchy",
    "Composite: create campaign → ad group → ad in one call; returns all three IDs. On partial failure earlier objects remain — clean up with update/archive. Prefer atomic create_* tools for fine-grained control.",
    {
      ad_account_id: acct,
      idempotency_key: idem.describe("Base key; suffixed -campaign/-adgroup/-ad when provided."),
      campaign: z
        .object({
          name: z.string().min(3).max(1000).regex(/.*\S.*/),
          status: z.enum(["active", "paused"]).optional(),
          budget: z
            .object({
              lifetime_spend_limit_micros: z.number().int().min(1_000_000).optional(),
              daily_spend_limit_micros: z.number().int().min(1_000_000).optional(),
            })
            .optional(),
          description: z.string().optional(),
          start_time: z.number().int().optional(),
          end_time: z.number().int().optional(),
          bidding_type: z.enum(["impressions", "clicks", "conversions"]).optional(),
          objective: z.enum(["reach", "clicks", "conversions"]).optional(),
          billing_event_type: z.enum(["impression", "click"]).optional(),
          targeting: z.record(z.unknown()).optional(),
          conversion_event_setting_ids: z.array(z.string()).optional(),
          business_agent_id: z.string().optional(),
          landing_page_configuration: z.object({ query_string_template: z.string().optional() }).optional(),
        })
        .describe("Campaign payload (same as create_campaign)."),
      ad_group: z
        .object({
          name: z.string().min(3).max(1000).regex(/.*\S.*/),
          status: z.enum(["active", "paused"]).optional(),
          description: z.string().optional(),
          context_hints: z.array(z.string()).optional(),
          bidding_config: z.object({
            billing_event_type: z.enum(["impression", "click"]),
            strategy: z.string().optional(),
            max_bid_micros: z.number().int().min(1).max(30400000000000).optional(),
            custom_audience_bid_multipliers: z
              .array(z.object({ custom_audience_id: z.string(), bid_multiplier_micros: z.number().int().min(100000).max(10000000) }))
              .optional(),
          }),
          landing_page_configuration: z.object({ query_string_template: z.string().optional() }).optional(),
          product_set: z
            .object({
              product_feed_id: z.string(),
              filters: z
                .array(z.object({ field: z.string(), operator: z.enum(["in", "gt", "gte", "lt", "lte"]), values: z.array(z.string()) }))
                .optional(),
            })
            .optional(),
        })
        .describe("Ad group payload (campaign_id auto-injected)."),
      ad: z
        .object({
          name: z.string().min(3).max(1000).regex(/.*\S.*/).optional(),
          status: z.enum(["active", "paused"]).optional(),
          creative: z.object({
            type: z.enum(["chat_card", "product_ad_template"]),
            title: z.string().min(3).max(50).regex(/.*\S.*/),
            body: z.string().max(1000).optional(),
            price: z.string().max(100).optional(),
            target_url: z.string().max(2048).optional(),
            file_id: z.string().optional(),
            image_crop: z.record(z.unknown()).optional(),
          }),
          landing_page_configuration: z.object({ query_string_template: z.string().optional() }).optional(),
        })
        .describe("Ad payload (ad_group_id auto-injected)."),
    },
    async ({ ad_account_id, idempotency_key, campaign, ad_group, ad }) => {
      const baseKey = idempotency_key?.trim();
      if (ad.creative?.target_url) validateExternalUrl(ad.creative.target_url, { requireHttps: true, paramName: "ad.creative.target_url" });

      const step = async (path: string, body: Record<string, unknown>, suffix: string, label: string) => {
        const res = (await adsRequest({
          method: "POST",
          path,
          body,
          adAccountId: ad_account_id,
          idempotencyKey: baseKey ? `${baseKey}${suffix}` : undefined,
        })) as Record<string, unknown>;
        const id = extractId(res);
        if (!id) throw new Error(`${label} created but no ID found in response: ${JSON.stringify(res).slice(0, 800)}`);
        return { res, id };
      };

      const camp = await step("/campaigns", campaign, "-campaign", "Campaign");
      const group = await step("/ad_groups", { ...ad_group, campaign_id: camp.id }, "-adgroup", "Ad group");
      const created = await step("/ads", { ...ad, ad_group_id: group.id }, "-ad", "Ad");

      return out({
        campaign: camp.res,
        ad_group: group.res,
        ad: created.res,
        ids: { campaign_id: camp.id, ad_group_id: group.id, ad_id: created.id },
        next_steps: [
          `Campaign ${camp.id} — get_campaign / activate_campaign.`,
          `Ad group ${group.id} — get_ad_group.`,
          `Ad ${created.id} — check review_status via get_ad, preview via create_ad_preview.`,
        ],
      });
    }
  );

  server.tool(
    "poll_audience_operation",
    "One-shot poll of an audience mutation (processing → succeeded/failed). Call repeatedly with backoff; no internal loop by design.",
    {
      ad_account_id: acct,
      custom_audience_id: z.string().min(1).describe("Custom audience ID."),
      operation_id: z.string().min(1).max(128).describe("Operation ID from add/remove/replace/merge."),
    },
    async ({ ad_account_id, custom_audience_id, operation_id }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/custom_audiences/${encodeURIComponent(custom_audience_id)}/operations/${encodeURIComponent(operation_id)}`,
          adAccountId: ad_account_id,
        })
      )
  );
}
