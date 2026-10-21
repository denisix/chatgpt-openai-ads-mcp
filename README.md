# chatgpt-openai-ads-mcp

[![npm version](https://badge.fury.io/js/%40denisixnpm%2Fchatgpt-openai-ads-mcp.svg)](https://www.npmjs.com/package/@denisixnpm/chatgpt-openai-ads-mcp) [![npm downloads](https://img.shields.io/npm/dm/%40denisixnpm%2Fchatgpt-openai-ads-mcp.svg)](https://www.npmjs.com/package/@denisixnpm/chatgpt-openai-ads-mcp) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

MCP server for the **ChatGPT Advertiser API** — manage campaigns, ad groups, ads, assets, audiences, conversions and insights from any MCP-capable agent (Claude Desktop, Cursor, VS Code, Windsurf, …). One `npx` command, no install; your API key stays on your machine.

- **Create campaigns → ad groups → ads** in one chain (or one call via `create_campaign_hierarchy`)
- **Upload creatives**, manage **audiences**, configure **conversions & pixels**, read **insights**
- **108 tools**; every `create_*` returns the ID the next call needs

## 1. Get an API key

Get a key at [ads.openai.com](https://ads.openai.com) → **Settings → API Keys**. It goes into your MCP config, never into chat.

## 2. Add to your agent (Node.js ≥ 18)

All configs use env var `OPENAI_ADS_API_KEY` (alias `CHATGPT_ADS_API_KEY`). Multi-account: set `OPENAI_AD_ACCOUNT_ID` or pass `ad_account_id` per call.

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "chatgpt-openai-ads": {
      "command": "npx",
      "args": ["-y", "@denisixnpm/chatgpt-openai-ads-mcp@latest"],
      "env": { "OPENAI_ADS_API_KEY": "sk-ads-...paste-your-key..." }
    }
  }
}
```

### Cursor (`~/.cursor/mcp.json` or `.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "chatgpt-openai-ads": {
      "command": "npx",
      "args": ["-y", "@denisixnpm/chatgpt-openai-ads-mcp@latest"],
      "env": { "OPENAI_ADS_API_KEY": "sk-ads-..." }
    }
  }
}
```

### VS Code (`.vscode/mcp.json` — note `servers` + `type: "stdio"`)

```json
{
  "servers": {
    "chatgpt-openai-ads": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@denisixnpm/chatgpt-openai-ads-mcp@latest"],
      "env": { "OPENAI_ADS_API_KEY": "sk-ads-..." }
    }
  }
}
```

### Claude Code / Windsurf / Cline / any `mcp.json` client

```bash
claude mcp add --env OPENAI_ADS_API_KEY=sk-ads-... chatgpt-openai-ads -- npx -y @denisixnpm/chatgpt-openai-ads-mcp@latest
```

> `@latest` auto-updates on restart; pin with `@0.2.0` for reproducibility. stdio only — wrap with `mcp-remote` if you need HTTP.

## 3. Verify

Ask your agent: *"Verify my ChatGPT Ads connection with `get_ad_account`, then list my campaigns."*

- `get_ad_account` → `{ id: "adacct_...", name, status, timezone, currency_code }`
- **401** = wrong/expired key (regenerate in Ads Manager). **403** = account not enabled for that resource.

## 4. All tools (108)

Every tool accepts optional `ad_account_id` (overrides the env default). IDs chain forward: `campaign_id → ad_group_id → ad_id`, `file_id → creative`, `custom_audience_id → targeting`.

| Group | Count | Tools |
|---|---|---|
| Ad Account | 15 | `get_ad_account`, `list_ad_accounts`, `update_ad_account_brand`, `update_ad_account_negative_keywords`, `activate_ad_account`, `pause_ad_account`, `get_ad_account_spend_limit_windows`, `create_ad_account_spend_limit_window`, `update_ad_account_spend_limit_window`, `delete_ad_account_spend_limit_window`, `set_ad_account_daily_spend_limit`, `delete_ad_account_daily_spend_limit`, `create_ad_account_creation_session`, `get_oauth_me`, `create_api_key` |
| Campaigns | 7 | `list_campaigns`, `get_campaign`, `create_campaign`, `update_campaign`, `activate_campaign`, `pause_campaign`, `archive_campaign` |
| Ad Groups | 7 | `list_ad_groups`, `get_ad_group`, `create_ad_group`, `update_ad_group`, `activate_ad_group`, `pause_ad_group`, `archive_ad_group` |
| Ads | 9 | `list_ads`, `get_ad`, `create_ad`, `update_ad`, `create_ad_preview`, `activate_ad`, `pause_ad`, `archive_ad`, `get_ad_landing_page_crawl` |
| Insights | 7 | `get_ad_account_insights`, `get_campaign_insights`, `get_ad_group_insights`, `get_ad_insights`, `get_conversion_insights`, `get_hotel_insights`, `get_hotel_insights_timeseries` |
| Files | 2 | `upload_image` (https URL or base64), `upload_audience_file` (CSV/TXT base64 → file_id) |
| Audiences | 12 | `list_custom_audiences`, `create_custom_audience`, `get_custom_audience`, `archive_custom_audience`, `add_audience_members`, `remove_audience_members`, `replace_audience_members`, `merge_custom_audiences`, `get_audience_operation`, `list_audience_operations`, `cancel_audience_operation`, `resume_audience_operation` |
| Business Agents | 7 | `list_business_agent_tools`, `list_business_agents`, `create_business_agent`, `get_business_agent`, `update_business_agent`, `preview_business_agent`, `publish_business_agent` |
| Lead Forms | 7 | `list_lead_forms`, `create_lead_form`, `get_lead_form`, `update_lead_form`, `publish_lead_form`, `archive_lead_form`, `create_test_lead_submission` |
| Lead Sync | 4 | `create_lead_sync_subscription`, `list_lead_sync_subscriptions`, `get_lead_sync_subscription`, `delete_lead_sync_subscription` |
| Conversions | 6 | `create_conversion_pixel`, `list_conversion_pixels`, `create_conversion_api_key`, `create_conversion_event_setting`, `list_conversion_event_settings`, `list_conversion_events` |
| Product Feeds | 12 | `create_product_feed`, `list_product_feeds`, `archive_product_feed`, `list_product_feed_uploads`, `query_product_feed_products`, `patch_product_feed_products`, `get_product_feed_sftp_access`, `create_product_feed_sftp_access`, `activate_product_feed_sftp_access`, `pause_product_feed_sftp_access`, `get_product_feed_settings`, `update_product_feed_settings` |
| Geo & Partner | 3 | `search_geo_lookup`, `create_partner_data_upload`, `get_partner_data_upload` |
| Workflows | 2 | `create_campaign_hierarchy` (campaign → ad group → ad in one call), `poll_audience_operation` |
| Audit Logs | 1 | `list_audit_logs` |
| Sandbox | 4 | `create_ad_eligibility_job`, `get_ad_eligibility_job`, `get_ad_eligibility_job_results`, `cancel_ad_eligibility_job` |
| Bulk (preview) | 3 | `submit_bulk_mutation_job`, `get_bulk_mutation_job`, `list_bulk_mutation_job_operations` |

Notes: bulk jobs are a limited preview (404 = not enabled for the account). Server-side conversion event ingestion to `bzr.openai.com` is out of scope — use `create_conversion_api_key` and send events from your backend.

## 5. Chaining

1. **Discover** — `list_campaigns`, `list_ad_groups`, `list_ads`, `search_geo_lookup`, `list_custom_audiences`
2. **Create** — `create_campaign` → `create_ad_group` (needs `campaign_id` + `bidding_config`) → `create_ad` (needs `ad_group_id` + creative); or `create_campaign_hierarchy` for all three at once
3. **Monitor** — `get_ad` (`review_status`), `get_*_insights`, `poll_audience_operation`

Atomic `create_*` tools give per-resource control (different bidding configs, product sets, …); the hierarchy tool trades control for speed. On partial hierarchy failure, earlier objects remain — clean up with `archive_*`.

## 6. Environment

| Env var | Purpose | Default |
|---|---|---|
| `OPENAI_ADS_API_KEY` | Advertiser API key (alias `CHATGPT_ADS_API_KEY`, lower priority) | — (required) |
| `OPENAI_AD_ACCOUNT_ID` | Default ad account (alias `CHATGPT_AD_ACCOUNT_ID`); per-tool `ad_account_id` wins | — |
| `OPENAI_ADS_BASE_URL` | API base URL override (https on `*.openai.com` only; localhost allowed for tests) | `https://api.ads.openai.com/v1` |

