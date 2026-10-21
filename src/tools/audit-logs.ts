import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest } from "../lib/ads-client.js";
import { acct, out, restQuery } from "../lib/validators.js";

export function registerAuditLogTools(server: McpServer) {
  server.tool(
    "list_audit_logs",
    "Recorded changes to campaigns/ad groups/ads etc. (API-key auth only). Filters AND; IDs without partition prefix. Paginate with last_id → after (or first_id → before), same filters; never both cursors.",
    {
      ad_account_id: acct,
      limit: z.number().int().min(1).max(100).optional().describe("1–100, default 50."),
      after: z.string().optional().describe("Audit-log ID (last_id) for the next page."),
      before: z.string().optional().describe("Audit-log ID (first_id) for the previous page."),
      order: z.enum(["asc", "desc"]).optional().describe("Default desc."),
      campaign_id: z.string().optional().describe("Includes the campaign's ad groups and ads."),
      ad_group_id: z.string().optional().describe("Includes the ad group's ads."),
      ad_id: z.string().optional(),
      actor_id: z.string().optional().describe("Changes made by this actor."),
      start_time: z.number().int().min(946684800).max(4102444800).optional().describe("Inclusive unix seconds."),
      end_time: z.number().int().min(946684800).max(4102444800).optional().describe("Inclusive unix seconds."),
    },
    async ({ ad_account_id, after, before, ...rest }) => {
      if (after && before) throw new Error("Send only one of after / before.");
      return out(await adsRequest({ method: "GET", path: "/audit_logs", query: restQuery({ ...rest, after, before }), adAccountId: ad_account_id }));
    }
  );
}
