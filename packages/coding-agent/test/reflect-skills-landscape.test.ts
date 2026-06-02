import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { formatSkillsLandscape } from "../src/core/reflect-agent.js";

/** Write a folder-based skill (`<dir>/<name>/SKILL.md`) with the given frontmatter. */
function writeSkill(skillsDir: string, name: string, description: string): void {
	const dir = join(skillsDir, name);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`);
}

describe("formatSkillsLandscape", () => {
	let skillsDir: string;

	beforeEach(() => {
		skillsDir = mkdtempSync(join(tmpdir(), "kin-skills-"));
	});

	afterEach(() => {
		rmSync(skillsDir, { recursive: true, force: true });
	});

	test("returns null when the skills dir is absent or empty", () => {
		expect(formatSkillsLandscape(join(skillsDir, "does-not-exist"))).toBeNull();
		expect(formatSkillsLandscape(skillsDir)).toBeNull();
	});

	test("lists each skill with its name, description, and an age stamp", () => {
		writeSkill(skillsDir, "releasing-a-package", "Cut and publish a versioned npm release for this monorepo.");
		writeSkill(skillsDir, "debugging-flaky-tests", "Track down and stabilize intermittently failing vitest specs.");

		const out = formatSkillsLandscape(skillsDir);

		expect(out).not.toBeNull();
		// Name + description both surfaced so reflect can judge overlap before minting a new skill.
		expect(out).toContain("- releasing-a-package");
		expect(out).toContain("Cut and publish a versioned npm release");
		expect(out).toContain("- debugging-flaky-tests");
		// Freshly written → "today" age stamp.
		expect(out).toContain("(written today ago)");
	});
});
