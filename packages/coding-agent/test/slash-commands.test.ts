import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getKinMemoryPaths, resetKinMemory } from "../src/core/kin-memory.js";
import { BUILTIN_SLASH_COMMANDS, createInitOnboardingPrompt } from "../src/core/slash-commands.js";

describe("built-in slash commands", () => {
	it("includes init onboarding", () => {
		expect(BUILTIN_SLASH_COMMANDS).toContainEqual({
			name: "init",
			description: "Start Kin onboarding",
		});
	});

	it("includes model selector", () => {
		expect(BUILTIN_SLASH_COMMANDS).toContainEqual({
			name: "model",
			description: "Select model",
		});
	});

	it("keeps init onboarding conversational and memory-focused", () => {
		const prompt = createInitOnboardingPrompt(process.cwd());

		expect(prompt).toContain("Introduce yourself as Kin");
		expect(prompt).toContain("one question at a time");
		expect(prompt).toContain("don't run a checklist");
		expect(prompt).toContain("~/.kin");
		expect(prompt).toContain("Memory/MEMORY.md");
		expect(prompt).toContain("Memory has just been cleared");
		expect(prompt).toContain("Phase 1: Get to know the user");
	});

	it("clears only the Kin memory files and note folders used by init onboarding", () => {
		const homeDir = join(tmpdir(), `kin-init-memory-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const kinDir = join(homeDir, ".kin");
		mkdirSync(join(kinDir, "Memory"), { recursive: true });
		mkdirSync(join(kinDir, "Reflections"), { recursive: true });
		mkdirSync(join(kinDir, "Projects"), { recursive: true });
		mkdirSync(join(kinDir, "agent"), { recursive: true });
		writeFileSync(join(kinDir, "Memory", "MEMORY.md"), "old memory");
		writeFileSync(join(kinDir, "Memory", "note.md"), "old note");
		writeFileSync(join(kinDir, "Reflections", "reflection.md"), "old reflection");
		writeFileSync(join(kinDir, "Projects", "project.md"), "old project");
		writeFileSync(join(kinDir, "agent", "auth.json"), "{}");

		try {
			resetKinMemory(homeDir);

			for (const target of getKinMemoryPaths(homeDir)) {
				expect(existsSync(target)).toBe(false);
			}
			expect(existsSync(join(kinDir, "agent", "auth.json"))).toBe(true);
		} finally {
			rmSync(homeDir, { force: true, recursive: true });
		}
	});
});
