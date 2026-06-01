import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readCorpusHealth, readCorpusIndex, readCorpusUsage, recordCorpusAccess } from "../src/core/kin-memory.js";

describe("corpus usage tracking", () => {
	let home: string;
	let memoryDir: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "kin-usage-"));
		memoryDir = join(home, ".kin", "Memory");
		mkdirSync(memoryDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	test("records and accumulates reads, stamping a recent access time", () => {
		recordCorpusAccess("deploys.md", home);
		recordCorpusAccess("deploys.md", home);

		const usage = readCorpusUsage(home);
		expect(usage["deploys.md"].count).toBe(2);
		expect(Date.now() - usage["deploys.md"].lastAccessMs).toBeLessThan(5000);
	});

	test("ignores the portrait and non-markdown files", () => {
		recordCorpusAccess("MEMORY.md", home);
		recordCorpusAccess(".usage.json", home);

		expect(readCorpusUsage(home)).toEqual({});
	});

	test("tolerates a missing or corrupt sidecar", () => {
		expect(readCorpusUsage(home)).toEqual({});
		writeFileSync(join(memoryDir, ".usage.json"), "{not json", "utf-8");
		expect(readCorpusUsage(home)).toEqual({});
	});

	test("the usage sidecar never shows up in the corpus index", () => {
		writeFileSync(join(memoryDir, "real-note.md"), "A real note.\n");
		recordCorpusAccess("real-note.md", home);

		const files = readCorpusIndex(home).map((e) => e.file);
		expect(files).toEqual(["real-note.md"]);
	});

	test("health merges age + usage, defaulting unread notes to count 0 / null last-access", () => {
		writeFileSync(join(memoryDir, "read-note.md"), "Has been read.\n");
		writeFileSync(join(memoryDir, "cold-note.md"), "Never read.\n");
		recordCorpusAccess("read-note.md", home);

		const health = readCorpusHealth(home);
		const read = health.find((e) => e.file === "read-note.md");
		const cold = health.find((e) => e.file === "cold-note.md");

		expect(read?.accessCount).toBe(1);
		expect(read?.daysSinceAccess).toBe(0);
		expect(cold?.accessCount).toBe(0);
		expect(cold?.daysSinceAccess).toBeNull();
	});
});
