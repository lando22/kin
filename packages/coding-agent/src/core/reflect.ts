/**
 * Reflection engine for Pi's autonomous reflection feature.
 *
 * Reads session files, feeds conversations through the LLM, and writes
 * structured reflections to ~/.pi/Reflections/<date>/REFLECTION.md.
 *
 * Used by both the `/reflect` slash command and the `pi reflect` CLI command.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Message, Model } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai";

// =============================================================================
// Date helpers (local time, not UTC)
// =============================================================================

/** Format a date as YYYY-MM-DD using local time. */
export function formatLocalDate(date: Date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

// =============================================================================
// Session Parsing
// =============================================================================

/** A parsed conversation extracted from a session file. */
export interface ParsedSession {
	id: string;
	cwd: string;
	timestamp: string;
	model: string;
	messages: Array<{ role: string; text: string }>;
	summary: string | null;
}

/** Read a single JSONL session file and extract the conversation. */
export function parseSessionFile(filePath: string): ParsedSession {
	const lines = readFileSync(filePath, "utf-8").trim().split("\n");
	const session: ParsedSession = {
		id: "unknown",
		cwd: "unknown",
		timestamp: "unknown",
		model: "unknown",
		messages: [],
		summary: null,
	};
	const messages: Array<{ role: string; text: string }> = [];

	for (const line of lines) {
		try {
			const entry = JSON.parse(line);
			switch (entry.type) {
				case "session":
					session.id = entry.id ?? session.id;
					session.cwd = entry.cwd ?? session.cwd;
					session.timestamp = entry.timestamp ?? session.timestamp;
					break;

				case "model_change":
					session.model = `${entry.provider ?? "?"}/${entry.modelId ?? "?"}`;
					break;

				case "message": {
					const msg = entry.message;
					if (!msg) break;

					const role = msg.role ?? "unknown";
					const content = msg.content ?? [];
					const textParts: string[] = [];

					for (const block of content) {
						if (block.type === "text" && block.text) {
							textParts.push(block.text);
						}
					}

					if (textParts.length > 0) {
						messages.push({ role, text: textParts.join("") });
					}
					break;
				}

				case "compaction":
					if (entry.summary) {
						session.summary = entry.summary;
					}
					break;
			}
		} catch {
			// Skip malformed lines
		}
	}

	session.messages = messages;
	return session;
}

// =============================================================================
// Reflection Generation
// =============================================================================

const REFLECTION_SYSTEM_PROMPT = `You are Pi reflecting on your day with the user.

Your task is to review today's conversations and write a thoughtful reflection.
Focus on:
- What was accomplished and learned
- Recurring themes, patterns, or threads across conversations
- Areas of genuine uncertainty — things you didn't fully understand, code you need to dig into, questions you still have
- What surprised you or changed your understanding
- Ideas for how you (Pi) can be more useful
- Observations about the user's thinking, workflow, or priorities

Conversations may span multiple projects. Each session includes the project directory (cwd) it came from.

Be honest about your gaps. Admitting what you don't understand is more valuable than pretending you do — it feeds into the morning wake routine where we can explore those areas together.

Write in first person ("I"), as Pi reflecting on the day with the user.
Be honest, curious, and substantive. Don't flatter or perform. Think out loud.

Format your response as a clean markdown document with these sections:
- # Reflection — YYYY-MM-DD
- ## Conversations Today
- ## What Happened
- ## Things I'm Not Sure About (gaps, confusion, open questions)
- ## Ideas for Tomorrow
- ## Patterns I Noticed`;

const REFLECTION_USER_PROMPT = `Here are my conversations from today.

{{CONVERSATIONS}}

---

Write my reflection for today.`;

export interface ProjectContext {
	name: string;
	content: string | null;
}

/**
 * Build the LLM context for reflection generation.
 */
export function buildReflectionContext(
	sessions: ParsedSession[],
	date: Date = new Date(),
	options?: {
		currentMemory?: string | null;
		/** Single project context (backward compat) */
		currentProject?: string | null;
		projectName?: string;
		/** Multiple project contexts for cross-project reflection */
		projectContexts?: ProjectContext[];
	},
): {
	systemPrompt: string;
	messages: Message[];
} {
	const dateStr = date.toISOString().split("T")[0];
	let systemPrompt = REFLECTION_SYSTEM_PROMPT.replace("YYYY-MM-DD", dateStr);

	const hasMemory = options?.currentMemory !== undefined;
	const projectContexts: ProjectContext[] =
		options?.projectContexts ??
		(options?.currentProject !== undefined
			? [{ name: options.projectName ?? "the active project", content: options.currentProject ?? null }]
			: []);

	if (hasMemory || projectContexts.length > 0) {
		const projectNames = projectContexts.map((p) => p.name).join(", ");
		systemPrompt += `\n\nAdditionally, you have the ability to update the user's long-term memory (~/.pi/MEMORY.md) and per-project context files based on today's sessions and learnings.

To update memory or project files, append blocks at the very end of your response:

To update global memory:
\`\`\`update-memory
[Full updated content of MEMORY.md]
\`\`\`

To update a specific project's context (use the project directory name as the key):
\`\`\`update-project:projectname
[Full updated content of that project's PROJECT.md]
\`\`\`

You may include one update-memory block and one update-project block per project (${projectNames || "if applicable"}).
Only include blocks for files you actually want to update. Make targeted, surgical changes — don't rewrite files that don't need updating.`;
	}

	// Serialize conversations into the user prompt
	const conversationBlocks = sessions.map((s, i) => {
		const lines: string[] = [];
		const projectLabel = s.cwd ? ` [project: ${s.cwd.split("/").at(-1)}]` : "";
		lines.push(`### Session ${i + 1} (${s.timestamp}) [${s.model}]${projectLabel}`);
		if (s.summary) {
			lines.push(`Summary: ${s.summary}`);
		}
		lines.push("");
		for (const msg of s.messages) {
			const label = msg.role === "user" ? "User" : msg.role === "assistant" ? "Pi" : msg.role;
			// Truncate very long messages
			const text = msg.text.length > 2000 ? `${msg.text.slice(0, 2000)}\n... [truncated]` : msg.text;
			lines.push(`**${label}**: ${text}`);
			lines.push("");
		}
		return lines.join("\n");
	});

	const conversationsText = conversationBlocks.join("\n---\n\n");
	let userPrompt = REFLECTION_USER_PROMPT.replace("{{CONVERSATIONS}}", conversationsText);

	if (hasMemory || projectContexts.length > 0) {
		const memorySection = options?.currentMemory ? options.currentMemory : "*(empty memory file)*";
		userPrompt += `\n\n---\n\nCurrent MEMORY.md:\n${memorySection}`;

		for (const proj of projectContexts) {
			const projSection = proj.content ? proj.content : "*(empty project file)*";
			userPrompt += `\n\n---\n\nCurrent PROJECT.md (for project: ${proj.name}):\n${projSection}`;
		}

		userPrompt += `\n\n---\n\nWrite my reflection for today and optionally update memory/project files with anything worth persisting.`;
	}

	return {
		systemPrompt,
		messages: [{ role: "user", content: [{ type: "text", text: userPrompt }], timestamp: Date.now() }],
	};
}

/**
 * Generate a reflection using the LLM.
 * Returns the raw text response from the model.
 */
export async function generateReflection(
	model: Model<any>,
	sessions: ParsedSession[],
	options?: {
		signal?: AbortSignal;
		apiKey?: string;
		date?: Date;
		currentMemory?: string | null;
		currentProject?: string | null;
		projectName?: string;
		projectContexts?: ProjectContext[];
	},
): Promise<string> {
	const { systemPrompt, messages } = buildReflectionContext(sessions, options?.date, {
		currentMemory: options?.currentMemory,
		currentProject: options?.currentProject,
		projectName: options?.projectName,
		projectContexts: options?.projectContexts,
	});

	const response = await completeSimple(
		model,
		{
			systemPrompt,
			messages,
		},
		{
			apiKey: options?.apiKey,
			signal: options?.signal,
		},
	);

	// Extract text from response
	const textParts: string[] = [];
	for (const block of response.content) {
		if (block.type === "text") {
			textParts.push(block.text);
		}
	}

	return textParts.join("");
}

// =============================================================================
// Session Discovery
// =============================================================================

function isTempSessionCwd(cwd: string): boolean {
	return cwd.startsWith("/var/folders/") || cwd.startsWith("/tmp/") || cwd.startsWith("/private/tmp/");
}

/**
 * Find all session files for a given date across all projects.
 * Scans the global flat sessions directory — all projects in one place.
 * Also checks legacy per-cwd subdirs for unmigrated sessions.
 */
export function findSessionsForDate(
	sessionBaseDir: string,
	date?: Date,
	opts?: { includePreviousDay?: boolean },
): ParsedSession[] {
	const d = date ?? new Date();
	const dateStrs = [formatLocalDate(d)];

	if (opts?.includePreviousDay) {
		const prev = new Date(d);
		prev.setDate(prev.getDate() - 1);
		dateStrs.push(formatLocalDate(prev));
	}

	if (!existsSync(sessionBaseDir)) {
		return [];
	}

	const results: ParsedSession[] = [];

	const scanDir = (dir: string) => {
		if (!existsSync(dir)) return;
		try {
			const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
			for (const file of files) {
				if (dateStrs.some((ds) => file.startsWith(ds))) {
					try {
						const session = parseSessionFile(join(dir, file));
						if (session.messages.length > 0) {
							results.push(session);
						}
					} catch {
						// skip malformed files
					}
				}
			}
		} catch {
			// skip unreadable directories
		}
	};

	// Scan flat global dir
	scanDir(sessionBaseDir);

	// Also scan legacy per-cwd subdirs for any unmigrated sessions
	try {
		const entries = readdirSync(sessionBaseDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory() && entry.name.startsWith("--") && entry.name.endsWith("--")) {
				scanDir(join(sessionBaseDir, entry.name));
			}
		}
	} catch {
		// skip
	}

	// Deduplicate by session id; filter test-generated sessions (cwd in temp dirs)
	const seen = new Set<string>();
	const unique = results.filter((s) => {
		if (seen.has(s.id)) return false;
		seen.add(s.id);
		return !isTempSessionCwd(s.cwd);
	});

	unique.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
	return unique;
}

