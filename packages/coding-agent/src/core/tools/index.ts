/**
 * Built-in coding tool exports.
 *
 * Each tool exposes two layers:
 * - `createXToolDefinition()` returns Pi's richer ToolDefinition used by AgentSession,
 *   extensions, prompt snippets, source metadata, and custom rendering.
 * - `createXTool()` returns the lower-level AgentTool consumed directly by agent-core.
 *
 * Most app/runtime code should use ToolDefinitions. The AgentTool factories are kept
 * for SDK users and lightweight runtimes that want only executable tools.
 */
export {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	createBashTool,
	createBashToolDefinition,
	createLocalBashOperations,
} from "./bash.ts";
export {
	createDefinitionTool,
	createDefinitionToolDefinition,
	type DefinitionToolDetails,
	type DefinitionToolInput,
} from "./definition.ts";
export {
	createEditTool,
	createEditToolDefinition,
	type EditOperations,
	type EditToolDetails,
	type EditToolInput,
	type EditToolOptions,
} from "./edit.ts";
export { withFileMutationQueue } from "./file-mutation-queue.ts";
export {
	createReadTool,
	createReadToolDefinition,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
} from "./read.ts";
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
} from "./truncate.ts";
export {
	createWriteTool,
	createWriteToolDefinition,
	type WriteOperations,
	type WriteToolInput,
	type WriteToolOptions,
} from "./write.ts";

import type { AgentTool } from "@landongarrison/kin-agent-core";
import type { ToolDefinition } from "../extensions/types.ts";
import { type BashToolOptions, createBashTool, createBashToolDefinition } from "./bash.ts";
import { createDefinitionTool, createDefinitionToolDefinition } from "./definition.ts";
import { createEditTool, createEditToolDefinition, type EditToolOptions } from "./edit.ts";
import { createReadTool, createReadToolDefinition, type ReadToolOptions } from "./read.ts";
import { createWriteTool, createWriteToolDefinition, type WriteToolOptions } from "./write.ts";

/** Low-level executable tool shape used by agent-core. */
export type Tool = AgentTool<any>;
/** Rich tool shape used by coding-agent before wrapping into an AgentTool. */
export type ToolDef = ToolDefinition<any, any>;
/** Names of the built-in tools shipped with coding-agent. */
export type ToolName = "read" | "bash" | "edit" | "write" | "definition";
/** Set form for validation and allowlist checks. */
export const allToolNames: Set<ToolName> = new Set(["read", "bash", "edit", "write", "definition"]);

/** Per-tool option bag passed through to built-in tool factories. */
export interface ToolsOptions {
	read?: ReadToolOptions;
	bash?: BashToolOptions;
	write?: WriteToolOptions;
	edit?: EditToolOptions;
}

/** Create one rich ToolDefinition for the requested built-in tool. */
export function createToolDefinition(toolName: ToolName, cwd: string, options?: ToolsOptions): ToolDef {
	switch (toolName) {
		case "read":
			return createReadToolDefinition(cwd, options?.read);
		case "bash":
			return createBashToolDefinition(cwd, options?.bash);
		case "edit":
			return createEditToolDefinition(cwd, options?.edit);
		case "write":
			return createWriteToolDefinition(cwd, options?.write);
		case "definition":
			return createDefinitionToolDefinition(cwd);
		default:
			throw new Error(`Unknown tool name: ${toolName}`);
	}
}

/** Create one low-level AgentTool for runtimes that bypass ToolDefinition metadata. */
export function createTool(toolName: ToolName, cwd: string, options?: ToolsOptions): Tool {
	switch (toolName) {
		case "read":
			return createReadTool(cwd, options?.read);
		case "bash":
			return createBashTool(cwd, options?.bash);
		case "edit":
			return createEditTool(cwd, options?.edit);
		case "write":
			return createWriteTool(cwd, options?.write);
		case "definition":
			return createDefinitionTool(cwd);
		default:
			throw new Error(`Unknown tool name: ${toolName}`);
	}
}

/** Default mutating coding tool set: read, bash, edit, write, definition. */
export function createCodingToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return [
		createReadToolDefinition(cwd, options?.read),
		createBashToolDefinition(cwd, options?.bash),
		createEditToolDefinition(cwd, options?.edit),
		createWriteToolDefinition(cwd, options?.write),
		createDefinitionToolDefinition(cwd),
	];
}

/** Read-only exploration tool set: read and definition. */
export function createReadOnlyToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return [createReadToolDefinition(cwd, options?.read), createDefinitionToolDefinition(cwd)];
}

/** All built-in ToolDefinitions keyed by stable tool name. */
export function createAllToolDefinitions(cwd: string, options?: ToolsOptions): Record<ToolName, ToolDef> {
	return {
		read: createReadToolDefinition(cwd, options?.read),
		bash: createBashToolDefinition(cwd, options?.bash),
		edit: createEditToolDefinition(cwd, options?.edit),
		write: createWriteToolDefinition(cwd, options?.write),
		definition: createDefinitionToolDefinition(cwd),
	};
}

/** Low-level AgentTool variant of the default mutating coding tool set. */
export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createReadTool(cwd, options?.read),
		createBashTool(cwd, options?.bash),
		createEditTool(cwd, options?.edit),
		createWriteTool(cwd, options?.write),
		createDefinitionTool(cwd),
	];
}

/** Low-level AgentTool variant of the read-only exploration tool set. */
export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [createReadTool(cwd, options?.read), createDefinitionTool(cwd)];
}

/** All built-in low-level AgentTools keyed by stable tool name. */
export function createAllTools(cwd: string, options?: ToolsOptions): Record<ToolName, Tool> {
	return {
		read: createReadTool(cwd, options?.read),
		bash: createBashTool(cwd, options?.bash),
		edit: createEditTool(cwd, options?.edit),
		write: createWriteTool(cwd, options?.write),
		definition: createDefinitionTool(cwd),
	};
}
