import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPiMemoryPaths, resetPiMemory } from "../src/core/pi-memory.js";
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
		expect(prompt).toContain("have just been cleared");
	});

	it("clears only the Pi memory files and note folders used by init onboarding", () => {
		const homeDir = join(tmpdir(), `pi-init-memory-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const piDir = join(homeDir, ".pi");
		mkdirSync(join(piDir, "Notes"), { recursive: true });
		mkdirSync(join(piDir, "Reflections"), { recursive: true });
		mkdirSync(join(piDir, "Projects"), { recursive: true });
		mkdirSync(join(piDir, "agent"), { recursive: true });
		writeFileSync(join(piDir, "MEMORY.md"), "old memory");
		writeFileSync(join(piDir, "PREFERENCES.md"), "old preferences");
		writeFileSync(join(piDir, "Notes", "note.md"), "old note");
		writeFileSync(join(piDir, "Reflections", "reflection.md"), "old reflection");
		writeFileSync(join(piDir, "Projects", "project.md"), "old project");
		writeFileSync(join(piDir, "agent", "auth.json"), "{}");

		try {
			resetPiMemory(homeDir);

			for (const target of getPiMemoryPaths(homeDir)) {
				expect(existsSync(target)).toBe(false);
			}
			expect(existsSync(join(piDir, "agent", "auth.json"))).toBe(true);
		} finally {
			rmSync(homeDir, { force: true, recursive: true });
		}
	});
});
