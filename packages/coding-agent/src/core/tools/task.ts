import { Text } from "@earendil-works/kin-tui";
import { Type } from "typebox";
import { keyText } from "../../modes/interactive/components/keybinding-hints.ts";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition } from "../extensions/index.ts";
import {
	formatSubagentReports,
	normalizeMode,
	type SubagentResult,
	type SubagentSpec,
	type SubagentState,
	type SubagentStatus,
} from "../subagent.ts";

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

/** Render-only state for the live fan-out card. Carried in the tool result's `details`. */
interface TaskToolDetails {
	statuses: SubagentStatus[];
	startedAt: number;
	endedAt?: number;
}

/** Hooks the session factory uses to report per-subagent progress as it runs them. */
export interface RunTasksHooks {
	signal?: AbortSignal;
	onProgress?: (index: number, state: SubagentState) => void;
}

/** Callback that runs the given subagent specs and resolves with their reports. Injected by the session factory. */
export type RunTasks = (specs: SubagentSpec[], hooks?: RunTasksHooks) => Promise<SubagentResult[]>;

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DESC_MAX = 48;

function spinnerFrame(): string {
	return SPINNER[Math.floor(Date.now() / 80) % SPINNER.length];
}

function formatElapsed(ms: number): string {
	return ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`;
}

function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Draw the boxed fan-out card. Built as a string so the title-in-border and footer-in-border
 * look is exact. Widths are computed on plain (uncolored) text, then color is layered on, so the
 * border stays aligned regardless of theme colors.
 */
function renderCard(details: TaskToolDetails, opts: { partial: boolean }, theme: Theme): string {
	const { statuses, startedAt, endedAt } = details;
	const done = statuses.filter((s) => s.state === "done").length;
	const failed = statuses.filter((s) => s.state === "failed").length;

	const title = opts.partial
		? `task · ${statuses.length} subagent${statuses.length === 1 ? "" : "s"} in parallel`
		: `task · ${done} done${failed > 0 ? ` · ${failed} failed` : ""} · ${formatElapsed((endedAt ?? Date.now()) - startedAt)}`;

	// Plain row bodies (icon is always 1 wide), used for width math.
	const rows = statuses.map((s) => {
		const mode = normalizeMode(s.mode).padEnd(7);
		return { plain: `${mode} ${clip(s.description, DESC_MAX)}`, state: s.state };
	});

	// Resolve the real, user-configurable expand key (ctrl+o by default) rather than hardcoding one.
	const expandKey = !opts.partial && statuses.length > 0 ? keyText("app.tools.expand") : "";
	const footerPlain = expandKey ? `${expandKey} expand for reports` : "";
	const inner = Math.max(title.length, footerPlain.length, ...rows.map((r) => r.plain.length + 2));

	const dim = (t: string) => theme.fg("muted", t);
	const top = dim(`╭ `) + theme.fg("accent", title) + dim(` ${"─".repeat(inner - title.length)}╮`);
	const bottom = footerPlain
		? dim(`╰ `) +
			theme.fg("dim", expandKey) +
			theme.fg("muted", ` expand for reports ${"─".repeat(inner - footerPlain.length)}╯`)
		: dim(`╰${"─".repeat(inner + 2)}╯`);

	const body = rows.map(({ plain, state }) => {
		const icon =
			state === "running"
				? theme.fg("accent", spinnerFrame())
				: state === "done"
					? theme.fg("success", "✓")
					: theme.fg("error", "✗");
		const colored = state === "failed" ? theme.fg("error", plain) : state === "done" ? dim(plain) : plain;
		const pad = " ".repeat(inner - (plain.length + 2));
		return `${dim("│")} ${icon} ${colored}${pad} ${dim("│")}`;
	});

	return [top, ...body, bottom].join("\n");
}

/**
 * The `task` tool: delegate scoped units of work to subagents. Independent units passed in
 * one call run in parallel. Each subagent works in its own context and returns only a report,
 * keeping the orchestrator's context clean for planning and integration.
 */
export function createTaskToolDefinition(deps: {
	runTasks: RunTasks;
}): ToolDefinition<typeof taskSchema, TaskToolDetails | undefined> {
	return {
		name: "task",
		label: "task",
		description:
			"Delegate one or more scoped units of work to subagents. Each subagent runs autonomously in its own fresh context (full tools by default, or read-only with mode 'explore') and returns a concise report — its intermediate steps never enter your context. Pass multiple INDEPENDENT units in one call to run them in parallel. Use this for fan-out exploration and for self-contained chunks of a larger plan; keep integration, final verification, and commits yourself.",
		promptSnippet: "Delegate scoped work to subagents (parallel when independent)",
		parameters: taskSchema,
		async execute(_toolCallId, args: { tasks: SubagentSpec[] }, signal?, onUpdate?) {
			const specs = args.tasks ?? [];
			if (specs.length === 0) {
				return { content: [{ type: "text" as const, text: "No tasks provided." }], details: undefined };
			}

			const startedAt = Date.now();
			const statuses: SubagentStatus[] = specs.map((s) => ({
				description: s.description,
				mode: normalizeMode(s.mode),
				state: "running",
			}));
			const snapshot = (endedAt?: number): TaskToolDetails => ({
				statuses: statuses.map((s) => ({ ...s })),
				startedAt,
				endedAt,
			});

			// Tick so the spinner animates between status changes; the bash tool drives its timer the same way.
			let tick: ReturnType<typeof setInterval> | undefined;
			if (onUpdate) {
				onUpdate({ content: [], details: snapshot() });
				tick = setInterval(() => onUpdate({ content: [], details: snapshot() }), 100);
			}

			try {
				const results = await deps.runTasks(specs, {
					signal,
					onProgress: (index, state) => {
						if (statuses[index]) statuses[index].state = state;
					},
				});
				return {
					content: [{ type: "text" as const, text: formatSubagentReports(results) }],
					details: snapshot(Date.now()),
				};
			} finally {
				if (tick) clearInterval(tick);
			}
		},
		renderCall(args, theme) {
			const tasks = (args as { tasks?: Array<{ description?: string }> } | undefined)?.tasks ?? [];
			const n = tasks.length;
			const label = n > 0 ? `task · delegating ${n} subagent${n === 1 ? "" : "s"}` : "task";
			return new Text(theme.fg("accent", label), 0, 0);
		},
		renderResult(result, options, theme, context) {
			const details = result.details as TaskToolDetails | undefined;
			const component = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			if (!details || details.statuses.length === 0) {
				const fallback = result.content?.find((c) => c.type === "text") as { text?: string } | undefined;
				component.setText(fallback?.text ?? "");
				return component;
			}
			let text = renderCard(details, { partial: options.isPartial }, theme);
			if (options.expanded && !options.isPartial) {
				const reports = result.content?.find((c) => c.type === "text") as { text?: string } | undefined;
				if (reports?.text) text += `\n\n${reports.text}`;
			}
			component.setText(text);
			return component;
		},
	};
}
