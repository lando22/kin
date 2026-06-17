import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ToolDefinition } from "../extensions/types.ts";
import { createMcpToolDefinition, type McpToolDetails } from "./tool.ts";
import type { McpServerConfig, McpSettings, McpTransportType } from "./types.ts";

interface ServerConnection {
	name: string;
	client: Client;
	transport: Transport;
}

export interface McpStartResult {
	serverCount: number;
	toolCount: number;
	errors: McpServerError[];
}

export interface McpServerError {
	serverName: string;
	message: string;
}

/**
 * Manages MCP client connections and exposes discovered tools as Kin
 * ToolDefinitions.
 */
export class McpManager {
	private _connections: ServerConnection[] = [];
	private _toolDefinitions: ToolDefinition<any, McpToolDetails>[] = [];
	private _settings: McpSettings | undefined;
	private _cwd: string;
	private _clientName: string;
	private _clientVersion: string;

	constructor(settings: McpSettings | undefined, cwd: string, clientName: string, clientVersion: string) {
		this._settings = settings;
		this._cwd = cwd;
		this._clientName = clientName;
		this._clientVersion = clientVersion;
	}

	get toolDefinitions(): ToolDefinition<any, McpToolDetails>[] {
		return this._toolDefinitions;
	}

	/**
	 * Connect to all enabled MCP servers and discover their tools.
	 * Errors for individual servers are collected and returned rather than
	 * failing the whole session startup.
	 */
	async start(signal?: AbortSignal): Promise<McpStartResult> {
		await this.close();
		this._toolDefinitions = [];
		this._connections = [];

		const servers = this._settings?.servers;
		if (!servers || Object.keys(servers).length === 0) {
			return { serverCount: 0, toolCount: 0, errors: [] };
		}

		const errors: McpServerError[] = [];

		for (const [serverName, config] of Object.entries(servers)) {
			if (config.enabled === false) continue;
			try {
				await this._connectServer(serverName, config, signal);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				errors.push({ serverName, message });
			}
		}

		return {
			serverCount: this._connections.length,
			toolCount: this._toolDefinitions.length,
			errors,
		};
	}

	/**
	 * Disconnect from all MCP servers and clear discovered tools.
	 */
	async close(): Promise<void> {
		for (const connection of this._connections) {
			try {
				await connection.transport.close();
			} catch {
				// Best-effort cleanup.
			}
		}
		this._connections = [];
		this._toolDefinitions = [];
	}

	private async _connectServer(serverName: string, config: McpServerConfig, signal?: AbortSignal): Promise<void> {
		const client = new Client({ name: this._clientName, version: this._clientVersion });
		const transportType = resolveMcpTransport(config);
		let transport: Transport;

		switch (transportType) {
			case "stdio": {
				if (!config.command) {
					throw new Error(`MCP server ${serverName} using stdio requires a command`);
				}
				const params: StdioServerParameters = {
					command: config.command,
					args: config.args,
					env: config.env,
					cwd: this._cwd,
					// Pipe stderr so it doesn't spam Kin's own stderr; we ignore it
					// but could expose it for debugging later.
					stderr: "pipe",
				};
				transport = new StdioClientTransport(params);
				break;
			}
			case "sse": {
				if (!config.url) {
					throw new Error(`MCP server ${serverName} using sse requires a url`);
				}
				transport = new SSEClientTransport(new URL(config.url), {
					requestInit: { headers: config.headers },
				});
				break;
			}
			case "streamableHttp": {
				if (!config.url) {
					throw new Error(`MCP server ${serverName} using streamableHttp requires a url`);
				}
				transport = new StreamableHTTPClientTransport(new URL(config.url), {
					requestInit: { headers: config.headers },
				});
				break;
			}
		}

		await client.connect(transport, { signal });
		const toolsResult = await client.listTools({}, { signal });
		for (const tool of toolsResult.tools) {
			this._toolDefinitions.push(
				createMcpToolDefinition(
					serverName,
					tool.name,
					tool.description,
					tool.inputSchema as Record<string, unknown>,
					client,
				),
			);
		}
		this._connections.push({ name: serverName, client, transport });
	}
}

export function resolveMcpTransport(config: McpServerConfig): McpTransportType {
	if (config.transport) return config.transport;
	if (config.command) return "stdio";
	if (config.url) return "streamableHttp";
	// Default to stdio as the safest guess; connection will fail with a clear
	// error if no command is provided.
	return "stdio";
}
