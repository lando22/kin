import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { KIN_COMMIT_TRAILER } from "../src/core/reflect.js";
import { formatRecentCommits } from "../src/core/reflect-agent.js";

function git(cwd: string, command: string): void {
	execSync(`git ${command}`, { cwd, stdio: "pipe" });
}

describe("formatRecentCommits", () => {
	let repo: string;

	beforeEach(() => {
		repo = mkdtempSync(join(tmpdir(), "kin-commits-"));
		git(repo, "init -q");
		git(repo, 'config user.email "landon@example.com"');
		git(repo, 'config user.name "Landon Test"');
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("marks Kin-trailed commits as 'you' and others by author", async () => {
		writeFileSync(join(repo, "a.txt"), "one", "utf-8");
		git(repo, "add . ");
		git(repo, 'commit -q -m "feat: user work"');

		writeFileSync(join(repo, "b.txt"), "two", "utf-8");
		git(repo, "add .");
		git(repo, `commit -q -m "fix: kin work" -m "${KIN_COMMIT_TRAILER}"`);

		const output = await formatRecentCommits(repo);
		expect(output).not.toBeNull();
		const lines = output!.split("\n");
		expect(lines).toHaveLength(2);
		// Newest first: Kin's commit, then the user's.
		expect(lines[0]).toContain("(you) fix: kin work");
		expect(lines[1]).toContain("(Landon Test) feat: user work");
	});

	test("returns null outside a git repo", async () => {
		const plain = mkdtempSync(join(tmpdir(), "kin-nogit-"));
		try {
			expect(await formatRecentCommits(plain)).toBeNull();
		} finally {
			rmSync(plain, { recursive: true, force: true });
		}
	});

	test("returns null for a repo with no commits", async () => {
		expect(await formatRecentCommits(repo)).toBeNull();
	});
});
