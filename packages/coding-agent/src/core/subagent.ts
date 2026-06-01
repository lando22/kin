/**
 * Subagents — scoped, headless child sessions the orchestrator delegates work to.
 *
 * The point is a context firewall: a subagent does all its exploring/building in its
 * own throwaway context and returns only a final report. The orchestrator gets the
 * conclusion, not the dozens of tool calls it took to reach it, so the main thread
 * stays clean for planning and integration.
 *
 * This module is intentionally dependency-light (no session imports) so it can be
 * shared by the `task` tool and the spawn machinery without an import cycle. The actual
 * child-session creation lives in agent-session-services.ts, where the session factory is.
 */

/** explore = read-only investigation (no edits possible); work = make and verify changes. */
export type SubagentMode = "explore" | "work";

/** One unit of delegated work. `prompt` must be self-contained — the child sees none of this conversation. */
export interface SubagentSpec {
	description: string;
	prompt: string;
	mode?: SubagentMode;
}

/** What a finished subagent hands back to the orchestrator. */
export interface SubagentResult {
	description: string;
	report: string;
	ok: boolean;
}

/** Live lifecycle of one subagent, surfaced to the fan-out UI. */
export type SubagentState = "running" | "done" | "failed";

/** Per-subagent render state for the live fan-out card. */
export interface SubagentStatus {
	description: string;
	mode: SubagentMode;
	state: SubagentState;
}

/** Normalize a spec's optional mode to a concrete one (defaults to work). */
export function normalizeMode(mode: SubagentMode | undefined): SubagentMode {
	return mode === "explore" ? "explore" : "work";
}

/** Explore subagents get read-only tools, so they structurally cannot modify the repo. */
export const EXPLORE_TOOLS = ["read", "grep", "find", "ls", "definition"] as const;
/** Work subagents get the full mutating set so they can implement, run, and fix. */
export const WORK_TOOLS = ["bash", "read", "edit", "write", "definition"] as const;

/** Tool set for a given mode. Defaults to a working (mutating) subagent. */
export function subagentTools(mode: SubagentMode | undefined): string[] {
	return mode === "explore" ? [...EXPLORE_TOOLS] : [...WORK_TOOLS];
}

/**
 * The standing instructions wrapped around a subagent's task. The final-message-only
 * return is the load-bearing rule: everything the child does mid-run is discarded, so it
 * must finish with a tight, concrete report or its work is invisible to the orchestrator.
 */
export function buildSubagentPrompt(spec: SubagentSpec): string {
	const explore = spec.mode === "explore";
	const job = explore
		? "Investigate and gather exactly what's asked. You have read-only tools — do not attempt to change anything."
		: "Do the work end to end, then verify it: run whatever this project uses to check itself (typecheck, build, lint, tests) and fix anything you broke before reporting.";

	return `You are a subagent spawned by Kin to handle one scoped task autonomously. You do not see the main conversation — everything you need is below.

## Task: ${spec.description}

${spec.prompt}

## How to operate
- ${job}
- Do NOT commit or push. The orchestrator integrates your work and commits the whole.
- Stay in scope. Don't refactor or "improve" things outside the task.
- Your FINAL message is the ONLY thing returned to the orchestrator; every tool call and note in between is thrown away. So end with a tight report:
  - what you ${explore ? "found" : "changed"} (be specific),
  - the exact files you ${explore ? "looked at that matter" : "touched"},
  - ${explore ? "the direct answer to the task" : "how you verified it (command + result)"},
  - anything the orchestrator must know: surprises, follow-ups, unresolved questions.
  No preamble, no fluff — just the report.`;
}

/** Render subagent reports for the orchestrator's tool result. */
export function formatSubagentReports(results: SubagentResult[]): string {
	const parts = results.map((r) => `### ${r.description}${r.ok ? "" : " — FAILED"}\n${r.report.trim()}`);
	const failed = results.filter((r) => !r.ok).length;
	const header =
		results.length === 1
			? "Subagent report"
			: `${results.length} subagent reports${failed > 0 ? ` (${failed} failed)` : ""}`;
	return `## ${header}\n\n${parts.join("\n\n")}`;
}
