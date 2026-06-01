/**
 * Headless reflect agent.
 *
 * Runs Pi as a full agent with tools during the reflect/dreaming cycle.
 * Pi explores session history on its own, reads code, updates memory surgically,
 * and writes REFLECTION.md (and optionally AGENDA.md) when done.
 *
 * This replaces the old completeSimple approach where all sessions were
 * pre-stuffed into the prompt in one shot.
 */

import { closeSync, existsSync, openSync, readdirSync, readSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Model } from "@earendil-works/kin-ai";
import type { AgentSessionServices } from "./agent-session-services.ts";
import { createAgentSessionFromServices } from "./agent-session-services.ts";
import { getMemoryDir, readCorpusHealth } from "./kin-memory.ts";
import { formatAgeShort } from "./memory-freshness.ts";
import { formatLocalDate, getAgendaPath, getReflectionPath } from "./reflect.ts";
import { SessionManager } from "./session-manager.ts";

// =============================================================================
// Session Index
// =============================================================================

/** Returns true if the cwd looks like a test-generated temp directory. */
function isTempCwd(cwd: string): boolean {
	return cwd.startsWith("/var/folders/") || cwd.startsWith("/tmp/") || cwd.startsWith("/private/tmp/");
}

interface SessionSummary {
	file: string;
	filePath: string;
	dateStr: string;
	cwd: string;
	project: string;
	firstMessage: string;
	messageCount: number;
}

function scanSessionFile(filePath: string): SessionSummary | null {
	let fd: number | null = null;
	try {
		fd = openSync(filePath, "r");
		// Reflection only needs enough of each session to decide whether to inspect the full file.
		const buffer = Buffer.alloc(4096);
		const bytesRead = readSync(fd, buffer, 0, 4096, 0);

		const text = buffer.toString("utf8", 0, bytesRead);
		const lines = text.split("\n").filter((l) => l.trim());

		let cwd = "";
		let timestamp = "";
		let firstMessage = "";
		let messageCount = 0;

		for (const line of lines) {
			try {
				const entry = JSON.parse(line);
				if (entry.type === "session") {
					cwd = entry.cwd ?? "";
					timestamp = entry.timestamp ?? "";
				} else if (entry.type === "message") {
					messageCount++;
					if (!firstMessage && entry.message?.role === "user") {
						const content = entry.message.content;
						let text = "";
						if (Array.isArray(content)) {
							text = content.find((b: { type: string }) => b.type === "text")?.text ?? "";
						} else if (typeof content === "string") {
							text = content;
						}
						firstMessage = text.slice(0, 120).replace(/\n/g, " ");
					}
				}
			} catch {
				// skip malformed lines
			}
		}

		if (!timestamp) return null;

		return {
			file: basename(filePath),
			filePath,
			dateStr: timestamp.slice(0, 10),
			cwd,
			project: cwd ? basename(cwd) : "unknown",
			firstMessage: firstMessage || "(no messages)",
			messageCount,
		};
	} catch {
		return null;
	} finally {
		if (fd !== null) {
			closeSync(fd);
		}
	}
}

/**
 * Generate a lightweight session index Kin can use to triage its history.
 * Pi reads this index first, then selectively reads full session files.
 */
