import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest, requireIdempotencyKey } from "../lib/ads-client.js";
import { resolveAdAccountId } from "../config.js";
import { validateExternalUrl } from "../lib/ssrf-guard.js";
import { acct, idemRequired, out, restQuery } from "../lib/validators.js";

export function registerLeadSyncTools(server: McpServer) {
  server.tool(
    "create_lead_sync_subscription",
    "Provision lead delivery to a webhook for an ad account. Leads are POSTed with Standard Webhooks HMAC signature.",
    {
      ad_account_id: acct,
      idempotency_key: idemRequired,
      destination_url: z.string().url().describe("Webhook destination https URL."),
      signing_secret: z.string().min(1).optional().describe("Optional signing secret for the HMAC signature."),
    },
    async ({ ad_account_id, idempotency_key, destination_url, signing_secret }) => {
      validateExternalUrl(destination_url, { requireHttps: true, paramName: "destination_url" });
      const account = resolveAdAccountId(ad_account_id);
      if (!account) throw new Error("ad_account_id is required (or set OPENAI_AD_ACCOUNT_ID).");
      return out(
        await adsRequest({
          method: "POST",
          path: "/lead_sync_subscriptions",
          body: signing_secret ? { ad_account_id: account, destination_url, signing_secret } : { ad_account_id: account, destination_url },
          adAccountId: ad_account_id,
          idempotencyKey: requireIdempotencyKey(idempotency_key),
        })
      );
    }
  );

  server.tool(
    "list_lead_sync_subscriptions",
    "List lead-sync subscriptions (ad_account_id is a required query param).",
    {
      ad_account_id: z.string().describe("Ad account ID (required)."),
    },
    async ({ ad_account_id }) =>
      out(await adsRequest({ method: "GET", path: "/lead_sync_subscriptions", query: restQuery({ ad_account_id }), adAccountId: ad_account_id }))
  );

  server.tool(
    "get_lead_sync_subscription",
    "One lead-sync subscription by ID (leadsync_...).",
    {
      ad_account_id: acct,
      subscription_id: z.string().min(1).describe("Subscription ID."),
    },
    async ({ ad_account_id, subscription_id }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/lead_sync_subscriptions/${encodeURIComponent(subscription_id)}`,
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "delete_lead_sync_subscription",
    "Delete a lead-sync subscription (stops webhook delivery).",
    {
      ad_account_id: acct,
      subscription_id: z.string().min(1).describe("Subscription ID."),
    },
    async ({ ad_account_id, subscription_id }) =>
      out(
        await adsRequest({
          method: "DELETE",
          path: `/lead_sync_subscriptions/${encodeURIComponent(subscription_id)}`,
          adAccountId: ad_account_id,
        })
      )
  );
}
