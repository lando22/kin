/**
 * Wake engine for Pi's morning routine.
 *
 * Reads the latest reflection (and optionally deeper history), feeds them through
 * the LLM with memory/project context, and writes a structured wake message to
 * ~/.kin/Wakes/<date>/WAKE.md — or returns <NONE> if there's nothing worth saying.
 *
 * Used by the `pi wake` CLI command.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Message, Model } from "@earendil-works/kin-ai";
import { completeSimple } from "@earendil-works/kin-ai";
import { formatLocalDate } from "./reflect.ts";

// =============================================================================
// Reflection reading
// =============================================================================

/** Get the path for a reflection directory for a given date. */
export function getReflectionDir(date: Date = new Date()): string {
	return join(homedir(), ".kin", "Reflections", formatLocalDate(date));
}

/** Get the path for a wake file for a given date. */
export function getWakePath(date: Date = new Date(), homeDir = homedir()): string {
	return join(homeDir, ".kin", "Wakes", formatLocalDate(date), "WAKE.md");
}

/** Get the path for the seen marker for a wake message. */
export function getWakeSeenPath(date: Date = new Date(), homeDir = homedir()): string {
	return join(homeDir, ".kin", "Wakes", formatLocalDate(date), "WAKE.seen");
}

/** Find the most recent reflection file across all dates. */
export function findLatestReflection(): { date: Date; content: string; path: string } | null {
	const reflectionsDir = join(homedir(), ".kin", "Reflections");
	if (!existsSync(reflectionsDir)) return null;

	const entries = readdirSync(reflectionsDir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort();

	for (let i = entries.length - 1; i >= 0; i--) {
		const reflectionPath = join(reflectionsDir, entries[i], "REFLECTION.md");
		if (existsSync(reflectionPath)) {
			return {
				date: new Date(`${entries[i]}T00:00:00`),
				content: readFileSync(reflectionPath, "utf-8"),
				path: reflectionPath,
			};
		}
	}
	return null;
}

/** Check if a wake already exists for the given date. */
export function wakeExists(date?: Date, homeDir = homedir()): boolean {
	return existsSync(getWakePath(date, homeDir));
}

/** Read an existing wake for the given date. */
export function readWake(date?: Date, homeDir = homedir()): string | null {
	const path = getWakePath(date, homeDir);
	if (!existsSync(path)) return null;
	return readFileSync(path, "utf-8");
}

/** Check if a wake exists and has already been surfaced in the TUI. */
export function isWakeSeen(date?: Date, homeDir = homedir()): boolean {
	const wakePath = getWakePath(date, homeDir);
	const seenPath = getWakeSeenPath(date, homeDir);
	if (!existsSync(wakePath) || !existsSync(seenPath)) return false;
	// If WAKE.md is rewritten after the marker, it should be surfaced again.
	return statSync(seenPath).mtimeMs >= statSync(wakePath).mtimeMs;
}

/** Read today's wake if it exists and has not been surfaced in the TUI yet. */
export function readUnseenWake(date?: Date, homeDir = homedir()): { content: string; path: string } | null {
	const path = getWakePath(date, homeDir);
	if (!existsSync(path) || isWakeSeen(date, homeDir)) return null;
	return { content: readFileSync(path, "utf-8"), path };
}

/** Format a wake message for the next conversation turn's LLM context. */
export function formatWakeContextMessage(content: string): string {
	return `<wake>\n${content.trim()}\n</wake>`;
}

/** Mark a wake as surfaced in the TUI. */
export function markWakeSeen(date?: Date, homeDir = homedir()): void {
	const wakePath = getWakePath(date, homeDir);
	if (!existsSync(wakePath)) return;
	const seenPath = getWakeSeenPath(date, homeDir);
	mkdirSync(dirname(seenPath), { recursive: true });
	writeFileSync(seenPath, `${new Date().toISOString()}\n`, "utf-8");
}

/** Write a wake to the file system. */
export function writeWake(content: string, date?: Date, homeDir = homedir()): void {
	const path = getWakePath(date, homeDir);
	const dir = dirname(path);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(path, content, "utf-8");
	// A new wake should be shown once even if an older wake for the same day was already seen.
	const seenPath = getWakeSeenPath(date, homeDir);
	if (existsSync(seenPath)) {
		unlinkSync(seenPath);
	}
}

// =============================================================================
// Wake generation
// =============================================================================

const WAKE_SYSTEM_PROMPT = `Read the latest reflection (and agenda if present), then say ONE thing that's on your mind. Just one.

Keep it short — two or three sentences max. Pick the thing you're most curious about or the one idea you want to bring up. Don't list everything. Don't give a status report.

Good examples:

"Morning. I keep thinking about that Gemini bug — still not sure why it returns empty. Want to dig into that?"

"Hey, I had an idea last night. What if we added a guard so wake doesn't call the LLM at all when the reflection is blank? Seems like a quick win."

"Morning. Did the launchd jobs actually fire last night? I'm curious what the logs look like."

Bad (do not do this): listing three things, explaining the whole agenda, using technical jargon the user didn't introduce, writing more than a few sentences.

Just drop into it like a person would. If there's genuinely nothing worth saying, write exactly <NONE>.`;

const WAKE_USER_TEMPLATE = `Latest reflection ({{DATE}}):

{{REFLECTION}}

{{AGENDA_SECTION}}---

Current MEMORY.md:

{{MEMORY}}

---

Current PROJECT.md (for project: {{PROJECT}}):

{{PROJECT_CONTENT}}

---

Decide if there's something worth saying. Return <NONE> if not.`;

export interface WakeContext {
	reflection: string;
	reflectionDate: string;
	memory: string | null;
	projectContent: string | null;
	projectName: string;
	/** Optional agenda Pi left for itself during reflection */
	agenda?: string | null;
}

/** Build the LLM context for wake generation. */
export function buildWakeContext(context: WakeContext): { systemPrompt: string; messages: Message[] } {
	// Agenda is optional; reflection is the primary input and keeps wake grounded in real sessions.
	const agendaSection = context.agenda ? `---\n\nAgenda I left for myself:\n\n${context.agenda}\n\n` : "";

	const userPrompt = WAKE_USER_TEMPLATE.replace("{{DATE}}", context.reflectionDate)
		.replace("{{REFLECTION}}", context.reflection)
		.replace("{{AGENDA_SECTION}}", agendaSection)
		.replace("{{MEMORY}}", context.memory ?? "*(empty memory file)*")
		.replace("{{PROJECT}}", context.projectName)
		.replace("{{PROJECT_CONTENT}}", context.projectContent ?? "*(empty project file)*");

	return {
		systemPrompt: WAKE_SYSTEM_PROMPT,
		messages: [{ role: "user", content: [{ type: "text", text: userPrompt }], timestamp: Date.now() }],
	};
}

/** Generate a wake message. Returns the raw text or <NONE>. */
export async function generateWake(
	model: Model<any>,
	context: WakeContext,
	options?: { signal?: AbortSignal; apiKey?: string },
): Promise<string> {
	const { systemPrompt, messages } = buildWakeContext(context);

	const response = await completeSimple(
		model,
		{ systemPrompt, messages },
		{ apiKey: options?.apiKey, signal: options?.signal },
	);

	const textParts: string[] = [];
	for (const block of response.content) {
		if (block.type === "text") {
			textParts.push(block.text);
		}
	}
	return textParts.join("").trim();
}

/** Check if a raw wake response is the <NONE> token (case-insensitive, surrounded by whitespace). */
export function isNoneResponse(raw: string): boolean {
	return /^\s*<NONE>\s*$/i.test(raw);
}
