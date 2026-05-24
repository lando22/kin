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
		const sourcePi = join(root, "source", ".pi");
		const targetPi = join(root, "target", ".pi");
		process.env[ENV_AGENT_DIR] = join(sourcePi, "agent");

		mkdirSync(join(sourcePi, "Projects", "pi"), { recursive: true });
		mkdirSync(join(sourcePi, "SKILLS", "review"), { recursive: true });
		mkdirSync(join(sourcePi, "agent", "sessions", "--project--"), { recursive: true });
		writeFileSync(join(sourcePi, "MEMORY.md"), "memory");
		writeFileSync(join(sourcePi, "PREFERENCES.md"), "prefs");
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

		process.env[ENV_AGENT_DIR] = join(targetPi, "agent");
		const imported = importPiContext(archivePath, root);
		expect(imported.path).toBe(archivePath);

		expect(readFileSync(join(targetPi, "MEMORY.md"), "utf-8")).toBe("memory");
		expect(readFileSync(join(targetPi, "PREFERENCES.md"), "utf-8")).toBe("prefs");
		expect(readFileSync(join(targetPi, "Projects", "pi", "PROJECT.md"), "utf-8")).toBe("project");
		expect(readFileSync(join(targetPi, "SKILLS", "review", "SKILL.md"), "utf-8")).toBe("skill");
		expect(readFileSync(join(targetPi, "agent", "sessions", "--project--", "session.jsonl"), "utf-8")).toBe("{}\n");
		expect(readFileSync(join(targetPi, "agent", "AGENTS.md"), "utf-8")).toBe("context");
		expect(existsSync(join(targetPi, "agent", "auth.json"))).toBe(false);
	});
});
