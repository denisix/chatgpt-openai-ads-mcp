import { z } from "zod";

// Empty string counts as unset (agents often pass "" for unused env vars).
const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().url().optional()
);

const EnvSchema = z.object({
  OPENAI_ADS_API_KEY: z.string().optional(),
  CHATGPT_ADS_API_KEY: z.string().optional(),
  OPENAI_AD_ACCOUNT_ID: z.string().optional(),
  CHATGPT_AD_ACCOUNT_ID: z.string().optional(),
  OPENAI_ADS_BASE_URL: optionalUrl,
});

export type Env = z.infer<typeof EnvSchema>;

function getEnv(): Env {
  return EnvSchema.parse(process.env);
}

export function getBaseUrl(): string {
  const url = getEnv().OPENAI_ADS_BASE_URL?.trim();
  return url ? url.replace(/\/$/, "") : "https://api.ads.openai.com/v1";
}

export function requireApiKey(): string {
  const env = getEnv();
  const key = env.OPENAI_ADS_API_KEY?.trim() || env.CHATGPT_ADS_API_KEY?.trim() || "";
  if (!key) {
    throw new Error(
      "Missing Advertiser API key. Set OPENAI_ADS_API_KEY (or alias CHATGPT_ADS_API_KEY) in your MCP config env. Get a key at https://ads.openai.com > Settings > API Keys. Example for Claude Desktop: {\"mcpServers\":{\"chatgpt-openai-ads\":{\"command\":\"npx\",\"args\":[\"-y\",\"@denisixnpm/chatgpt-openai-ads-mcp\"],\"env\":{\"OPENAI_ADS_API_KEY\":\"sk-ads-...\"}}}}"
    );
  }
  if (key.length < 8) {
    throw new Error("OPENAI_ADS_API_KEY looks too short — check you pasted the full key.");
  }
  return key;
}

/** Explicit arg wins, then env (OPENAI_ or CHATGPT_ alias), then undefined. */
export function resolveAdAccountId(explicit?: string): string | undefined {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  const env = getEnv();
  return env.OPENAI_AD_ACCOUNT_ID?.trim() || env.CHATGPT_AD_ACCOUNT_ID?.trim() || undefined;
}