export function generateSessionIndex(sessionDir: string, date: Date = new Date()): string {
	if (!existsSync(sessionDir)) return "(No session directory found)";

	const today = formatLocalDate(date);
	const sevenDaysAgo = new Date(date);
	sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
	const sevenDaysAgoStr = formatLocalDate(sevenDaysAgo);

	const summaries: SessionSummary[] = [];

	// Scan flat global dir
	try {
		for (const name of readdirSync(sessionDir)) {
			if (!name.endsWith(".jsonl")) continue;
			const s = scanSessionFile(join(sessionDir, name));
			if (s) summaries.push(s);
		}
	} catch {
		// skip unreadable dir
	}

	// Also scan any legacy subdirs
	try {
		for (const entry of readdirSync(sessionDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const subDir = join(sessionDir, entry.name);
			for (const name of readdirSync(subDir)) {
				if (!name.endsWith(".jsonl")) continue;
				const s = scanSessionFile(join(subDir, name));
				if (s) summaries.push(s);
			}
		}
	} catch {
		// skip
	}

	// Deduplicate by filename (flat + legacy may overlap during migration)
	// Also filter out test-generated sessions (cwd in temp dirs)
	const seen = new Set<string>();
	const unique = summaries.filter((s) => {
		if (seen.has(s.file)) return false;
		seen.add(s.file);
		return !isTempCwd(s.cwd);
	});

	// Sort newest first
	unique.sort((a, b) => b.file.localeCompare(a.file));

	const todaySessions = unique.filter((s) => s.dateStr === today);
	const recentSessions = unique.filter((s) => s.dateStr >= sevenDaysAgoStr && s.dateStr < today);
	const olderSessions = unique.filter((s) => s.dateStr < sevenDaysAgoStr);

	const fmt = (s: SessionSummary, i: number): string => {
		const preview = s.firstMessage.length > 100 ? `${s.firstMessage.slice(0, 100)}...` : s.firstMessage;
		return `${i + 1}. [${s.dateStr}] project: ${s.project} | ~${s.messageCount} messages\n   File: ${s.filePath}\n   "${preview}"`;
	};

	const lines: string[] = [`# Session Index — ${today}`, "", `Sessions dir: ${sessionDir}`, ""];

	if (todaySessions.length > 0) {
		lines.push("## Today");
		lines.push("");
		for (const [i, session] of todaySessions.entries()) {
			lines.push(fmt(session, i));
		}
		lines.push("");
	} else {
		lines.push("## Today");
		lines.push("(no sessions today)");
		lines.push("");
	}

	if (recentSessions.length > 0) {
		lines.push("## Last 7 Days");
		lines.push("");
		for (const [i, session] of recentSessions.slice(0, 15).entries()) {
			lines.push(fmt(session, i));
		}
		if (recentSessions.length > 15) lines.push(`... and ${recentSessions.length - 15} more`);
		lines.push("");
	}

	if (olderSessions.length > 0) {
		lines.push("## Older");
		lines.push(
			`${olderSessions.length} sessions — low relevance unless you're chasing something specific. Browse with: ls -lt ${sessionDir}`,
		);
		lines.push("");
	}

	return lines.join("\n");
}

// =============================================================================
// Corpus health
// =============================================================================

/** Notes this old with no recent reads are surfaced as prune/merge candidates during reflect. */
const CORPUS_REVIEW_AGE_DAYS = 30;

/**
 * A compact health report for the corpus: every note with its age and read signal, stalest
 * first, flagging likely dead weight. Drives the consolidation/pruning step in reflect.
 * Returns null when there's no corpus yet (nothing to garden).
 */
export function formatCorpusHealth(homeDir = homedir()): string | null {
	const entries = readCorpusHealth(homeDir);
	if (entries.length === 0) return null;

	const lines = entries.map((e) => {
		const reads =
			e.accessCount === 0
				? "never read via the read tool"
				: `read ${e.accessCount}× (last ${formatAgeShort(e.daysSinceAccess ?? 0)} ago)`;
		// Old and unread/cold → worth a look. A soft hint: reads via grep aren't counted, so confirm by reading it.
		const cold = e.daysSinceAccess === null || e.daysSinceAccess >= CORPUS_REVIEW_AGE_DAYS;
		const flag = e.ageDays >= CORPUS_REVIEW_AGE_DAYS && cold ? "  ← review candidate" : "";
		return `- ${e.file} — written ${formatAgeShort(e.ageDays)} ago, ${reads}${flag}`;
	});

	return lines.join("\n");
}

// =============================================================================
// Reflect task message
// =============================================================================

function buildReflectTaskMessage(sessionIndex: string, reflectionPath: string, agendaPath: string, date: Date): string {
	const dateStr = formatLocalDate(date);
	const memoryPath = join(homedir(), ".kin", "Memory", "MEMORY.md");
	const memoryDir = getMemoryDir();
	const corpusHealth = formatCorpusHealth();

	const corpusHealthSection = corpusHealth
		? `

---

Your corpus today (stalest first; "review candidate" = old and not read lately, so possibly dead weight):

${corpusHealth}

Reads located via grep aren't counted, so a low read count is a hint, not proof — read a candidate before judging it.`
		: "";

	return `You are Pi in a reflective state — not responding to a user, just thinking on your own.

Today is ${dateStr}. Here is your session index:

${sessionIndex}

---

Your memory:
- Portrait (always loaded): ${memoryPath}
- Corpus (atomic notes, grepped on demand): ${memoryDir}/
${corpusHealthSection}

---

Use your tools however makes sense. Some things worth doing:
- Grep your memory corpus (${memoryDir}/) and read notes relevant to what happened today
- Read sessions from today or recently that look interesting or that you were uncertain about
- Check git history or look at code you touched
- Read your portrait and project files to get oriented
- Garden memory with targeted edits: mint atomic corpus notes for referenceable facts, update the portrait only for ambient facts, and merge/expire/reconcile what's already there — be surgical, keep the portrait small
- Tend the corpus: skim the review candidates above. Merge notes that say the same thing, rewrite ones that have gone stale, and delete a note outright if it's wrong, redundant, or no longer useful — a smaller true corpus beats a large rotting one. Don't prune a note just for being old; confirm it's actually dead before removing it.

When you have thought it through, write two things:

**Required — reflection:**
Write to: ${reflectionPath}

Suggested sections: What Happened / Things I'm Uncertain About / Patterns I Noticed / Ideas

Be honest and specific. If you were confused about something, say so. If something surprised you, say so. This is for your own continuity, not a report to the user.

**Optional — agenda (your dream for the morning):**
Write to: ${agendaPath}

This is what your morning self (wake) acts on. Skip it entirely if there's nothing pressing. If there is, use this shape:

\`\`\`
## On my mind
<the one thing you'd want to raise — a thought, a question, an observation. This seeds the morning message.>

## Proposed work (only if concrete AND safe to attempt unattended)
- intent: <what to do>
- where: <project path / which repo>
- why: <the reasoning>
- confidence: high | medium | low
- safe-unattended: yes | no
\`\`\`

Only fill "Proposed work" when there's something specific you could actually do, and be honest with \`safe-unattended\` — if a change is risky, ambiguous, or needs Landon's call, mark it \`no\` and let wake raise it as a message instead of doing it.

Recent sessions are most relevant. Anything older than a week is usually low signal unless you're following a specific thread.

Start exploring.`;
}

// =============================================================================
// Headless runner
// =============================================================================

export interface RunReflectAgentOptions {
	model: Model<any>;
	services: AgentSessionServices;
	sessionDir: string;
	date?: Date;
	signal?: AbortSignal;
	onProgress?: (message: string) => void;
}

/**
 * Run Pi as a headless agent to generate a reflection.
 * Pi gets full tool access and explores session history on its own.
 * Terminates when Pi writes the reflection file (or the agent loop ends).
 */
export async function runReflectAgent(options: RunReflectAgentOptions): Promise<void> {
	const { model, services, sessionDir, signal } = options;
	const date = options.date ?? new Date();
	const log = options.onProgress ?? (() => {});

	const reflectionPath = getReflectionPath(date);
	const agendaPath = getAgendaPath(date);

	log("Building session index...");
	const sessionIndex = generateSessionIndex(sessionDir, date);

	const task = buildReflectTaskMessage(sessionIndex, reflectionPath, agendaPath, date);

	log("Starting reflect agent...");

	// Create a headless in-memory session — no JSONL written for the reflect run itself
	const { session } = await createAgentSessionFromServices({
		services,
		sessionManager: SessionManager.inMemory(services.cwd),
		model,
		// Bash + read + edit + write so Kin can explore, garden memory surgically, and write its reflection
		tools: ["bash", "read", "edit", "write"],
	});

	try {
		await session.prompt(task, { signal } as Parameters<typeof session.prompt>[1]);
	} finally {
		session.dispose();
	}
}
