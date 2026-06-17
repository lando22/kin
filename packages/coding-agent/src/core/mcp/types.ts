/**
 * Settings types for MCP (Model Context Protocol) servers.
 *
 * Configured through Kin's settings.json under the `mcp` key:
 *
 * ```json
 * {
 *   "mcp": {
 *     "servers": {
 *       "fetch": {
 *         "command": "npx",
 *         "args": ["-y", "@modelcontextprotocol/server-fetch"]
 *       },
 *       "remote": {
 *         "transport": "streamableHttp",
 *         "url": "http://localhost:3000/mcp"
 *       }
 *     }
 *   }
 * }
 * ```
 */

export type McpTransportType = "stdio" | "sse" | "streamableHttp";

export interface McpServerConfig {
	/** Whether this server is enabled. Default: true */
	enabled?: boolean;
	/**
	 * Transport type. If omitted, it is inferred from the config:
	 * - "stdio" when `command` is provided
	 * - "streamableHttp" when only `url` is provided
	 */
	transport?: McpTransportType;
	/** For stdio transport: command to spawn */
	command?: string;
	/** For stdio transport: arguments passed to the command */
	args?: string[];
	/** For stdio transport: extra environment variables for the spawned process */
	env?: Record<string, string>;
	/** For SSE or streamable HTTP transport: server endpoint URL */
	url?: string;
	/** For SSE or streamable HTTP transport: extra headers */
	headers?: Record<string, string>;
}

export interface McpSettings {
	/** Per-server MCP configuration keyed by a short server name. */
	servers: Record<string, McpServerConfig>;
}
