import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest, requireIdempotencyKey } from "../lib/ads-client.js";
import { acct, idemRequired, listParams, out, restQuery } from "../lib/validators.js";

const identifierType = z.enum(["email", "phone", "email_sha256", "phone_number_sha256", "gaid"]);

const memberMutation = (
  server: McpServer,
  action: "add" | "remove",
  desc: string
) =>
  server.tool(
    `${action}_audience_members`,
    desc,
    {
      ad_account_id: acct,
      custom_audience_id: z.string().min(1).describe("Custom audience ID."),
      idempotency_key: idemRequired,
      expected_revision: z.number().int().min(0).describe("Current membership_revision from get_custom_audience."),
      file_id: z.string().optional().describe("File ID from upload_audience_file (or use identifiers)."),
      identifiers: z
        .array(z.object({ identifier_type: identifierType, identifier: z.string().min(1) }))
        .optional()
        .describe("Inline identifiers (alternative to file_id; <=10k, use file for more)."),
      identifier_type: identifierType.optional(),
      identifier_resolution: z.enum(["auto"]).optional(),
    },
    async ({ ad_account_id, custom_audience_id, idempotency_key, ...rest }) => {
      if (!rest.file_id && !rest.identifiers) throw new Error("Provide either file_id or identifiers.");
      return out(
        await adsRequest({
          method: "POST",
          path: `/custom_audiences/${encodeURIComponent(custom_audience_id)}/${action}`,
          body: rest,
          adAccountId: ad_account_id,
          idempotencyKey: requireIdempotencyKey(idempotency_key),
        })
      );
    }
  );

