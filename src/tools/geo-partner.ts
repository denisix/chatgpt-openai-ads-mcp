import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest } from "../lib/ads-client.js";
import { acct, dateField, out, restQuery } from "../lib/validators.js";

export function registerGeoPartnerTools(server: McpServer) {
  server.tool(
    "search_geo_lookup",
    "Search DMA/region codes for geo targeting; returned IDs feed campaign targeting.locations.include.",
    {
      ad_account_id: acct,
      q: z.string().min(1).describe("Query, e.g. 'California', 'New York DMA', 'US-CA'."),
      limit: z.number().int().min(1).max(100).optional().describe("Max 1–100."),
    },
    async ({ ad_account_id, q, limit }) =>
      out(await adsRequest({ method: "GET", path: "/geo_lookup/search", query: restQuery({ q, limit }), adAccountId: ad_account_id }))
  );

  server.tool(
    "create_partner_data_upload",
    "Create an Ads partner-data upload (identity_graph snapshot); poll via get_partner_data_upload.",
    {
      ad_account_id: acct,
      data_type: z.enum(["identity_graph"]).describe("Partner data type."),
      snapshot_date: dateField.describe("Snapshot date YYYY-MM-DD."),
      file_name: z.string().min(1).describe("Name of the file you will upload."),
      file_size_bytes: z.number().int().min(1).describe("Exact file size in bytes."),
      sha256: z.string().regex(/^[0-9a-fA-F]{64}$/).describe("SHA-256 hex digest of the file."),
    },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "POST", path: "/partner_data/uploads", body: rest, adAccountId: ad_account_id }))
  );

  server.tool(
    "get_partner_data_upload",
    "Partner-data upload by ID (pdu_...) — poll processing status.",
    {
      ad_account_id: acct,
      upload_id: z.string().regex(/^pdu_[0-9a-f]{32}$/).describe("Upload ID pdu_[0-9a-f]{32}."),
    },
    async ({ ad_account_id, upload_id }) =>
      out(await adsRequest({ method: "GET", path: `/partner_data/uploads/${encodeURIComponent(upload_id)}`, adAccountId: ad_account_id }))
  );
}