## 7. Troubleshooting

- **401** → key missing/invalid/expired; regenerate at Ads Manager → Settings → API Keys, restart agent.
- **403** → account not enabled for the resource (conversions, brand updates need partner enablement).
- **429** → rate limited; honor `Retry-After` in the error text.
- **`review_status: pending`** after `create_ad` → normal; takes minutes. Monitor with `get_ad`.
- Still stuck → [open an issue](https://github.com/denisix/chatgpt-openai-ads-mcp/issues) with the tool name + error text (never the full key).

## 8. Security & privacy

- The key is sent only to `https://api.ads.openai.com` (enforced in code — requests to any other host are refused). No proxy, no telemetry.
- User-supplied URLs (creatives, feeds, webhooks) are SSRF-guarded: https-only, private/loopback/link-local/CGNAT hosts blocked (IPv4 + IPv6 incl. mapped forms).
- `npx -y` pulls the pre-built package from npm; `prepare`/`prepublishOnly` guarantee `dist/` freshness on publish.

## 9. Developing

```bash
git clone https://github.com/denisix/chatgpt-openai-ads-mcp
cd chatgpt-openai-ads-mcp
npm ci
npm run build     # tsc -> dist/
npm test          # vitest
npm run inspect   # MCP Inspector
```

Local mock end-to-end: `OPENAI_ADS_API_KEY=sk-ads-test OPENAI_ADS_BASE_URL=http://localhost:17892/v1 npx -y @denisixnpm/chatgpt-openai-ads-mcp`, then Inspector → initialize → tools/list → tools/call `get_ad_account`.

API docs: <https://developers.openai.com/ads/api-overview> + <https://developers.openai.com/ads/openapi.json>.

Publish: `npm publish` (scoped public access is preconfigured).

License: MIT.
