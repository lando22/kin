import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { ageInDays } from "./memory-freshness.ts";

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

/** First-run onboarding is needed until a non-blank personal portrait exists. */
export function shouldRunFirstRunOnboarding(homeDir = homedir()): boolean {
	return readMemoryContent(homeDir) === null;
}

/** One corpus note as it appears in the always-loaded index: filename, one-line summary, and age. */
export interface CorpusIndexEntry {
	file: string;
	summary: string;
	/** Whole days since the note was last written — a freshness signal for selection. */
	ageDays: number;
}

/** Keep the always-loaded index lean even when a note's first line runs long. */
const CORPUS_SUMMARY_MAX = 120;

/**
 * Build a table of contents for the corpus: every `Memory/<slug>.md` note (except the portrait
 * MEMORY.md) with its one-line summary. Injected into the prompt so the agent knows what notes
 * exist and when to grep for them — a model can't reach for a note it doesn't know is there.
 * Contents are NOT loaded; only the filename and first non-empty line.
 */
export function readCorpusIndex(homeDir = homedir()): CorpusIndexEntry[] {
	const dir = getMemoryDir(homeDir);
	if (!existsSync(dir)) return [];
	const entries: CorpusIndexEntry[] = [];
	for (const file of readdirSync(dir)) {
		if (!file.endsWith(".md") || file === "MEMORY.md") continue;
		const lines = readFileSync(join(dir, file), "utf-8")
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		// A note may open with a `# Heading`; the real summary is the first prose line after it.
		const summaryLine = lines.find((line) => !line.startsWith("#")) ?? lines[0]?.replace(/^#+\s*/, "");
		if (!summaryLine) continue;
		const summary =
			summaryLine.length > CORPUS_SUMMARY_MAX
				? `${summaryLine.slice(0, CORPUS_SUMMARY_MAX - 1).trimEnd()}…`
				: summaryLine;
		const ageDays = ageInDays(statSync(join(dir, file)).mtimeMs);
		entries.push({ file, summary, ageDays });
	}
	return entries.sort((a, b) => a.file.localeCompare(b.file));
}

// ============================================================================
// Corpus usage tracking
//
// A "usefulness" signal to complement age: which notes actually get read. Stored in a
// sidecar so it never pollutes the corpus itself. This is a SOFT signal — notes are
// most often located by grepping `~/.kin/Memory/`, and a grep hit is not recorded here;
// only a full read through the read tool bumps the count. So a zero count means "not read
// via the read tool lately," not "never useful." Reflect uses it to prioritize what to
// review, never to delete automatically.
// ============================================================================

/** Per-note usage record. */
export interface CorpusUsageRecord {
	/** How many times the note was read in full via the read tool. */
	count: number;
	/** Epoch ms of the most recent recorded read. */
	lastAccessMs: number;
}

/** The usage sidecar lives in the Memory dir but is skipped by the corpus index (not a `.md`). */
function getCorpusUsagePath(homeDir = homedir()): string {
	return join(getMemoryDir(homeDir), ".usage.json");
}

/** Load the usage map, tolerating a missing or corrupt sidecar (treated as empty). */
export function readCorpusUsage(homeDir = homedir()): Record<string, CorpusUsageRecord> {
	const path = getCorpusUsagePath(homeDir);
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		return parsed && typeof parsed === "object" ? (parsed as Record<string, CorpusUsageRecord>) : {};
	} catch {
		return {};
	}
}

/** Record that a corpus note was read in full. Best-effort: never throws into the read path. */
export function recordCorpusAccess(file: string, homeDir = homedir()): void {
	if (file === "MEMORY.md" || !file.endsWith(".md")) return;
	try {
		const usage = readCorpusUsage(homeDir);
		const prev = usage[file];
		usage[file] = { count: (prev?.count ?? 0) + 1, lastAccessMs: Date.now() };
		writeFileSync(getCorpusUsagePath(homeDir), JSON.stringify(usage), "utf-8");
	} catch {
		// Usage tracking is a convenience; a failure here must not break reading a note.
	}
}

/** A corpus note enriched with both freshness (age) and usefulness (usage) signals, for gardening. */
export interface CorpusHealthEntry extends CorpusIndexEntry {
	/** Recorded full reads via the read tool. */
	accessCount: number;
	/** Whole days since the last recorded read, or null if never recorded. */
	daysSinceAccess: number | null;
}

/**
 * The corpus with age + usage attached, sorted stalest-and-least-used first so a reviewer
 * sees the most likely dead weight at the top. Read by reflect to drive consolidation/pruning.
 */
export function readCorpusHealth(homeDir = homedir()): CorpusHealthEntry[] {
	const usage = readCorpusUsage(homeDir);
	const now = Date.now();
	const entries = readCorpusIndex(homeDir).map((entry) => {
		const record = usage[entry.file];
		return {
			...entry,
			accessCount: record?.count ?? 0,
			daysSinceAccess: record ? ageInDays(record.lastAccessMs, now) : null,
		};
	});
	// Oldest first; within the same age, least-read first — the rot floats to the top.
	return entries.sort((a, b) => b.ageDays - a.ageDays || a.accessCount - b.accessCount);
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

/** Age in days of a file's note — when the observation was last recorded — or null if there is none. */
export function fileNoteAgeDays(filePath: string, homeDir = homedir()): number | null {
	const notePath = getFileNotePath(filePath, homeDir);
	if (!existsSync(notePath)) return null;
	return ageInDays(statSync(notePath).mtimeMs);
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
