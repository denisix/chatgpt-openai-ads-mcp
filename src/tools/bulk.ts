import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest } from "../lib/ads-client.js";
import { acct, out, restQuery } from "../lib/validators.js";

const operation = z.object({
  operation_id: z.string().min(1).max(255).describe("Unique within the job."),
  type: z.enum(["campaign.create", "campaign.update", "ad_group.create", "ad_group.update", "ad.create", "ad.update"]),
  idempotency_key: z.string().min(1).max(255).optional().describe("Required on create ops; children reference it via campaign_idempotency_key / ad_group_idempotency_key."),
  target_resource_id: z.string().optional().describe("Required on update ops (one update per resource per job)."),
  input: z.record(z.unknown()).describe("Bulk input format (max_budget_micros, target_countries, source_image_url, ...). See tool description."),
});

export function registerBulkTools(server: McpServer) {
  server.tool(
    "submit_bulk_mutation_job",
    'Limited preview (404 = not enabled; not in the OpenAPI spec). Async create/update of up to 1000 campaigns/ad groups/ads (202 + job id). Do NOT set OPENAI_AD_ACCOUNT_ID for bulk — the key maps to one account.\nInput fields — campaign.create: name, max_budget_micros (required, >=1000000), billing_event_type, budget_type, status, target_countries, location_ids. campaign.update: name, description, status, max_budget_micros, budget_type, start_time, end_time, location_ids. ad_group.create: campaign_idempotency_key, name (required), context_hints, exclusion_hints, max_bid_micros (click) or max_cpm_bid_micros (impression), status. ad_group.update: name, description, status, context_hints, exclusion_hints, max_bid_micros, max_cpm_bid_micros. ad.create: campaign_idempotency_key, ad_group_idempotency_key, title, body, target_url, source_image_url (required), status. ad.update: name, status, creative (title, body, target_url, file_id).\nUpdates cannot target resources created in the same job. validate_only skips existence/image/limit checks. Retry an uncertain submission with the same idempotency_key and body; rerun a failed job with a NEW key and the same create keys.',
    {
      ad_account_id: acct,
      idempotency_key: z.string().min(1).max(255).optional().describe("Request-level Idempotency-Key header."),
      operations: z.array(operation).min(1).max(1000),
      validate_only: z.boolean().optional().describe("Default false."),
      partial_failure: z.boolean().optional().describe("Default true; false skips later operations after a failure (no rollback)."),
    },
    async ({ ad_account_id, idempotency_key, operations, validate_only, partial_failure }) => {
      const seen = new Set<string>();
      for (const op of operations) {
        if (seen.has(op.operation_id)) throw new Error(`Duplicate operation_id: ${op.operation_id}`);
        seen.add(op.operation_id);
        if (op.type.endsWith(".create") && !op.idempotency_key) throw new Error(`${op.operation_id}: create operations need idempotency_key.`);
        if (op.type.endsWith(".update") && !op.target_resource_id) throw new Error(`${op.operation_id}: update operations need target_resource_id.`);
      }
      const body: Record<string, unknown> = { operations };
      if (validate_only !== undefined) body.validate_only = validate_only;
      if (partial_failure !== undefined) body.partial_failure = partial_failure;
      return out(
        await adsRequest({
          method: "POST",
          path: "/bulk_mutation_jobs",
          body,
          adAccountId: ad_account_id,
          idempotencyKey: idempotency_key?.trim() || undefined,
        })
      );
    }
  );

  server.tool(
    "get_bulk_mutation_job",
    "Poll a bulk job: pending → in_progress → completed / partially_failed / failed.",
    {
      ad_account_id: acct,
      job_id: z.string().min(1).describe("Job ID (blkmtnjob_...).",
      ),
    },
    async ({ ad_account_id, job_id }) =>
      out(await adsRequest({ method: "GET", path: `/bulk_mutation_jobs/${encodeURIComponent(job_id)}`, adAccountId: ad_account_id }))
  );

  server.tool(
    "list_bulk_mutation_job_operations",
    "Per-operation results of a bulk job (created/updated/validated/failed/skipped). Cursors work once `complete` is true: pass the last operation_id as `after` while has_more. Honor retryable / retry_after_seconds.",
    {
      ad_account_id: acct,
      job_id: z.string().min(1).describe("Job ID."),
      limit: z.number().int().min(1).max(100).optional().describe("Default 100."),
      after: z.string().optional().describe("Last operation_id of the previous page."),
    },
    async ({ ad_account_id, job_id, limit, after }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/bulk_mutation_jobs/${encodeURIComponent(job_id)}/operations`,
          query: restQuery({ limit, after }),
          adAccountId: ad_account_id,
        })
      )
  );
}
