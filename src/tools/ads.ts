import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest } from "../lib/ads-client.js";
import { validateExternalUrl } from "../lib/ssrf-guard.js";
import { acct, idem, listParams, out, restQuery } from "../lib/validators.js";

function assertCreativeUrlSafe(creative: unknown): void {
  if (creative && typeof creative === "object" && "target_url" in creative) {
    const url = creative.target_url;
    if (typeof url === "string" && url) validateExternalUrl(url, { requireHttps: true, paramName: "creative.target_url" });
  }
}

export function registerAdTools(server: McpServer) {
  server.tool(
    "list_ads",
    "List ads (optionally by campaign_id/ad_group_id). ad_id chains to get_ad, insights, preview.",
    {
      ad_account_id: acct,
      campaign_id: z.string().optional().describe("Filter by campaign ID."),
      ad_group_id: z.string().optional().describe("Filter by ad group ID."),
      name: z.string().min(3).max(1000).optional(),
      ...listParams,
      include: z.array(z.string()).optional(),
    },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "GET", path: "/ads", query: restQuery(rest), adAccountId: ad_account_id }))
  );

  server.tool(
    "get_ad",
    "One ad by ID. Check review_status to monitor approval (typically minutes).",
    {
      ad_account_id: acct,
      ad_id: z.string().min(1).describe("Ad ID."),
      include: z.array(z.string()).optional(),
    },
    async ({ ad_account_id, ad_id, include }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/ads/${encodeURIComponent(ad_id)}`,
          query: restQuery({ include }),
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "create_ad",
    "Create an ad under an ad group; returns ad_id. chat_card needs file_id from upload_image + target_url; product_ad_template uses {{product.*}} tokens and no file_id.",
    {
      ad_account_id: acct,
      idempotency_key: idem,
      ad_group_id: z.string().min(1).describe("Parent ad group ID."),
      name: z.string().min(3).max(1000).regex(/.*\S.*/).optional().describe("Ad name."),
      status: z.enum(["active", "paused"]).optional(),
      creative: z
        .object({
          type: z.enum(["chat_card", "product_ad_template"]).describe("Creative type."),
          title: z.string().min(3).max(50).regex(/.*\S.*/).describe("Title 3–50 chars."),
          body: z.string().max(100).describe("Body, max 100 chars."),
          price: z.string().max(100).optional().describe("Price string for product template."),
          target_url: z.string().max(2048).optional().describe("https destination URL (required for chat_card; feed-provided for product_ad_template)."),
          file_id: z.string().optional().describe("file_id from upload_image (required for chat_card)."),
          image_crop: z.record(z.unknown()).optional().describe("Normalized square crop for chat_card."),
        })
        .describe("Creative object."),
      description: z.string().optional(),
      landing_page_configuration: z
        .object({ query_string_template: z.string().optional() })
        .optional()
        .describe("Tracking template, e.g. utm_source=openai&utm_campaign={campaign_id}&utm_content={ad_id}&click_id={oppref}. Ad level wins on key conflicts."),
    },
    async ({ ad_account_id, idempotency_key, ...rest }) => {
      assertCreativeUrlSafe(rest.creative);
      return out(
        await adsRequest({
          method: "POST",
          path: "/ads",
          body: rest,
          adAccountId: ad_account_id,
          idempotencyKey: idempotency_key?.trim() || undefined,
        })
      );
    }
  );

  server.tool(
    "update_ad",
    "Update an ad by ID (only provided fields). Send the complete creative — changing it triggers re-review.",
    {
      ad_account_id: acct,
      ad_id: z.string().min(1).describe("Ad ID."),
      name: z.string().min(3).max(1000).regex(/.*\S.*/).optional(),
      status: z.enum(["active", "paused", "archived"]).optional(),
      creative: z.record(z.unknown()).optional().describe("Full creative object."),
      description: z.string().nullable().optional(),
      landing_page_configuration: z.object({ query_string_template: z.string().nullable().optional() }).optional().describe("Tracking template; ad level wins on key conflicts."),
    },
    async ({ ad_account_id, ad_id, ...rest }) => {
      assertCreativeUrlSafe(rest.creative);
      return out(
        await adsRequest({
          method: "POST",
          path: `/ads/${encodeURIComponent(ad_id)}`,
          body: rest,
          adAccountId: ad_account_id,
        })
      );
    }
  );

  server.tool(
    "create_ad_preview",
    "Temporary iframe preview of an existing ad (QA before activating).",
    {
      ad_account_id: acct,
      ad_id: z.string().min(1).describe("Ad ID."),
    },
    async ({ ad_account_id, ad_id }) =>
      out(await adsRequest({ method: "POST", path: `/ads/${encodeURIComponent(ad_id)}/preview`, adAccountId: ad_account_id }))
  );

  const lifecycle = (action: string, desc: string) =>
    server.tool(
      `${action}_ad`,
      desc,
      {
        ad_account_id: acct,
        ad_id: z.string().min(1).describe("Ad ID."),
      },
      async ({ ad_account_id, ad_id }) =>
        out(await adsRequest({ method: "POST", path: `/ads/${encodeURIComponent(ad_id)}/${action}`, adAccountId: ad_account_id }))
    );

  lifecycle("activate", "Activate a paused ad. Campaign + ad group active and review approved required to serve.");
  lifecycle("pause", "Pause an active ad.");
  lifecycle("archive", "Archive an ad (terminal).");

  server.tool(
    "get_ad_landing_page_crawl",
    "Landing-page crawl result for an ad (can OpenAI's crawlers reach target_url). Use when review/serving issues mention the destination.",
    {
      ad_account_id: acct,
      ad_id: z.string().min(1).describe("Ad ID."),
    },
    async ({ ad_account_id, ad_id }) =>
      out(await adsRequest({ method: "GET", path: `/ads/${encodeURIComponent(ad_id)}/landing_page_crawl`, adAccountId: ad_account_id }))
  );
}
