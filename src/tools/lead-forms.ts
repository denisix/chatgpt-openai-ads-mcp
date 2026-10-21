import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest, requireIdempotencyKey } from "../lib/ads-client.js";
import { validateExternalUrl } from "../lib/ssrf-guard.js";
import { acct, idemRequired, out, restQuery } from "../lib/validators.js";

const formField = z.object({
  field_id: z.string().min(1).max(128),
  field_type: z.enum(["text", "choice"]),
  label: z.string().min(1).max(256),
  required: z.boolean(),
  options: z.array(z.object({ id: z.string().min(1).max(128), label: z.string().min(1).max(256) })).max(100).optional(),
});

function assertPolicyUrlSafe(url: string | null | undefined): void {
  if (typeof url === "string" && url) validateExternalUrl(url, { requireHttps: true, paramName: "privacy_policy_url" });
}

export function registerLeadFormTools(server: McpServer) {
  server.tool(
    "list_lead_forms",
    "List Lead Forms for the ad account.",
    { ad_account_id: acct },
    async ({ ad_account_id }) => out(await adsRequest({ method: "GET", path: "/lead_forms", adAccountId: ad_account_id }))
  );

  server.tool(
    "create_lead_form",
    "Create a draft Lead Form (name 1–256 + 3–5 fields; choice fields need options). Publish via publish_lead_form.",
    {
      ad_account_id: acct,
      name: z.string().min(1).max(256).describe("Form name 1–256 chars."),
      description: z.string().max(1000).optional(),
      fields: z.array(formField).min(3).max(5).describe("3–5 fields."),
      privacy_policy_url: z.string().url().optional(),
    },
    async ({ ad_account_id, ...rest }) => {
      assertPolicyUrlSafe(rest.privacy_policy_url);
      return out(await adsRequest({ method: "POST", path: "/lead_forms", body: rest, adAccountId: ad_account_id }));
    }
  );

  server.tool(
    "get_lead_form",
    "One Lead Form by ID (optional rev_id for a specific revision).",
    {
      ad_account_id: acct,
      lead_form_id: z.string().min(1).describe("Lead form ID."),
      rev_id: z.string().min(1).max(256).optional().describe("Revision ID."),
    },
    async ({ ad_account_id, lead_form_id, rev_id }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/lead_forms/${encodeURIComponent(lead_form_id)}`,
          query: restQuery({ rev_id }),
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "update_lead_form",
    "Save a new draft revision; pass expected_draft_revision_id from get_lead_form for optimistic locking.",
    {
      ad_account_id: acct,
      lead_form_id: z.string().min(1).describe("Lead form ID."),
      expected_draft_revision_id: z.string().optional().describe("Current draft revision ID."),
      name: z.string().min(1).max(256).optional(),
      description: z.string().max(1000).nullable().optional(),
      fields: z.array(formField).min(3).max(5).optional(),
      privacy_policy_url: z.string().url().nullable().optional(),
    },
    async ({ ad_account_id, lead_form_id, ...rest }) => {
      assertPolicyUrlSafe(rest.privacy_policy_url);
      return out(
        await adsRequest({
          method: "POST",
          path: `/lead_forms/${encodeURIComponent(lead_form_id)}`,
          body: rest,
          adAccountId: ad_account_id,
        })
      );
    }
  );

  server.tool(
    "publish_lead_form",
    "Publish the current Lead Form draft (then attach to a Business Agent).",
    {
      ad_account_id: acct,
      lead_form_id: z.string().min(1).describe("Lead form ID."),
    },
    async ({ ad_account_id, lead_form_id }) =>
      out(await adsRequest({ method: "POST", path: `/lead_forms/${encodeURIComponent(lead_form_id)}/publish`, body: {}, adAccountId: ad_account_id }))
  );

  server.tool(
    "archive_lead_form",
    "Archive a Lead Form not attached to a published Business Agent.",
    {
      ad_account_id: acct,
      lead_form_id: z.string().min(1).describe("Lead form ID."),
    },
    async ({ ad_account_id, lead_form_id }) =>
      out(await adsRequest({ method: "POST", path: `/lead_forms/${encodeURIComponent(lead_form_id)}/archive`, adAccountId: ad_account_id }))
  );

  server.tool(
    "create_test_lead_submission",
    "Queue a synthetic signed lead-sync webhook delivery to validate handling before going live.",
    {
      ad_account_id: acct,
      lead_form_id: z.string().min(1).describe("Lead form ID."),
      idempotency_key: idemRequired,
      field_values: z.record(z.string()).optional().describe("Synthetic values keyed by field_id."),
    },
    async ({ ad_account_id, lead_form_id, idempotency_key, field_values }) =>
      out(
        await adsRequest({
          method: "POST",
          path: `/lead_forms/${encodeURIComponent(lead_form_id)}/test_submissions`,
          body: field_values ? { field_values } : {},
          adAccountId: ad_account_id,
          idempotencyKey: requireIdempotencyKey(idempotency_key),
        })
      )
  );
}
