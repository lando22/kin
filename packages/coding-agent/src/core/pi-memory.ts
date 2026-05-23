import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

function localDateStr(date: Date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export const PI_MEMORY_ENTRIES = ["MEMORY.md", "PREFERENCES.md", "Notes", "Reflections", "Projects"] as const;

export function getPiMemoryDir(homeDir = homedir()): string {
	return join(homeDir, ".pi");
}

export function getPiMemoryPaths(homeDir = homedir()): string[] {
	return PI_MEMORY_ENTRIES.map((entry) => join(getPiMemoryDir(homeDir), entry));
}

export function resetPiMemory(homeDir = homedir()): void {
	for (const target of getPiMemoryPaths(homeDir)) {
		rmSync(target, { force: true, recursive: true });
	}
}

export function readMemoryContent(homeDir = homedir()): string | null {
	const memoryPath = join(getPiMemoryDir(homeDir), "MEMORY.md");
	if (!existsSync(memoryPath)) return null;
	const content = readFileSync(memoryPath, "utf-8").trim();
	return content.length > 0 ? content : null;
}

export function readPreferencesContent(homeDir = homedir()): string | null {
	const prefsPath = join(getPiMemoryDir(homeDir), "PREFERENCES.md");
	if (!existsSync(prefsPath)) return null;
	const content = readFileSync(prefsPath, "utf-8").trim();
	return content.length > 0 ? content : null;
}

export function readProjectContent(cwd: string, homeDir = homedir()): string | null {
	const projectName = basename(cwd);
	const projectPath = join(getPiMemoryDir(homeDir), "Projects", projectName, "PROJECT.md");
	if (!existsSync(projectPath)) return null;
	const content = readFileSync(projectPath, "utf-8").trim();
	return content.length > 0 ? content : null;
}

export function getNotesPath(date?: Date, homeDir = homedir()): string {
	return join(getPiMemoryDir(homeDir), "Notes", `${localDateStr(date)}.md`);
}

export function readNotesContent(date?: Date, homeDir = homedir()): string | null {
	const notesPath = getNotesPath(date, homeDir);
	if (!existsSync(notesPath)) return null;
	const content = readFileSync(notesPath, "utf-8").trim();
	return content.length > 0 ? content : null;
}

export function getWorkingPath(homeDir = homedir()): string {
	return join(getPiMemoryDir(homeDir), "WORKING.md");
}

export function readWorkingContent(homeDir = homedir()): string | null {
	const workingPath = getWorkingPath(homeDir);
	if (!existsSync(workingPath)) return null;
	const content = readFileSync(workingPath, "utf-8").trim();
	return content.length > 0 ? content : null;
}

export function writeWorkingContent(content: string, homeDir = homedir()): void {
	const workingPath = getWorkingPath(homeDir);
	const dir = dirname(workingPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(workingPath, content, "utf-8");
}

export function clearWorkingContent(homeDir = homedir()): void {
	const workingPath = getWorkingPath(homeDir);
	if (existsSync(workingPath)) {
		rmSync(workingPath, { force: true });
	}
}
