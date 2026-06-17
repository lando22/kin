import { describe, expect, it, vi } from "vitest";
import { resolveMcpTransport } from "./manager.ts";
import { createMcpToolDefinition, getMcpToolName } from "./tool.ts";

const mockClient = {
	callTool: vi.fn(),
} as unknown as import("@modelcontextprotocol/sdk/client/index.js").Client;

describe("resolveMcpTransport", () => {
	it("returns explicit transport when provided", () => {
		expect(resolveMcpTransport({ transport: "sse" })).toBe("sse");
		expect(resolveMcpTransport({ transport: "stdio" })).toBe("stdio");
		expect(resolveMcpTransport({ transport: "streamableHttp" })).toBe("streamableHttp");
	});

	it("infers stdio from command", () => {
		expect(resolveMcpTransport({ command: "npx" })).toBe("stdio");
	});

	it("infers streamableHttp from url", () => {
		expect(resolveMcpTransport({ url: "http://localhost:3000" })).toBe("streamableHttp");
	});

	it("defaults to stdio when no hints are given", () => {
		expect(resolveMcpTransport({})).toBe("stdio");
	});
});

describe("createMcpToolDefinition", () => {
	it("namespaces the tool as mcp/<server>/<tool>", () => {
		const definition = createMcpToolDefinition(
			"fetch",
			"fetch_url",
			"Fetch a URL",
			{ type: "object", properties: {} },
			mockClient,
		);
		expect(definition.name).toBe("mcp/fetch/fetch_url");
		expect(definition.label).toBe("fetch_url");
		expect(definition.description).toBe("Fetch a URL");
	});

	it("falls back to a generated description", () => {
		const definition = createMcpToolDefinition("fetch", "fetch_url", undefined, { type: "object" }, mockClient);
		expect(definition.description).toBe("MCP tool fetch_url from server fetch");
	});

	it("passes the JSON Schema through as parameters", () => {
		const schema = {
			type: "object" as const,
			properties: { url: { type: "string" as const } },
			required: ["url"],
		};
		const definition = createMcpToolDefinition("fetch", "fetch_url", "Fetch", schema, mockClient);
		expect(definition.parameters).toEqual(schema);
	});
});

describe("getMcpToolName", () => {
	it("joins server and tool names with slashes", () => {
		expect(getMcpToolName("github", "search_issues")).toBe("mcp/github/search_issues");
	});
});