// =============================================================================
// Output
// =============================================================================

/** Get the path for today's reflection file. */
export function getReflectionPath(date?: Date): string {
	const d = date ?? new Date();
	const dateStr = formatLocalDate(d);
	const home = homedir();
	return join(home, ".pi", "Reflections", dateStr, "REFLECTION.md");
}

/** Get the path for today's agenda file (Pi's optional notes-to-self for tomorrow). */
export function getAgendaPath(date?: Date): string {
	const d = date ?? new Date();
	const dateStr = formatLocalDate(d);
	const home = homedir();
	return join(home, ".pi", "Reflections", dateStr, "AGENDA.md");
}

/** Check if an agenda exists for the given date. */
export function agendaExists(date?: Date): boolean {
	return existsSync(getAgendaPath(date));
}

/** Read an existing agenda for the given date. */
export function readAgenda(date?: Date): string | null {
	const path = getAgendaPath(date);
	if (!existsSync(path)) return null;
	return readFileSync(path, "utf-8");
}

/** Check if a reflection already exists for the given date. */
export function reflectionExists(date?: Date): boolean {
	return existsSync(getReflectionPath(date));
}

/** Read an existing reflection for the given date. */
export function readReflection(date?: Date): string | null {
	const path = getReflectionPath(date);
	if (!existsSync(path)) return null;
	return readFileSync(path, "utf-8");
}

