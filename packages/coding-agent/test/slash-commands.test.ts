import { describe, expect, it } from "vitest";
import { BUILTIN_SLASH_COMMANDS, createInitOnboardingPrompt } from "../src/core/slash-commands.js";

describe("built-in slash commands", () => {
	it("includes init onboarding", () => {
		expect(BUILTIN_SLASH_COMMANDS).toContainEqual({
			name: "init",
			description: "Start Pi onboarding",
		});
	});

	it("keeps init onboarding conversational and memory-focused", () => {
		const prompt = createInitOnboardingPrompt();

		expect(prompt).toContain("Introduce yourself as Pi");
		expect(prompt).toContain("Ask only one question at a time");
		expect(prompt).toContain("Do not run a checklist");
		expect(prompt).toContain("~/.pi");
		expect(prompt).toContain("MEMORY.md");
		expect(prompt).toContain("PREFERENCES.md");
	});
});
