import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

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

export function readProjectContent(cwd: string, homeDir = homedir()): string | null {
	const projectName = basename(cwd);
	const projectPath = join(getPiMemoryDir(homeDir), "Projects", projectName, "PROJECT.md");
	if (!existsSync(projectPath)) return null;
	const content = readFileSync(projectPath, "utf-8").trim();
	return content.length > 0 ? content : null;
}
