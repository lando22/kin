import { Type } from "typebox";
import type { ToolDefinition } from "../extensions/index.ts";
import { formatSubagentReports, type SubagentResult, type SubagentSpec } from "../subagent.ts";

const taskSchema = Type.Object({
	tasks: Type.Array(
		Type.Object({
			description: Type.String({ description: "Short label for this unit of work (3-6 words)." }),
			prompt: Type.String({
				description:
					"Complete, self-contained instructions for the subagent: what to do, where, and what 'done' means. The subagent does NOT see this conversation, so include every detail it needs.",
			}),
			mode: Type.Optional(
				Type.Union([Type.Literal("explore"), Type.Literal("work")], {
					description:
						"explore = read-only investigation (returns findings, cannot modify files); work = make and verify changes. Default: work.",
				}),
			),
		}),
		{
			description:
				"Units of work to run. Multiple units run in PARALLEL, so only batch units that are independent — never ones that edit the same files.",
			minItems: 1,
		},
	),
});

/** Callback that runs the given subagent specs and resolves with their reports. Injected by the session factory. */
export type RunTasks = (specs: SubagentSpec[], signal?: AbortSignal) => Promise<SubagentResult[]>;

/**
 * The `task` tool: delegate scoped units of work to subagents. Independent units passed in
 * one call run in parallel. Each subagent works in its own context and returns only a report,
 * keeping the orchestrator's context clean for planning and integration.
 */
export function createTaskToolDefinition(deps: { runTasks: RunTasks }): ToolDefinition<typeof taskSchema, undefined> {
	return {
		name: "task",
		label: "task",
		description:
			"Delegate one or more scoped units of work to subagents. Each subagent runs autonomously in its own fresh context (full tools by default, or read-only with mode 'explore') and returns a concise report — its intermediate steps never enter your context. Pass multiple INDEPENDENT units in one call to run them in parallel. Use this for fan-out exploration and for self-contained chunks of a larger plan; keep integration, final verification, and commits yourself.",
		promptSnippet: "Delegate scoped work to subagents (parallel when independent)",
		parameters: taskSchema,
		async execute(_toolCallId, args: { tasks: SubagentSpec[] }, signal?: AbortSignal) {
			const specs = args.tasks ?? [];
			if (specs.length === 0) {
				return {
					content: [{ type: "text" as const, text: "No tasks provided." }],
					details: undefined,
				};
			}
			const results = await deps.runTasks(specs, signal);
			return {
				content: [{ type: "text" as const, text: formatSubagentReports(results) }],
				details: undefined,
			};
		},
	};
}