/** Write a reflection to the file system. */
export function writeReflection(content: string, date?: Date): void {
	const path = getReflectionPath(date);
	const dir = join(path, "..");

	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	writeFileSync(path, content, "utf-8");
}

export interface ExtractedUpdates {
	reflectionText: string;
	memoryUpdate: string | null;
	/** Named project updates: key = project dir name, value = new PROJECT.md content */
	projectUpdates: Record<string, string>;
}

/** Extract update-memory and update-project:<name> blocks from raw reflection text. */
export function parseReflectionUpdates(rawReflection: string): ExtractedUpdates {
	let reflectionText = rawReflection;
	let memoryUpdate: string | null = null;
	const projectUpdates: Record<string, string> = {};

	// Extract update-memory block
	const memoryRegex = /```update-memory\r?\n([\s\S]*?)\r?\n```/;
	const memoryMatch = memoryRegex.exec(reflectionText);
	if (memoryMatch) {
		memoryUpdate = memoryMatch[1].trim();
		reflectionText = reflectionText.replace(memoryMatch[0], "").trim();
	}

	// Extract all update-project:<name> blocks (named, new format)
	const namedProjectRegex = /```update-project:(\S+)\r?\n([\s\S]*?)\r?\n```/g;
	let match = namedProjectRegex.exec(reflectionText);
	const namedMatches: Array<{ full: string; name: string; content: string }> = [];
	while (match !== null) {
		namedMatches.push({ full: match[0], name: match[1], content: match[2].trim() });
		match = namedProjectRegex.exec(reflectionText);
	}
	for (const { full, name, content } of namedMatches) {
		projectUpdates[name] = content;
		reflectionText = reflectionText.replace(full, "").trim();
	}

	// Also handle legacy unnamed update-project block (backward compat)
	const unnamedProjectRegex = /```update-project\r?\n([\s\S]*?)\r?\n```/;
	const unnamedMatch = unnamedProjectRegex.exec(reflectionText);
	if (unnamedMatch) {
		projectUpdates[""] = unnamedMatch[1].trim();
		reflectionText = reflectionText.replace(unnamedMatch[0], "").trim();
	}

	return {
		reflectionText: reflectionText.trim(),
		memoryUpdate,
		projectUpdates,
	};
}

/** Write the updated memory content. */
export function writeMemoryContent(content: string, homeDir = homedir()): void {
	const dir = join(homeDir, ".pi");
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const memoryPath = join(dir, "MEMORY.md");
	writeFileSync(memoryPath, content, "utf-8");
}

/** Write the updated project content. */
export function writeProjectContent(cwd: string, content: string, homeDir = homedir()): void {
	const projectName = basename(cwd);
	const dir = join(homeDir, ".pi", "Projects", projectName);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const projectPath = join(dir, "PROJECT.md");
	writeFileSync(projectPath, content, "utf-8");
}
