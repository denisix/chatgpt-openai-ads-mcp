import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest } from "../lib/ads-client.js";
import { validateExternalUrl } from "../lib/ssrf-guard.js";
import { acct, out } from "../lib/validators.js";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

export function registerFileTools(server: McpServer) {
  server.tool(
    "upload_image",
    "Upload a creative image; returns file_id for create_ad creative.file_id. Provide image_url (https, SSRF-checked) OR image_base64 (raw base64, no data: prefix).",
    {
      ad_account_id: acct,
      image_url: z.string().url().optional().describe("Public https URL of the image."),
      image_base64: z.string().optional().describe("Base64 image bytes (no data: prefix)."),
      filename: z.string().optional().describe("Filename for base64 upload (e.g. creative.png)."),
      purpose: z.literal("account_favicon").optional().describe("Advertiser icon (min 128×128); assign via update_ad_account_brand."),
    },
    async ({ ad_account_id, image_url, image_base64, filename, purpose }) => {
      if (!image_url && !image_base64) throw new Error("Provide either image_url or image_base64.");
      if (image_url && image_base64) throw new Error("Provide only one of image_url or image_base64.");

      if (image_url) {
        validateExternalUrl(image_url, { requireHttps: true, paramName: "image_url" });
        return out(
          await adsRequest({
            method: "POST",
            path: "/upload",
            body: purpose ? { image_url, purpose } : { image_url },
            adAccountId: ad_account_id,
          })
        );
      }

      const bytes = Buffer.from(image_base64!, "base64");
      if (bytes.length === 0) throw new Error("image_base64 decoded to 0 bytes — check it's valid base64.");
      if (bytes.length > 10 * 1024 * 1024) throw new Error("Image exceeds 10MB limit.");
      const name = filename || "upload.png";
      const fd = new FormData();
      fd.append("file", new Blob([bytes], { type: MIME_BY_EXT[name.split(".").pop()?.toLowerCase() ?? ""] ?? "image/png" }), name);
      if (purpose) fd.append("purpose", purpose);
      return out(await adsRequest({ method: "POST", path: "/upload", formData: fd, adAccountId: ad_account_id }));
    }
  );

  server.tool(
    "upload_audience_file",
    "Upload a CSV/TXT (<=500MB) for custom audiences; returns file_id (oaisdmntci_...) for create_custom_audience / add_audience_members.",
    {
      ad_account_id: acct,
      file_base64: z.string().describe("Base64 file bytes (CSV/TXT)."),
      filename: z.string().min(1).max(255).describe("Filename ending in .csv or .txt."),
      mimetype: z.enum(["text/csv", "text/plain"]).optional().describe("Default text/csv."),
    },
    async ({ ad_account_id, file_base64, filename, mimetype }) => {
      if (!filename.endsWith(".csv") && !filename.endsWith(".txt")) throw new Error("filename must end with .csv or .txt");
      const bytes = Buffer.from(file_base64, "base64");
      if (bytes.length === 0) throw new Error("file_base64 decoded to 0 bytes.");
      if (bytes.length > 500 * 1024 * 1024) throw new Error("File exceeds 500MB limit.");
      const fd = new FormData();
      fd.append("file", new Blob([bytes], { type: mimetype || "text/csv" }), filename);
      fd.append("purpose", "custom_audience");
      return out(await adsRequest({ method: "POST", path: "/uploads", formData: fd, adAccountId: ad_account_id }));
    }
  );
}
