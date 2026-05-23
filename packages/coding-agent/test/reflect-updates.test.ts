import { describe, expect, it } from "vitest";
import { buildReflectionContext, parseReflectionUpdates } from "../src/core/reflect.js";

describe("Reflection Memory & Project Updates", () => {
	it("parses named update-project blocks correctly", () => {
		const rawResponse = `
# Reflection — 2026-05-21
Today we got onboarding shipped!

\`\`\`update-memory
# Landon — Durable Facts
He is a developer and memory is updated.
\`\`\`

\`\`\`update-project:pi
# Pi Monorepo — Current Project
Updates to project context verified.
\`\`\`
`.trim();

		const parsed = parseReflectionUpdates(rawResponse);

		expect(parsed.reflectionText).toContain("# Reflection — 2026-05-21");
		expect(parsed.reflectionText).toContain("Today we got onboarding shipped!");
		expect(parsed.reflectionText).not.toContain("```update-memory");
		expect(parsed.reflectionText).not.toContain("```update-project");

		expect(parsed.memoryUpdate).toBe("# Landon — Durable Facts\nHe is a developer and memory is updated.");
		expect(parsed.projectUpdates.pi).toBe("# Pi Monorepo — Current Project\nUpdates to project context verified.");
	});

	it("parses legacy unnamed update-project block for backward compat", () => {
		const rawResponse = `
# Reflection — 2026-05-21
Today we got onboarding shipped!

\`\`\`update-project
# Pi Monorepo — Current Project
Updates to project context verified.
\`\`\`
`.trim();

		const parsed = parseReflectionUpdates(rawResponse);

		expect(parsed.projectUpdates[""]).toBe("# Pi Monorepo — Current Project\nUpdates to project context verified.");
	});

	it("handles multiple named project blocks", () => {
		const rawResponse = `
Reflection text here.

\`\`\`update-project:pi
Pi project context.
\`\`\`

\`\`\`update-project:other-app
Other app context.
\`\`\`
`.trim();

		const parsed = parseReflectionUpdates(rawResponse);
		expect(parsed.projectUpdates.pi).toBe("Pi project context.");
		expect(parsed.projectUpdates["other-app"]).toBe("Other app context.");
	});

	it("returns null/empty for updates when no update blocks are present", () => {
		const rawResponse = `
# Reflection — 2026-05-21
Just a normal reflection without any updates.
`.trim();

		const parsed = parseReflectionUpdates(rawResponse);

		expect(parsed.reflectionText).toBe(rawResponse);
		expect(parsed.memoryUpdate).toBeNull();
		expect(parsed.projectUpdates).toEqual({});
	});

	it("builds reflection context with multiple project contexts", () => {
		const sessions = [
			{
				id: "session-1",
				cwd: "/user/workspace/my-cool-app",
				timestamp: "2026-05-21T12:00:00Z",
				model: "openai/gpt-4o",
				messages: [
					{ role: "user", text: "Hello Pi" },
					{ role: "assistant", text: "Hello Landon!" },
				],
				summary: "An onboarding chat",
			},
		];

		const context = buildReflectionContext(sessions, new Date("2026-05-21"), {
			currentMemory: "# Old Memory",
			projectContexts: [
				{ name: "my-cool-app", content: "# Old Project" },
				{ name: "other-project", content: null },
			],
		});

		expect(context.systemPrompt).toContain(
			"Additionally, you have the ability to update the user's long-term memory",
		);
		expect(context.systemPrompt).toContain("update-memory");
		expect(context.systemPrompt).toContain("update-project:projectname");

		const firstContent = context.messages[0]!.content[0]!;
		if (typeof firstContent === "string" || firstContent.type !== "text") {
			throw new Error("Expected reflection prompt content to be text");
		}
		const userMessage = firstContent.text;
		expect(userMessage).toContain("# Old Memory");
		expect(userMessage).toContain("# Old Project");
		expect(userMessage).toContain("my-cool-app");
		expect(userMessage).toContain("other-project");
	});
});
