#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.js";

const server = new McpServer(
  {
    name: "chatgpt-openai-ads-mcp",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
    instructions: `ChatGPT Advertiser API MCP — manage campaigns, ad groups, ads, assets, audiences, conversions, and insights.
Auth: set OPENAI_ADS_API_KEY (alias CHATGPT_ADS_API_KEY) in your MCP env. Optional OPENAI_AD_ACCOUNT_ID for multi-account.
Docs: https://developers.openai.com/ads/api-overview — Use get_ad_account first to verify key, then chain create_campaign -> create_ad_group -> create_ad (or create_campaign_hierarchy). Check review_status via get_ad; fetch insights via get_*_insights.`,
  }
);

registerAllTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only — stdout is MCP protocol
  console.error("chatgpt-openai-ads-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting chatgpt-openai-ads-mcp:", err);
  process.exit(1);
});
