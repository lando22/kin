import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

/** Format dates the same way memory files are named: local YYYY-MM-DD, not UTC. */
function localDateStr(date: Date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** Top-level personal files/directories that are safe for `/init` reset flows to remove. */
export const PI_MEMORY_ENTRIES = ["MEMORY.md", "PREFERENCES.md", "Notes", "Reflections", "Projects"] as const;

/** Resolve the root of Pi's personal memory directory. Tests can pass a fake home dir. */
export function getPiMemoryDir(homeDir = homedir()): string {
	return join(homeDir, ".pi");
}

/** Return absolute paths for every resettable top-level memory entry. */
export function getPiMemoryPaths(homeDir = homedir()): string[] {
	return PI_MEMORY_ENTRIES.map((entry) => join(getPiMemoryDir(homeDir), entry));
}

/** Remove all resettable personal memory entries without failing on missing files. */
export function resetPiMemory(homeDir = homedir()): void {
	for (const target of getPiMemoryPaths(homeDir)) {
		rmSync(target, { force: true, recursive: true });
	}
}

/** Missing or blank files both mean "no context" to prompt builders. */
function readTrimmedFile(path: string): string | null {
	if (!existsSync(path)) return null;
	const content = readFileSync(path, "utf-8").trim();
	return content.length > 0 ? content : null;
}

/** Durable user-level memory loaded into every agent session. */
export function readMemoryContent(homeDir = homedir()): string | null {
	return readTrimmedFile(join(getPiMemoryDir(homeDir), "MEMORY.md"));
}

/** User preferences are separate from MEMORY.md so tone/style updates can stay targeted. */
export function readPreferencesContent(homeDir = homedir()): string | null {
	return readTrimmedFile(join(getPiMemoryDir(homeDir), "PREFERENCES.md"));
}

/** Project memory is keyed by cwd basename, matching how session/project context is displayed elsewhere. */
export function readProjectContent(cwd: string, homeDir = homedir()): string | null {
	const projectName = basename(cwd);
	return readTrimmedFile(join(getPiMemoryDir(homeDir), "Projects", projectName, "PROJECT.md"));
}

/** Notes are daily scratch observations that later feed the reflection cycle. */
export function getNotesPath(date?: Date, homeDir = homedir()): string {
	return join(getPiMemoryDir(homeDir), "Notes", `${localDateStr(date)}.md`);
}

/** Read today's notes, if any were captured during active sessions. */
export function readNotesContent(date?: Date, homeDir = homedir()): string | null {
	return readTrimmedFile(getNotesPath(date, homeDir));
}

/** WORKING.md is ephemeral task state, separate from durable memory. */
export function getWorkingPath(homeDir = homedir()): string {
	return join(getPiMemoryDir(homeDir), "WORKING.md");
}

/** Load current task state so a rebuilt prompt can pick up where the session left off. */
export function readWorkingContent(homeDir = homedir()): string | null {
	return readTrimmedFile(getWorkingPath(homeDir));
}

/** WORKING.md is a current-state file, so callers overwrite it instead of appending history. */
export function writeWorkingContent(content: string, homeDir = homedir()): void {
	const workingPath = getWorkingPath(homeDir);
	mkdirSync(dirname(workingPath), { recursive: true });
	writeFileSync(workingPath, content, "utf-8");
}

/** Clear task state when work completes or the agent switches to unrelated work. */
export function clearWorkingContent(homeDir = homedir()): void {
	rmSync(getWorkingPath(homeDir), { force: true });
}
