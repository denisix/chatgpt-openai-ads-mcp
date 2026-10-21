import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest } from "../lib/ads-client.js";
import { validateExternalUrl } from "../lib/ssrf-guard.js";
import { acct, listParams, out, restQuery } from "../lib/validators.js";

const productFilter = z.array(
  z.object({ field: z.string(), operator: z.enum(["in", "gt", "gte", "lt", "lte"]), values: z.array(z.string()) })
);

export function registerProductFeedTools(server: McpServer) {
  server.tool(
    "create_product_feed",
    "Create a product feed (merchant catalog); configure SFTP afterwards if needed.",
    {
      ad_account_id: acct,
      name: z.string().min(1).max(1000).optional().describe("Feed name."),
      countries: z.array(z.string()).optional().describe('Target countries, e.g. ["US"].'),
      url: z.string().url().optional().describe("Hosted feed URL (not in the published spec; may be ignored)."),
    },
    async ({ ad_account_id, ...rest }) => {
      if (typeof rest.url === "string" && rest.url) validateExternalUrl(rest.url, { requireHttps: true, paramName: "url" });
      return out(await adsRequest({ method: "POST", path: "/feeds", body: rest, adAccountId: ad_account_id }));
    }
  );

  server.tool(
    "list_product_feeds",
    "List product feeds; feed_id chains to query/patch/sftp/settings tools.",
    {
      ad_account_id: acct,
      ...listParams,
      include: z.array(z.string()).optional(),
    },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "GET", path: "/feeds", query: restQuery(rest), adAccountId: ad_account_id }))
  );

  server.tool(
    "archive_product_feed",
    "Archive a product feed (cannot be used for new campaigns).",
    {
      ad_account_id: acct,
      feed_id: z.string().min(1).describe("Product feed ID."),
    },
    async ({ ad_account_id, feed_id }) =>
      out(await adsRequest({ method: "POST", path: `/feeds/${encodeURIComponent(feed_id)}/archive`, adAccountId: ad_account_id }))
  );

  server.tool(
    "list_product_feed_uploads",
    "Feed ingestion history — debug catalog fetch issues.",
    {
      ad_account_id: acct,
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().optional(),
      before: z.string().optional(),
    },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "GET", path: "/feeds/uploads", query: restQuery(rest), adAccountId: ad_account_id }))
  );

  server.tool(
    "query_product_feed_products",
    "Products in a feed matching filters — validate targeting before creating an ad_group with product_set.",
    {
      ad_account_id: acct,
      feed_id: z.string().min(1).describe("Product feed ID."),
      filters: productFilter.optional().describe("Product filters."),
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().optional(),
    },
    async ({ ad_account_id, feed_id, ...rest }) =>
      out(
        await adsRequest({
          method: "POST",
          path: `/feeds/${encodeURIComponent(feed_id)}/products/query`,
          body: rest,
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "patch_product_feed_products",
    "Delta-update product availability/prices without a full re-upload.",
    {
      ad_account_id: acct,
      feed_id: z.string().min(1).describe("Product feed ID."),
      products: z
        .array(
          z.object({
            item_id: z.string().optional(),
            availability: z.string().optional().describe("e.g. in_stock, out_of_stock"),
            price: z.string().optional().describe("Price string, e.g. '19.99 USD'"),
          })
        )
        .min(1)
        .describe("Products to patch."),
    },
    async ({ ad_account_id, feed_id, products }) =>
      out(
        await adsRequest({
          method: "PATCH",
          path: `/feeds/${encodeURIComponent(feed_id)}/products`,
          body: { products },
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "get_product_feed_sftp_access",
    "SFTP access details (host, username, path) for a feed.",
    {
      ad_account_id: acct,
      feed_id: z.string().min(1).describe("Product feed ID."),
    },
    async ({ ad_account_id, feed_id }) =>
      out(await adsRequest({ method: "GET", path: `/feeds/${encodeURIComponent(feed_id)}/sftp_access`, adAccountId: ad_account_id }))
  );

  server.tool(
    "create_product_feed_sftp_access",
    "Create or replace SFTP credentials for a feed; returns credentials for your SFTP client.",
    {
      ad_account_id: acct,
      feed_id: z.string().min(1).describe("Product feed ID."),
      authentication_method: z.enum(["password", "ssh_key"]).describe("SFTP authentication method."),
      ssh_public_key: z.string().min(1).optional().describe("Required when authentication_method=ssh_key."),
    },
    async ({ ad_account_id, feed_id, authentication_method, ssh_public_key }) => {
      if (authentication_method === "ssh_key" && !ssh_public_key) throw new Error("ssh_public_key is required for ssh_key.");
      return out(
        await adsRequest({
          method: "POST",
          path: `/feeds/${encodeURIComponent(feed_id)}/sftp_access`,
          body: ssh_public_key ? { authentication_method, ssh_public_key } : { authentication_method },
          adAccountId: ad_account_id,
        })
      );
    }
  );

  const sftpAction = (action: "/activate" | "/pause", name: string, desc: string) =>
    server.tool(
      name,
      desc,
      {
        ad_account_id: acct,
        feed_id: z.string().min(1).describe("Product feed ID."),
      },
      async ({ ad_account_id, feed_id }) =>
        out(await adsRequest({ method: "POST", path: `/feeds/${encodeURIComponent(feed_id)}/sftp_access${action}`, adAccountId: ad_account_id }))
    );

  sftpAction("/activate", "activate_product_feed_sftp_access", "Activate SFTP access (resume ingestion).");
  sftpAction("/pause", "pause_product_feed_sftp_access", "Pause SFTP access (stop ingestion).");

  server.tool(
    "get_product_feed_settings",
    "Feed settings (name, is_search_eligible_respected).",
    {
      ad_account_id: acct,
      feed_id: z.string().min(1).describe("Product feed ID."),
    },
    async ({ ad_account_id, feed_id }) =>
      out(await adsRequest({ method: "GET", path: `/feeds/${encodeURIComponent(feed_id)}/settings`, adAccountId: ad_account_id }))
  );

  server.tool(
    "update_product_feed_settings",
    "Update feed settings (only provided fields).",
    {
      ad_account_id: acct,
      feed_id: z.string().min(1).describe("Product feed ID."),
      name: z.string().min(1).optional(),
      is_search_eligible_respected: z.boolean().optional(),
    },
    async ({ ad_account_id, feed_id, ...rest }) =>
      out(
        await adsRequest({
          method: "PATCH",
          path: `/feeds/${encodeURIComponent(feed_id)}/settings`,
          body: rest,
          adAccountId: ad_account_id,
        })
      )
  );
}