export function registerAudienceTools(server: McpServer) {
  server.tool(
    "list_custom_audiences",
    "List custom audiences; returns membership_revision needed for mutations.",
    {
      ad_account_id: acct,
      intended_use: z.enum(["inclusion", "exclusion", "bid_multiplier"]).optional().describe("Filter by intended use."),
      custom_audience_ids: z.array(z.string()).max(500).optional().describe("Filter to specific IDs (max 500)."),
      policy_revision: z.string().length(64).optional().describe("64-char hash for eligibility recheck."),
      matched_count_granularity: z.enum(["granular"]).optional(),
      ...listParams,
    },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "GET", path: "/custom_audiences", query: restQuery(rest), adAccountId: ad_account_id }))
  );

  server.tool(
    "create_custom_audience",
    "Create a custom audience from an uploaded file (file_id from upload_audience_file) or empty if enabled. Async — poll via get_custom_audience until published.",
    {
      ad_account_id: acct,
      name: z.string().min(3).max(1000).regex(/.*\S.*/).describe("Audience name 3–1000 chars."),
      description: z.string().optional(),
      file_id: z.string().optional().describe("File ID from upload_audience_file (omit for empty audience if enabled)."),
      identifier_type: identifierType.optional().describe("For single-column files."),
      identifier_resolution: z.enum(["auto"]).optional().describe("auto for mixed CSV with headers email,phone_number,email_sha256,phone_number_sha256,gaid."),
      filename: z.string().min(1).max(255).optional().describe("Original filename .csv/.txt."),
      mimetype: z.enum(["text/csv", "text/plain"]).optional(),
      file_size: z.number().int().min(1).max(500000000).optional().describe("File size bytes."),
    },
    async ({ ad_account_id, ...rest }) =>
      out(await adsRequest({ method: "POST", path: "/custom_audiences", body: rest, adAccountId: ad_account_id }))
  );

  server.tool(
    "get_custom_audience",
    "One custom audience by ID — check processing state and membership_revision before mutations.",
    {
      ad_account_id: acct,
      custom_audience_id: z.string().min(1).describe("Custom audience ID."),
      matched_count_granularity: z.enum(["granular"]).optional(),
    },
    async ({ ad_account_id, custom_audience_id, matched_count_granularity }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/custom_audiences/${encodeURIComponent(custom_audience_id)}`,
          query: restQuery({ matched_count_granularity }),
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "archive_custom_audience",
    "Archive a custom audience (can no longer be used for targeting).",
    {
      ad_account_id: acct,
      custom_audience_id: z.string().min(1).describe("Custom audience ID."),
    },
    async ({ ad_account_id, custom_audience_id }) =>
      out(await adsRequest({ method: "POST", path: `/custom_audiences/${encodeURIComponent(custom_audience_id)}/archive`, adAccountId: ad_account_id }))
  );

  memberMutation(server, "add", "Add identifiers to an audience (file or inline). Requires idempotency_key + expected_revision; poll via get_audience_operation.");
  memberMutation(server, "remove", "Remove identifiers from an audience (file or inline). Requires idempotency_key + expected_revision; poll via get_audience_operation.");

  server.tool(
    "replace_audience_members",
    "Replace all members from an uploaded file + current revision. Requires idempotency_key; poll via get_audience_operation.",
    {
      ad_account_id: acct,
      custom_audience_id: z.string().min(1).describe("Custom audience ID."),
      idempotency_key: idemRequired,
      expected_revision: z.number().int().min(0).describe("Current membership_revision (required)."),
      file_id: z.string().min(1).describe("Replacement file ID from upload_audience_file."),
      filename: z.string().optional(),
      mimetype: z.enum(["text/csv", "text/plain"]).optional(),
      file_size: z.number().int().optional(),
      identifier_type: identifierType.optional(),
      identifier_resolution: z.enum(["auto"]).optional(),
    },
    async ({ ad_account_id, custom_audience_id, idempotency_key, ...rest }) =>
      out(
        await adsRequest({
          method: "POST",
          path: `/custom_audiences/${encodeURIComponent(custom_audience_id)}/replace`,
          body: rest,
          adAccountId: ad_account_id,
          idempotencyKey: requireIdempotencyKey(idempotency_key),
        })
      )
  );

  server.tool(
    "merge_custom_audiences",
    "New audience with all matched members from 2–64 sources (independent copy).",
    {
      ad_account_id: acct,
      idempotency_key: idemRequired,
      name: z.string().min(3).max(1000).regex(/.*\S.*/).describe("Merged audience name 3–1000 chars."),
      custom_audience_ids: z.array(z.string().min(1)).min(2).max(64).describe("2–64 source audience IDs."),
      description: z.string().optional(),
    },
    async ({ ad_account_id, idempotency_key, ...rest }) =>
      out(
        await adsRequest({
          method: "POST",
          path: "/custom_audiences/merge",
          body: rest,
          adAccountId: ad_account_id,
          idempotencyKey: requireIdempotencyKey(idempotency_key),
        })
      )
  );

  server.tool(
    "get_audience_operation",
    "Mutation (add/remove/replace/merge) status: processing → succeeded/failed. Poll with backoff using operation_id from the mutation response.",
    {
      ad_account_id: acct,
      custom_audience_id: z.string().min(1).describe("Custom audience ID."),
      operation_id: z.string().min(1).max(128).describe("Operation ID from mutation response."),
    },
    async ({ ad_account_id, custom_audience_id, operation_id }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/custom_audiences/${encodeURIComponent(custom_audience_id)}/operations/${encodeURIComponent(operation_id)}`,
          adAccountId: ad_account_id,
        })
      )
  );

  server.tool(
    "list_audience_operations",
    "Mutation operations for a custom audience.",
    {
      ad_account_id: acct,
      custom_audience_id: z.string().min(1).describe("Custom audience ID."),
      limit: z.number().int().min(1).max(500).optional(),
      cursor: z.string().optional().describe("Cursor from a previous response."),
    },
    async ({ ad_account_id, custom_audience_id, limit, cursor }) =>
      out(
        await adsRequest({
          method: "GET",
          path: `/custom_audiences/${encodeURIComponent(custom_audience_id)}/operations`,
          query: restQuery({ limit, cursor }),
          adAccountId: ad_account_id,
        })
      )
  );

  for (const action of ["cancel", "resume"] as const) {
    server.tool(
      `${action}_audience_operation`,
      `${action === "cancel" ? "Cancel" : "Resume"} a custom audience mutation operation.`,
      {
        ad_account_id: acct,
        custom_audience_id: z.string().min(1).describe("Custom audience ID."),
        operation_id: z.string().min(1).max(128).describe("Operation ID."),
      },
      async ({ ad_account_id, custom_audience_id, operation_id }) =>
        out(
          await adsRequest({
            method: "POST",
            path: `/custom_audiences/${encodeURIComponent(custom_audience_id)}/operations/${encodeURIComponent(operation_id)}/${action}`,
            adAccountId: ad_account_id,
          })
        )
    );
  }
}
