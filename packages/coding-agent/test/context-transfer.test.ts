import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.js";
import { exportPiContext, importPiContext } from "../src/core/context-transfer.js";

const originalAgentDir = process.env[ENV_AGENT_DIR];
let tempDir: string | undefined;

afterEach(() => {
	if (originalAgentDir === undefined) {
		delete process.env[ENV_AGENT_DIR];
	} else {
		process.env[ENV_AGENT_DIR] = originalAgentDir;
	}
	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

function createTempDir(): string {
	tempDir = mkdtempSync(join(tmpdir(), "pi-context-transfer-"));
	return tempDir;
}

describe("Pi context transfer", () => {
	test("exports and imports memory, skills, sessions, and context files without auth", () => {
		const root = createTempDir();
		const sourcePi = join(root, "source", ".kin");
		const targetKin = join(root, "target", ".kin");
		process.env[ENV_AGENT_DIR] = join(sourcePi, "agent");

		mkdirSync(join(sourcePi, "Memory"), { recursive: true });
		mkdirSync(join(sourcePi, "Projects", "pi"), { recursive: true });
		mkdirSync(join(sourcePi, "SKILLS", "review"), { recursive: true });
		mkdirSync(join(sourcePi, "agent", "sessions", "--project--"), { recursive: true });
		writeFileSync(join(sourcePi, "Memory", "MEMORY.md"), "memory");
		writeFileSync(join(sourcePi, "Memory", "build-command.md"), "note");
		writeFileSync(join(sourcePi, "Projects", "pi", "PROJECT.md"), "project");
		writeFileSync(join(sourcePi, "SKILLS", "review", "SKILL.md"), "skill");
		writeFileSync(join(sourcePi, "agent", "sessions", "--project--", "session.jsonl"), "{}\n");
		writeFileSync(join(sourcePi, "agent", "AGENTS.md"), "context");
		writeFileSync(join(sourcePi, "agent", "settings.json"), "{}\n");
		writeFileSync(join(sourcePi, "agent", "auth.json"), "secret");

		const archivePath = join(root, "handoff.tar.gz");
		const exported = exportPiContext(archivePath, root);
		expect(exported.path).toBe(archivePath);
		expect(exported.files).toBeGreaterThan(0);

		process.env[ENV_AGENT_DIR] = join(targetKin, "agent");
		const imported = importPiContext(archivePath, root);
		expect(imported.path).toBe(archivePath);

		expect(readFileSync(join(targetKin, "Memory", "MEMORY.md"), "utf-8")).toBe("memory");
		expect(readFileSync(join(targetKin, "Memory", "build-command.md"), "utf-8")).toBe("note");
		expect(readFileSync(join(targetKin, "Projects", "pi", "PROJECT.md"), "utf-8")).toBe("project");
		expect(readFileSync(join(targetKin, "SKILLS", "review", "SKILL.md"), "utf-8")).toBe("skill");
		expect(readFileSync(join(targetKin, "agent", "sessions", "--project--", "session.jsonl"), "utf-8")).toBe("{}\n");
		expect(readFileSync(join(targetKin, "agent", "AGENTS.md"), "utf-8")).toBe("context");
		expect(existsSync(join(targetKin, "agent", "auth.json"))).toBe(false);
	});
});
