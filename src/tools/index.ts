import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAdAccountTools } from "./ad-account.js";
import { registerCampaignTools } from "./campaigns.js";
import { registerAdGroupTools } from "./ad-groups.js";
import { registerAdTools } from "./ads.js";
import { registerInsightTools } from "./insights.js";
import { registerFileTools } from "./files.js";
import { registerAudienceTools } from "./audiences.js";
import { registerBusinessAgentTools } from "./business-agents.js";
import { registerLeadFormTools } from "./lead-forms.js";
import { registerLeadSyncTools } from "./lead-sync.js";
import { registerConversionTools } from "./conversions.js";
import { registerProductFeedTools } from "./product-feeds.js";
import { registerGeoPartnerTools } from "./geo-partner.js";
import { registerWorkflowTools } from "./workflows.js";
import { registerAuditLogTools } from "./audit-logs.js";
import { registerSandboxTools } from "./sandbox.js";
import { registerBulkTools } from "./bulk.js";

export function registerAllTools(server: McpServer): void {
  registerAdAccountTools(server);
  registerCampaignTools(server);
  registerAdGroupTools(server);
  registerAdTools(server);
  registerInsightTools(server);
  registerFileTools(server);
  registerAudienceTools(server);
  registerBusinessAgentTools(server);
  registerLeadFormTools(server);
  registerLeadSyncTools(server);
  registerConversionTools(server);
  registerProductFeedTools(server);
  registerGeoPartnerTools(server);
  registerWorkflowTools(server);
  registerAuditLogTools(server);
  registerSandboxTools(server);
  registerBulkTools(server);
}
