import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest } from "../lib/ads-client.js";
import { validateExternalUrl } from "../lib/ssrf-guard.js";
import { acct, out } from "../lib/validators.js";

const privacyUrl = z.string().url().optional().describe("Privacy policy https URL.");

function assertPolicyUrlSafe(url: unknown): void {
  if (typeof url === "string" && url) validateExternalUrl(url, { requireHttps: true, paramName: "privacy_policy_url" });
}

export function registerBusinessAgentTools(server: McpServer) {
  server.tool(
    "list_business_agent_tools",
    "Business Agent tools/connectors installed for this API project — discover IDs for create_business_agent.",
    {},
    async () => out(await adsRequest({ method: "GET", path: "/business_agent_tools" }))
  );

  server.tool(
    "list_business_agents",
    "List Business Agents (id, name, draft/published status).",
    { ad_account_id: acct },
    async ({ ad_account_id }) => out(await adsRequest({ method: "GET", path: "/business_agents", adAccountId: ad_account_id }))
  );

  server.tool(
    "create_business_agent",
    "Create a draft Business Agent (name 1–50, instructions 1–4000). Publish separately via publish_business_agent.",
    {
      ad_account_id: acct,
      name: z.string().min(1).max(50).describe("Agent name 1–50 chars."),
      instructions: z.string().min(1).max(4000).describe("Instructions 1–4000 chars."),
      description: z.string().min(1).max(300).optional(),
      privacy_policy_url: privacyUrl,
      conversation_starters: z.array(z.string().max(300)).max(12).optional().describe("Up to 12 starters, <=300 chars each."),
      product_feed_ids: z.array(z.string()).max(50).optional(),
      connector_ids: z.array(z.string()).max(50).optional(),
      tools: z.array(z.record(z.unknown())).max(50).optional().describe("Up to 50 tool definitions."),
      lead_form: z.object({ lead_form_id: z.string().min(1), lead_form_revision_id: z.string().optional() }).optional().describe("Lead form linkage."),
    },
    async ({ ad_account_id, ...rest }) => {
      assertPolicyUrlSafe(rest.privacy_policy_url);
      return out(await adsRequest({ method: "POST", path: "/business_agents", body: rest, adAccountId: ad_account_id }));
    }
  );

  server.tool(
    "get_business_agent",
    "One Business Agent by ID.",
    {
      ad_account_id: acct,
      business_agent_id: z.string().min(1).describe("Business agent ID."),
    },
    async ({ ad_account_id, business_agent_id }) =>
      out(await adsRequest({ method: "GET", path: `/business_agents/${encodeURIComponent(business_agent_id)}`, adAccountId: ad_account_id }))
  );

  server.tool(
    "update_business_agent",
    "Replace a Business Agent's config and save as draft. Requires full desired state; omitted optional fields reset (lead_form preserved unless null).",
    {
      ad_account_id: acct,
      business_agent_id: z.string().min(1).describe("Business agent ID."),
      name: z.string().min(1).max(50).describe("Agent name 1–50 chars."),
      instructions: z.string().min(1).max(4000).describe("Instructions 1–4000 chars."),
      description: z.string().min(1).max(300).nullable().optional(),
      privacy_policy_url: privacyUrl.nullable().optional(),
      conversation_starters: z.array(z.string().max(300)).max(12).nullable().optional(),
      product_feed_ids: z.array(z.string()).max(50).optional(),
      connector_ids: z.array(z.string()).max(50).optional(),
      tools: z.array(z.record(z.unknown())).max(50).optional(),
      lead_form: z.object({ lead_form_id: z.string().min(1), lead_form_revision_id: z.string().optional() }).nullable().optional(),
    },
    async ({ ad_account_id, business_agent_id, ...rest }) => {
      assertPolicyUrlSafe(rest.privacy_policy_url);
      return out(
        await adsRequest({
          method: "POST",
          path: `/business_agents/${encodeURIComponent(business_agent_id)}`,
          body: rest,
          adAccountId: ad_account_id,
        })
      );
    }
  );

  server.tool(
    "preview_business_agent",
    "Preview a Business Agent response for QA before publishing.",
    {
      ad_account_id: acct,
      business_agent_id: z.string().min(1).describe("Business agent ID."),
      message: z.string().min(1).describe("Test user message."),
      conversation_id: z.string().optional().describe("Optional conversation ID for context."),
    },
    async ({ ad_account_id, business_agent_id, message, conversation_id }) =>
      out(
        await adsRequest({
          method: "POST",
          path: `/business_agents/${encodeURIComponent(business_agent_id)}/preview`,
          body: conversation_id ? { message, conversation_id } : { message },
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "publish_business_agent",
    "Publish a Business Agent draft to make it live (preview first).",
    {
      ad_account_id: acct,
      business_agent_id: z.string().min(1).describe("Business agent ID."),
    },
    async ({ ad_account_id, business_agent_id }) =>
      out(await adsRequest({ method: "POST", path: `/business_agents/${encodeURIComponent(business_agent_id)}/publish`, adAccountId: ad_account_id }))
  );
}
