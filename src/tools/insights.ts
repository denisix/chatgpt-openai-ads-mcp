import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest } from "../lib/ads-client.js";
import { acct, dateField, out, restQuery } from "../lib/validators.js";

const timeRangeExample = '[\"{\\\"type\\\":\\\"unix_range\\\",\\\"start\\\":1777075200,\\\"end\\\":1777248000}\"]';

const insightFields = {
  ad_account_id: acct,
  time_granularity: z.enum(["hourly", "daily", "monthly", "none"]).optional().describe("Time bucket (default daily; none = single window bucket)."),
  aggregation_level: z.enum(["ad_account", "campaign", "ad_group", "ad"]).optional().describe("Aggregation scope."),
  limit: z.number().int().min(1).max(2000).optional().describe("Max rows 1–2000."),
  before: z.string().optional().describe("Pagination cursor."),
  after: z.string().optional().describe("Pagination cursor."),
  time_ranges: z.array(z.string()).optional().describe(`JSON-encoded ranges, e.g. ${timeRangeExample}. Types: unix_range, hour_range, date_range. Past 5 years only.`),
  filters: z.array(z.string()).optional().describe('JSON filters ANDed: {"field":"campaign.id","operator":"IN","value":["cmpn_1"]}. Operators IN/GREATER_THAN/LESS_THAN.'),
  fields: z.array(z.string()).optional().describe('Metric/column names, e.g. ["campaign.id","campaign.name","campaign.clicks","campaign.spend","campaign.impressions"]. Prefix metrics with the level (ad.clicks).'),
  sort: z.array(z.string()).optional().describe('JSON sort: {"field":"ad.clicks","direction":"desc"}.'),
  segments: z.array(z.enum(["product", "country", "device", "platform"])).max(1).optional().describe("At most one breakdown; platform needs fields [\"platform\"]."),
  override_segment_group_order: z.array(z.string()).optional().describe('Row grouping order, e.g. ["product","ad_account"].'),
  includes: z.array(z.enum(["zero_impression_items", "zero_impression_products"])).max(1).optional().describe("Zero-row expansion."),
  attribution_window_days: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional().describe("Click attribution window (default 30)."),
  view_through_attribution_window_days: z.union([z.literal(0), z.literal(1)]).optional().describe("View window (default 1; 0 excludes views)."),
  attribution_time_basis: z.enum(["ad_event_time", "conversion_time"]).optional().describe("Group by interaction date (default) or conversion date."),
};

const hotelFields = {
  ad_account_id: acct,
  start_date: dateField.describe("Inclusive start YYYY-MM-DD."),
  end_date: dateField.describe("Inclusive end YYYY-MM-DD, not later than today."),
  filters: z.array(z.string()).max(50).optional().describe('JSON filters {"field","operator","value"}; text fields IN, metrics GREATER_THAN/LESS_THAN.'),
  campaign_ids: z.array(z.string()).max(2000).optional(),
  ad_group_ids: z.array(z.string()).max(2000).optional(),
  ad_ids: z.array(z.string()).max(2000).optional(),
  inventory_items: z.array(z.string()).max(2000).optional().describe('JSON strings {"inventory_feed_id","inventory_item_id"}.'),
};

