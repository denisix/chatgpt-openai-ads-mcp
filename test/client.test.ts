import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { adsRequest } from "../src/lib/ads-client.js";
import { validateExternalUrl } from "../src/lib/ssrf-guard.js";
import { getBaseUrl } from "../src/config.js";
import { registerAllTools } from "../src/tools/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("adsRequest", () => {
  it("sends array params as key[] and the bearer key", async () => {
    vi.stubEnv("OPENAI_ADS_API_KEY", "sk-test-12345678");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await adsRequest({ method: "GET", path: "/ad_account/insights", query: { fields: ["a", "b"], limit: "5", campaign_ids: ["c1"] } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("fields%5B%5D=a&fields%5B%5D=b");
    expect(url).toContain("campaign_ids=c1");
    const headers = Object.fromEntries(new Headers(init.headers));
    expect(headers.authorization).toBe("Bearer sk-test-12345678");
  });

  it("refuses to send the key to a non-OpenAI host", async () => {
    vi.stubEnv("OPENAI_ADS_API_KEY", "sk-test-12345678");
    vi.stubEnv("OPENAI_ADS_BASE_URL", "https://evil.example.com/v1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(adsRequest({ method: "GET", path: "/ad_account" })).rejects.toThrow(/Refusing/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an empty-string base URL as unset (default host)", () => {
    vi.stubEnv("OPENAI_ADS_BASE_URL", "");
    expect(getBaseUrl()).toBe("https://api.ads.openai.com/v1");
  });
});

describe("validateExternalUrl", () => {
  it("allows public https URLs", () => {
    expect(validateExternalUrl("https://example.com/img.png").hostname).toBe("example.com");
  });

  it.each([
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://10.1.2.3/",
    "https://172.31.255.1/",
    "https://192.168.1.1/",
    "https://169.254.169.254/latest/meta-data/",
    "https://100.64.0.1/", // CGNAT
    "https://0.0.0.0/",
    "https://[::1]/",
    "https://[fd12:3456::1]/",
    "https://[fc00::1]/",
    "https://[fe80::1]/",
    "https://[::ffff:127.0.0.1]/", // IPv4-mapped loopback (hex-normalized by URL)
    "https://[::ffff:10.0.0.1]/", // IPv4-mapped private
    "https://[64:ff9b::127.0.0.1]/", // NAT64-mapped loopback
    "http://example.com/img.png", // https required by default
    "file:///etc/passwd",
    "https://user:pass@example.com/",
  ])("blocks %s", (url) => {
    expect(() => validateExternalUrl(url)).toThrow();
  });

  it("blocks overlong and malformed URLs", () => {
    expect(() => validateExternalUrl(`https://example.com/${"a".repeat(2100)}`)).toThrow(/max length/);
    expect(() => validateExternalUrl("not a url")).toThrow(/not a valid URL/);
  });
});

describe("tool registry", () => {
  it("registers every tool once", () => {
    const names: string[] = [];
    const server = new McpServer({ name: "t", version: "0" });
    const orig = server.tool.bind(server);
    // Test seam: capture registrations through the public tool() API.
    const recorder = server as unknown as { tool: (...a: unknown[]) => unknown };
    recorder.tool = (...a: unknown[]) => {
      names.push(a[0] as string);
      return orig(...a as Parameters<typeof orig>);
    };
    registerAllTools(server);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBe(108);
    for (const n of ["list_audit_logs", "set_ad_account_daily_spend_limit", "submit_bulk_mutation_job", "get_hotel_insights", "create_ad_eligibility_job", "get_ad_landing_page_crawl", "update_product_feed_settings", "cancel_audience_operation"]) {
      expect(names).toContain(n);
    }
  });
});
