import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

/**
 * Memory layout:
 * - ~/.kin/Memory/MEMORY.md      — the always-loaded personal portrait (who the user is, how they work)
 * - ~/.kin/Memory/<slug>.md      — the corpus: atomic notes, retrieved on demand (grepped, never hotloaded)
 * - ~/.kin/Projects/<name>/PROJECT.md — the project portrait, loaded when working in that project
 * - ~/.kin/TODO.md               — ephemeral current-task checklist
 * - ~/.kin/Notes/<mirrored-abs-path>.md — file notes: anchored to a specific source file, auto-surfaced on read/edit
 */

/** Top-level personal entries that are safe for `/init` reset flows to remove. */
export const PI_MEMORY_ENTRIES = ["Memory", "Projects", "Reflections"] as const;

/** Resolve the root of Pi's personal memory directory. Tests can pass a fake home dir. */
export function getKinMemoryDir(homeDir = homedir()): string {
	return join(homeDir, ".kin");
}

/** The Memory folder holds the portrait (MEMORY.md) and the corpus of atomic notes. */
export function getMemoryDir(homeDir = homedir()): string {
	return join(getKinMemoryDir(homeDir), "Memory");
}

/** Return absolute paths for every resettable top-level memory entry. */
export function getKinMemoryPaths(homeDir = homedir()): string[] {
	return PI_MEMORY_ENTRIES.map((entry) => join(getKinMemoryDir(homeDir), entry));
}

/** Remove all resettable personal memory entries without failing on missing files. */
export function resetKinMemory(homeDir = homedir()): void {
	for (const target of getKinMemoryPaths(homeDir)) {
		rmSync(target, { force: true, recursive: true });
	}
}

/** Missing or blank files both mean "no context" to prompt builders. */
function readTrimmedFile(path: string): string | null {
	if (!existsSync(path)) return null;
	const content = readFileSync(path, "utf-8").trim();
	return content.length > 0 ? content : null;
}

/** The always-loaded personal portrait: who the user is and how they work. */
export function readMemoryContent(homeDir = homedir()): string | null {
	return readTrimmedFile(join(getMemoryDir(homeDir), "MEMORY.md"));
}

/** Project portrait, keyed by cwd basename, matching how session/project context is displayed elsewhere. */
export function readProjectContent(cwd: string, homeDir = homedir()): string | null {
	const projectName = basename(cwd);
	return readTrimmedFile(join(getKinMemoryDir(homeDir), "Projects", projectName, "PROJECT.md"));
}

/** TODO.md is ephemeral task state, separate from durable memory. */
export function getWorkingPath(homeDir = homedir()): string {
	return join(getKinMemoryDir(homeDir), "TODO.md");
}

/** Load current task state so a rebuilt prompt can pick up where the session left off. */
export function readWorkingContent(homeDir = homedir()): string | null {
	return readTrimmedFile(getWorkingPath(homeDir));
}

/** TODO.md is a current-state file, so callers overwrite it instead of appending history. */
export function writeWorkingContent(content: string, homeDir = homedir()): void {
	const workingPath = getWorkingPath(homeDir);
	mkdirSync(dirname(workingPath), { recursive: true });
	writeFileSync(workingPath, content, "utf-8");
}

/** Clear task state when work completes or the agent switches to unrelated work. */
export function clearWorkingContent(homeDir = homedir()): void {
	rmSync(getWorkingPath(homeDir), { force: true });
}

// ============================================================================
// File Notes
// ============================================================================

/** Directory for file notes. */
export function getFileNotesDir(homeDir = homedir()): string {
	return join(getKinMemoryDir(homeDir), "Notes");
}

/**
 * Storage path for a file's note: the file's absolute path mirrored under Notes/, with `.md`
 * appended. Legible and constructable, so the agent can leave a note with the write tool —
 * a note for /Users/x/pi/a.ts lives at ~/.kin/Notes/Users/x/pi/a.ts.md.
 */
export function getFileNotePath(filePath: string, homeDir = homedir()): string {
	const mirrored = resolve(filePath).replace(/^\/+/, "");
	return join(getFileNotesDir(homeDir), `${mirrored}.md`);
}

/** Read the note for a specific file, if one exists. Strips a legacy `<!-- file: ... -->` header. */
export function readFileNote(filePath: string, homeDir = homedir()): string | null {
	const notePath = getFileNotePath(filePath, homeDir);
	if (!existsSync(notePath)) return null;
	const raw = readFileSync(notePath, "utf-8");
	const content = raw.replace(/^\s*<!--\s*file:\s*.+?\s*-->\s*/, "").trim();
	return content.length > 0 ? content : null;
}

/** Write or overwrite a note for a specific file. */
export function writeFileNote(filePath: string, content: string, homeDir = homedir()): void {
	const notePath = getFileNotePath(filePath, homeDir);
	mkdirSync(dirname(notePath), { recursive: true });
	writeFileSync(notePath, `${content.trim()}\n`, "utf-8");
}

/** Delete a file note. */
export function deleteFileNote(filePath: string, homeDir = homedir()): void {
	rmSync(getFileNotePath(filePath, homeDir), { force: true });
}
