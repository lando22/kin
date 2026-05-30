import { describe, expect, test } from "vitest";
import {
	buildSubagentPrompt,
	EXPLORE_TOOLS,
	formatSubagentReports,
	type SubagentResult,
	type SubagentSpec,
	type SubagentStatus,
	subagentTools,
	WORK_TOOLS,
} from "../src/core/subagent.js";
import { createTaskToolDefinition, type RunTasks } from "../src/core/tools/task.js";

/** The execute type requires the full 5-arg runtime signature; in tests we only need the first two. */
type ExecuteCall = (id: string, args: { tasks: SubagentSpec[] }) => Promise<{ content: Array<{ text: string }> }>;
const callExecute = (tool: ReturnType<typeof createTaskToolDefinition>, tasks: SubagentSpec[]) =>
	(tool.execute as unknown as ExecuteCall)("call-1", { tasks });

describe("subagentTools", () => {
	test("explore mode gets read-only tools, no edit/write/bash", () => {
		expect(subagentTools("explore")).toEqual([...EXPLORE_TOOLS]);
		expect(subagentTools("explore")).not.toContain("edit");
		expect(subagentTools("explore")).not.toContain("write");
		expect(subagentTools("explore")).not.toContain("bash");
	});

	test("work mode and the default get the full mutating set", () => {
		expect(subagentTools("work")).toEqual([...WORK_TOOLS]);
		expect(subagentTools(undefined)).toEqual([...WORK_TOOLS]);
	});
});

describe("buildSubagentPrompt", () => {
	test("work prompt demands verification and forbids committing", () => {
		const prompt = buildSubagentPrompt({ description: "Build X", prompt: "Implement the X module." });
		expect(prompt).toContain("Build X");
		expect(prompt).toContain("Implement the X module.");
		expect(prompt).toContain("Do NOT commit or push");
		expect(prompt).toContain("verify");
		// The final-message-only contract must be stated, or the work is invisible.
		expect(prompt).toContain("FINAL message");
	});

	test("explore prompt states it is read-only and must not modify", () => {
		const prompt = buildSubagentPrompt({
			description: "Find auth",
			prompt: "Where is auth validated?",
			mode: "explore",
		});
		expect(prompt).toContain("read-only");
		expect(prompt).toContain("do not attempt to change");
	});
});

describe("formatSubagentReports", () => {
	test("single report uses a singular header", () => {
		const out = formatSubagentReports([{ description: "Find auth", report: "It's in auth.ts.", ok: true }]);
		expect(out).toContain("## Subagent report");
		expect(out).toContain("### Find auth");
		expect(out).toContain("It's in auth.ts.");
	});

	test("multiple reports count them and flag failures", () => {
		const results: SubagentResult[] = [
			{ description: "A", report: "did a", ok: true },
			{ description: "B", report: "boom", ok: false },
		];
		const out = formatSubagentReports(results);
		expect(out).toContain("## 2 subagent reports (1 failed)");
		expect(out).toContain("### B — FAILED");
	});
});

describe("createTaskToolDefinition", () => {
	test("exposes the task tool with a delegation-oriented description", () => {
		const tool = createTaskToolDefinition({ runTasks: async () => [] });
		expect(tool.name).toBe("task");
		expect(tool.description?.toLowerCase()).toContain("subagent");
		expect(tool.promptSnippet).toBeTruthy();
	});

	test("dispatches specs to runTasks and formats the reports", async () => {
		let received: unknown;
		const runTasks: RunTasks = async (specs) => {
			received = specs;
			return specs.map((s) => ({ description: s.description, report: `ran ${s.description}`, ok: true }));
		};
		const tool = createTaskToolDefinition({ runTasks });
		const specs: SubagentSpec[] = [
			{ description: "unit one", prompt: "do one" },
			{ description: "unit two", prompt: "do two" },
		];

		const result = await callExecute(tool, specs);

		expect(received).toEqual(specs);
		const text = (result?.content?.[0] as { text: string }).text;
		expect(text).toContain("## 2 subagent reports");
		expect(text).toContain("ran unit one");
		expect(text).toContain("ran unit two");
	});

	test("renders a live card from status details, and falls back to report text without details", () => {
		const tool = createTaskToolDefinition({ runTasks: async () => [] });
		// Stub theme: identity color fns so we assert on layout, not ANSI codes.
		const theme = { fg: (_key: string, text: string) => text } as unknown as Parameters<
			NonNullable<typeof tool.renderResult>
		>[2];
		const render = (comp: { render(width: number): string[] }) => comp.render(80).join("\n");

		const statuses: SubagentStatus[] = [
			{ description: "Map the auth flow", mode: "explore", state: "running" },
			{ description: "Add the migration", mode: "work", state: "done" },
		];
		const live = tool.renderResult?.(
			{ content: [{ type: "text", text: "reports" }], details: { statuses, startedAt: Date.now() } },
			{ isPartial: true, expanded: false },
			theme,
			{} as never,
		);
		const liveText = render(live as { render(width: number): string[] });
		expect(liveText).toContain("task · 2 subagents in parallel");
		expect(liveText).toContain("Map the auth flow");
		expect(liveText).toContain("✓"); // the done unit
		expect(liveText).toContain("│"); // box border

		const fallback = tool.renderResult?.(
			{ content: [{ type: "text", text: "just the report" }], details: undefined },
			{ isPartial: false, expanded: false },
			theme,
			{} as never,
		);
		expect(render(fallback as { render(width: number): string[] })).toContain("just the report");
	});

	test("short-circuits on empty task list without invoking runTasks", async () => {
		let called = false;
		const tool = createTaskToolDefinition({
			runTasks: async () => {
				called = true;
				return [];
			},
		});

		const result = await callExecute(tool, []);

		expect(called).toBe(false);
		expect((result?.content?.[0] as { text: string }).text).toBe("No tasks provided.");
	});
});
