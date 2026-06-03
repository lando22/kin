import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readCorpusIndex, shouldRunFirstRunOnboarding } from "../src/core/kin-memory.js";

describe("readCorpusIndex", () => {
	let home: string;
	let memoryDir: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "kin-corpus-"));
		memoryDir = join(home, ".kin", "Memory");
		mkdirSync(memoryDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	test("returns one entry per note, sorted, using the first non-empty line as summary", () => {
		writeFileSync(join(memoryDir, "setup-environment.md"), "Landon's machine setup.\n\n- detail\n");
		writeFileSync(join(memoryDir, "reflection-model.md"), "Use deepseek for reflect.\n");

		expect(readCorpusIndex(home)).toEqual([
			{ file: "reflection-model.md", summary: "Use deepseek for reflect.", ageDays: 0 },
			{ file: "setup-environment.md", summary: "Landon's machine setup.", ageDays: 0 },
		]);
	});

	test("prefers the prose line after a leading heading and skips the portrait MEMORY.md", () => {
		writeFileSync(join(memoryDir, "MEMORY.md"), "# Portrait\nNot a corpus note.\n");
		writeFileSync(join(memoryDir, "file-notes.md"), "# File Notes Feature\n\nNotes anchored to a file.\n");

		const index = readCorpusIndex(home);

		expect(index).toEqual([{ file: "file-notes.md", summary: "Notes anchored to a file.", ageDays: 0 }]);
	});

	test("truncates an overlong summary line so the index stays lean", () => {
		const long = `Summary that goes on ${"and on ".repeat(40)}forever`;
		writeFileSync(join(memoryDir, "verbose.md"), `${long}\n`);

		const [entry] = readCorpusIndex(home);

		expect(entry.summary.length).toBeLessThanOrEqual(120);
		expect(entry.summary.endsWith("…")).toBe(true);
	});

	test("ignores non-markdown files and blank notes, returns [] when the dir is absent", () => {
		writeFileSync(join(memoryDir, "notes.txt"), "ignored");
		writeFileSync(join(memoryDir, "blank.md"), "   \n\n");

		expect(readCorpusIndex(home)).toEqual([]);
		expect(readCorpusIndex(join(home, "does-not-exist"))).toEqual([]);
	});

	test("first-run onboarding waits for a non-blank personal portrait", () => {
		expect(shouldRunFirstRunOnboarding(home)).toBe(true);

		writeFileSync(join(memoryDir, "MEMORY.md"), "   \n\n");
		expect(shouldRunFirstRunOnboarding(home)).toBe(true);

		writeFileSync(join(memoryDir, "MEMORY.md"), "Landon likes direct, warm collaboration.\n");
		expect(shouldRunFirstRunOnboarding(home)).toBe(false);
	});
});
