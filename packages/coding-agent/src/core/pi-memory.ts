import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const PI_MEMORY_ENTRIES = ["MEMORY.md", "PREFERENCES.md", "Notes", "Reflections", "Projects"] as const;

export function getPiMemoryPaths(homeDir = homedir()): string[] {
	return PI_MEMORY_ENTRIES.map((entry) => join(homeDir, ".pi", entry));
}

export function resetPiMemory(homeDir = homedir()): void {
	for (const target of getPiMemoryPaths(homeDir)) {
		rmSync(target, { force: true, recursive: true });
	}
}
