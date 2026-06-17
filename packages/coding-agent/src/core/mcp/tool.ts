import type { ImageContent, TextContent } from "@landongarrison/kin-ai";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ToolDefinition } from "../extensions/types.ts";

export interface McpToolDetails {
	serverName: string;
	toolName: string;
}

/**
 * Build the Kin tool name for an MCP tool.
 * Names are namespaced as `mcp/<server>/<tool>` to avoid collisions with
 * built-ins and extension tools.
 */
export function getMcpToolName(serverName: string, toolName: string): string {
	return `mcp/${serverName}/${toolName}`;
}

/**
 * Convert an MCP tool definition into a Kin ToolDefinition that delegates
 * execution to the provided MCP client.
 *
 * The MCP input schema is a JSON Schema object. Kin's validation layer already
 * handles plain JSON Schema objects that lack TypeBox metadata, so we pass it
 * through as-is.
 */
export function createMcpToolDefinition(
	serverName: string,
	toolName: string,
	description: string | undefined,
	inputSchema: Record<string, unknown>,
	client: Client,
): ToolDefinition<any, McpToolDetails> {
	const fullName = getMcpToolName(serverName, toolName);
	return {
		name: fullName,
		label: toolName,
		description: description?.trim() || `MCP tool ${toolName} from server ${serverName}`,
		promptSnippet: `${toolName} (MCP: ${serverName})`,
		// MCP schemas are JSON Schema. Kin's validator supports raw JSON Schema
		// objects when TypeBox metadata is absent, which matches our runtime
		// needs while avoiding a full JSON Schema -> TypeBox conversion.
		parameters: inputSchema as any,
		async execute(_toolCallId, params, signal) {
			const result = await client.callTool(
				{ name: toolName, arguments: params as Record<string, unknown> | undefined },
				undefined,
				{ signal },
			);

			const details: McpToolDetails = { serverName, toolName };

			if ((result as { toolResult?: unknown }).toolResult !== undefined) {
				// Compatibility format: wrap the legacy toolResult as text.
				const text = JSON.stringify((result as { toolResult: unknown }).toolResult);
				return {
					content: [{ type: "text", text }],
					details,
				};
			}

			const content: (TextContent | ImageContent)[] = [];
			const resultContent = (result as { content?: unknown[] }).content ?? [];
			for (const item of resultContent) {
				if (!item || typeof item !== "object") continue;
				const typed = item as { type: string };
				if (typed.type === "text") {
					content.push({ type: "text", text: (item as { text: string }).text ?? "" });
				} else if (typed.type === "image") {
					content.push({
						type: "image",
						data: (item as { data: string }).data ?? "",
						mimeType: (item as { mimeType: string }).mimeType ?? "",
					});
				} else if (typed.type === "audio") {
					content.push({
						type: "text",
						text: `[audio content: ${(item as { mimeType: string }).mimeType ?? "audio/*"}, ${(item as { data: string }).data?.length ?? 0} bytes]`,
					});
				} else if (typed.type === "resource") {
					content.push({
						type: "text",
						text: JSON.stringify((item as { resource: unknown }).resource),
					});
				} else {
					content.push({ type: "text", text: JSON.stringify(item) });
				}
			}

			if ((result as { isError?: boolean }).isError) {
				content.unshift({
					type: "text",
					text: `[MCP tool ${toolName} reported an error]`,
				});
			}

			return {
				content,
				details,
			};
		},
	};
}