export function registerInsightTools(server: McpServer) {
  server.tool(
    "get_ad_account_insights",
    "Ad account insights by time granularity (current local day is preliminary). Paginated (limit/after/before).",
    { ...insightFields },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "GET", path: "/ad_account/insights", query: restQuery(rest), adAccountId: ad_account_id }))
  );

  server.tool(
    "get_campaign_insights",
    "Campaign insights (same params as account insights, scoped to one campaign).",
    { ...insightFields, campaign_id: z.string().min(1).describe("Campaign ID.") },
    async ({ ad_account_id, campaign_id, ...rest }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/campaigns/${encodeURIComponent(campaign_id)}/insights`,
          query: restQuery(rest),
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "get_ad_group_insights",
    "Ad group insights.",
    { ...insightFields, ad_group_id: z.string().min(1).describe("Ad group ID.") },
    async ({ ad_account_id, ad_group_id, ...rest }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/ad_groups/${encodeURIComponent(ad_group_id)}/insights`,
          query: restQuery(rest),
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "get_ad_insights",
    "Single-ad insights (creative-level performance).",
    { ...insightFields, ad_id: z.string().min(1).describe("Ad ID.") },
    async ({ ad_account_id, ad_id, ...rest }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/ads/${encodeURIComponent(ad_id)}/insights`,
          query: restQuery(rest),
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "get_conversion_insights",
    "Campaign goal conversion totals (click + view-through), optional attributed event details. POST /conversions/insights. Full days in account timezone, max 365, exactly one time range. >2000 rows = 413.",
    {
      ad_account_id: acct,
      aggregation_level: z.enum(["campaign", "ad_group", "ad"]).describe("Aggregation level (required)."),
      time_ranges: z.array(z.string()).length(1).describe(`Exactly one JSON-encoded range, e.g. ${timeRangeExample}.`),
      time_granularity: z.enum(["none", "daily"]).optional().describe("none (default) = period totals."),
      entity_ids: z.array(z.string()).optional().describe("Entity IDs at aggregation level; required unless group_by_entity=false."),
      group_by_entity: z.boolean().optional().describe("Default true."),
      breakdown: z.enum(["device", "country"]).nullable().optional(),
      attribution_time_basis: z.enum(["ad_event_time", "conversion_time"]).optional(),
      attribution_window_days: z.union([z.literal(7), z.literal(14), z.literal(30)]).nullable().optional().describe("Click window (default 30)."),
      view_through_attribution_window_days: z.union([z.literal(0), z.literal(1)]).nullable().optional().describe("View window (default 1)."),
      include: z.array(z.literal("attributed_events")).optional().describe("[\"attributed_events\"] adds nested event details."),
      event_names: z.array(z.string().min(1).max(256)).min(1).max(500).optional().describe("Filter event details by exact name; requires include=[attributed_events]."),
      include_zero_rows: z.boolean().optional().describe("Default true."),
    },
    async ({ ad_account_id, ...rest }) => {
      if (rest.event_names && !(rest.include ?? []).includes("attributed_events")) {
        throw new Error('event_names requires include: ["attributed_events"].');
      }
      if (rest.group_by_entity !== false && !rest.entity_ids?.length) {
        throw new Error("entity_ids is required unless group_by_entity is false.");
      }
      return out(await adsRequest({ method: "POST", path: "/conversions/insights", body: rest, adAccountId: ad_account_id }));
    }
  );

  server.tool(
    "get_hotel_insights",
    "Hotel property insights (accounts with hotel feeds). Dates inclusive, account timezone; explicit attribution settings rejected.",
    {
      ...hotelFields,
      include_zero_activity: z.boolean().optional(),
      time_granularity: z.string().optional().describe("Per the API's HotelInsightsGranularity enum (e.g. daily)."),
      breakdown: z.string().optional().describe("Per the API's HotelInsightsBreakdown enum."),
      sort_field: z.string().optional(),
      sort_direction: z.enum(["asc", "desc"]).optional(),
      limit: z.number().int().min(1).max(2000).optional(),
      after: z.string().max(8192).optional(),
      include_total_count: z.boolean().optional(),
    },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "GET", path: "/ad_account/hotel_insights", query: restQuery(rest), adAccountId: ad_account_id }))
  );

  server.tool(
    "get_hotel_insights_timeseries",
    "Hotel insights trend (timeseries). Same date/filter conventions as get_hotel_insights.",
    { ...hotelFields },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "GET", path: "/ad_account/hotel_insights/timeseries", query: restQuery(rest), adAccountId: ad_account_id }))
  );
}
