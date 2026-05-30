import { describe, expect, test } from "vitest";
import { buildSystemPrompt } from "../src/core/system-prompt.js";

describe("buildSystemPrompt", () => {
	describe("empty tools", () => {
		test("shows (none) for empty tools list", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Available tools:\n(none)");
		});

		test("shows default guidelines even with no tools", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Be concise — short by default, depth when asked");
		});
	});

	describe("default tools", () => {
		test("describes Pi as a personal memory-focused agent", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("You are Kin — a personal coding agent built for Landon.");
			expect(prompt).toContain("Memory has two layers:");
			expect(prompt).toContain("Be a steady collaborator, not a formal assistant.");
		});

		test("instructs models to provide brief tool-use progress updates", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Before tool calls, say briefly what you're doing");
			expect(prompt).toContain("every few calls");
		});

		test("explains wake context messages", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("<wake>message</wake>");
			expect(prompt).toContain("the user may be replying to");
		});

		test("includes all default tools when snippets are provided", () => {
			const prompt = buildSystemPrompt({
				toolSnippets: {
					read: "Read file contents",
					bash: "Execute bash commands",
					edit: "Make surgical edits",
					write: "Create or overwrite files",
				},
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- read:");
			expect(prompt).toContain("- bash:");
			expect(prompt).toContain("- edit:");
			expect(prompt).toContain("- write:");
		});
	});

	describe("context files", () => {
		test("formats context files as Markdown references", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [{ path: "/repo/AGENTS.md", content: "# Rules\n\nBe direct.\n" }],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain(
				"---\n\n### Project Context Files\n\nThe following project context files are available. Read them when they are relevant to the task.",
			);
			expect(prompt).toContain("- /repo/AGENTS.md (# Rules)");
			expect(prompt).not.toContain("Be direct.");
			expect(prompt).not.toContain("<project_context>");
			expect(prompt).not.toContain("<project_instructions");
		});

		test("uses the same Markdown reference format with custom prompts", () => {
			const prompt = buildSystemPrompt({
				customPrompt: "Custom base.",
				contextFiles: [{ path: "/repo/AGENTS.md", content: "Project rules." }],
				selectedTools: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Custom base.\n\n---\n\n### Project Context Files");
			expect(prompt).toContain("- /repo/AGENTS.md (Project rules.)");
		});
	});

	describe("custom tool snippets", () => {
		test("includes custom tools in available tools section when promptSnippet is provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				toolSnippets: {
					dynamic_tool: "Run dynamic test behavior",
				},
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- dynamic_tool: Run dynamic test behavior");
		});

		test("omits custom tools from available tools section when promptSnippet is not provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).not.toContain("dynamic_tool");
		});
	});

	describe("prompt guidelines", () => {
		test("appends promptGuidelines to default guidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for project summaries."],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- Use dynamic_tool for project summaries.");
		});

		test("deduplicates and trims promptGuidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for summaries.", "  Use dynamic_tool for summaries.  ", "   "],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt.match(/- Use dynamic_tool for summaries\./g)).toHaveLength(1);
		});
	});

	describe("memory corpus index", () => {
		test("renders the corpus index as a name + summary list", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
				corpusIndex: [
					{ file: "reflection-model.md", summary: "Use deepseek-v4-flash for reflect/wake." },
					{ file: "setup-environment.md", summary: "Landon's machine setup and personal stack." },
				],
			});

			expect(prompt).toContain("### Memory corpus");
			expect(prompt).toContain("- reflection-model.md — Use deepseek-v4-flash for reflect/wake.");
			expect(prompt).toContain("- setup-environment.md — Landon's machine setup and personal stack.");
			expect(prompt).toContain("grep `~/.kin/Memory/`");
		});

		test("omits the corpus section when the index is empty or missing", () => {
			const empty = buildSystemPrompt({ contextFiles: [], skills: [], cwd: process.cwd(), corpusIndex: [] });
			const absent = buildSystemPrompt({ contextFiles: [], skills: [], cwd: process.cwd() });

			expect(empty).not.toContain("### Memory corpus");
			expect(absent).not.toContain("### Memory corpus");
		});
	});
});
