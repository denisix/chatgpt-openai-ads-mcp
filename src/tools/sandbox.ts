import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest, requireIdempotencyKey } from "../lib/ads-client.js";
import { acct, idem, out, restQuery } from "../lib/validators.js";

const batchId = z.string().min(1).describe("Eligibility job (batch) ID.");

export function registerSandboxTools(server: McpServer) {
  server.tool(
    "create_ad_eligibility_job",
    "Sandbox: submit prompts to check ad eligibility for a campaign. Idempotency key auto-generated if omitted.",
    {
      ad_account_id: acct,
      idempotency_key: idem,
      ad_account_id_body: z.string().describe("Ad account ID evaluated (body.ad_account_id)."),
      campaign_id: z.string(),
      association_id: z.string(),
      enrollment_generation: z.number().int(),
      consent_revision: z.number().int(),
      evaluation_context: z.object({ country_code: z.string(), locale: z.string(), region_code: z.string() }),
      queries: z.array(z.object({ query_id: z.string(), prompt: z.string() })).min(1),
    },
    async ({ ad_account_id, idempotency_key, ad_account_id_body, ...rest }) =>
      out(
        await adsRequest({
          method: "POST",
          path: "/sandbox/ad_eligibility_jobs",
          body: { schema_version: "1.0", ad_account_id: ad_account_id_body, ...rest },
          adAccountId: ad_account_id,
          idempotencyKey: requireIdempotencyKey(idempotency_key),
        })
      )
  );

  server.tool(
    "get_ad_eligibility_job",
    "Sandbox: eligibility job status.",
    {
      ad_account_id: acct,
      batch_id: batchId,
    },
    async ({ ad_account_id, batch_id }) =>
      out(await adsRequest({ method: "GET", path: `/sandbox/ad_eligibility_jobs/${encodeURIComponent(batch_id)}`, adAccountId: ad_account_id }))
  );

  server.tool(
    "get_ad_eligibility_job_results",
    "Sandbox: page through eligibility job results.",
    {
      ad_account_id: acct,
      batch_id: batchId,
      offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).optional(),
    },
    async ({ ad_account_id, batch_id, offset, limit }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/sandbox/ad_eligibility_jobs/${encodeURIComponent(batch_id)}/results`,
          query: restQuery({ offset, limit }),
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "cancel_ad_eligibility_job",
    "Sandbox: cancel an eligibility job.",
    {
      ad_account_id: acct,
      batch_id: batchId,
    },
    async ({ ad_account_id, batch_id }) =>
      out(await adsRequest({ method: "POST", path: `/sandbox/ad_eligibility_jobs/${encodeURIComponent(batch_id)}/cancel`, adAccountId: ad_account_id }))
  );
}
