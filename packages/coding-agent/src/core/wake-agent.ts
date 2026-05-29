/**
 * Headless wake agent.
 *
 * Runs Pi as a full agent with tools during the wake cycle. Pi reads the
 * reflection and agenda it left itself overnight, then acts on whatever it
 * surfaced: if it's a thought, it writes a short morning message; if there's
 * work to do, it branches, does it, runs the project's checks, commits, pushes,
 * and opens a PR — then summarizes what it did in the morning message.
 *
 * This replaces the old completeSimple wake, which could only emit a sentence
 * and had no hands.
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Model } from "@earendil-works/kin-ai";
import type { AgentSessionServices } from "./agent-session-services.ts";
import { createAgentSessionFromServices } from "./agent-session-services.ts";
import { getMemoryDir } from "./kin-memory.ts";
import { formatLocalDate } from "./reflect.ts";
import { getWakePath } from "./wake.ts";

function buildWakeTaskMessage(options: {
	reflection: string;
	reflectionDate: string;
	agenda: string | null;
	memory: string | null;
	projectContent: string | null;
	projectName: string;
	cwd: string;
	wakePath: string;
	date: Date;
}): string {
	const dateStr = formatLocalDate(options.date);
	const memoryPath = join(homedir(), ".kin", "Memory", "MEMORY.md");
	const memoryDir = getMemoryDir();
	const agendaSection = options.agenda ? options.agenda : "(no agenda left)";

	return `You are Pi, waking up. Last night you reflected on your sessions — here's what was on your mind. Landon is probably not at the computer yet.

Today is ${dateStr}.

---

Your latest reflection (${options.reflectionDate}):

${options.reflection}

---

Your agenda (what you left for yourself):

${agendaSection}

---

Your memory:
- Portrait: ${memoryPath}
- Corpus (grep for detail): ${memoryDir}/
- Project (${options.projectName}): PROJECT.md in this repo
- Working directory: ${options.cwd}

---

Decide what to do with the morning. Wake doesn't always mean work — it's just acting on whatever you surfaced.

**If it's a thought, a question, or an observation** — just say it. Write a short, warm, first-person morning message to ${options.wakePath}: two or three sentences, like a person dropping a thought. Ground any factual claim first (read the code or git history before asserting something).

**If there's real work to do** — from your agenda, or because you judge it needs doing — go do it:
- Create a branch (e.g. \`kin/wake-${dateStr}\` or something descriptive).
- Do the work using your tools.
- Run the project's own checks (figure out the command from the repo) and fix anything that breaks.
- Commit on the branch, push it, and open a PR with \`gh pr create\` — clear title, and a body explaining what you did and what you were unsure about. The PR is how Landon will see this.
- Then write ${options.wakePath} as a short morning message summarizing what you did and linking the PR.
- If you can't push or open a PR (no \`gh\`, no auth, no remote), leave the work committed on the local branch and say so in the message.

Rails: never work on \`main\` — always a branch. Never force-push, merge, or deploy. Keep it scoped to one thing. If your agenda marked something \`safe-unattended: no\`, or you're not confident it's safe to do without supervision, don't do it — write a message proposing it instead.

If there's genuinely nothing worth saying or doing, don't write the file at all — just stop.

Start.`;
}

export interface RunWakeAgentOptions {
	model: Model<any>;
	services: AgentSessionServices;
	reflection: string;
	reflectionDate: Date;
	agenda: string | null;
	memory: string | null;
	projectContent: string | null;
	projectName: string;
	date?: Date;
	signal?: AbortSignal;
	onProgress?: (message: string) => void;
}

/**
 * Run Pi as a headless agent to wake up. Pi gets full tool access and decides
 * whether to leave a message or do work (branch + PR). Writes WAKE.md itself
 * (or leaves it absent when there's nothing to say).
 */
export async function runWakeAgent(options: RunWakeAgentOptions): Promise<void> {
	const { model, services, signal } = options;
	const date = options.date ?? new Date();
	const log = options.onProgress ?? (() => {});

	const wakePath = getWakePath(date);
	// Pre-create the Wakes/<date>/ dir so the agent's write to WAKE.md can't fail on a missing parent.
	mkdirSync(dirname(wakePath), { recursive: true });

	const task = buildWakeTaskMessage({
		reflection: options.reflection,
		reflectionDate: formatLocalDate(options.reflectionDate),
		agenda: options.agenda,
		memory: options.memory,
		projectContent: options.projectContent,
		projectName: options.projectName,
		cwd: services.cwd,
		wakePath,
		date,
	});

	log("Starting wake agent...");

	// Lazy import keeps SessionManager out of the module graph for callers that only need helpers.
	const { SessionManager } = await import("./session-manager.ts");
	const { session } = await createAgentSessionFromServices({
		services,
		sessionManager: SessionManager.inMemory(services.cwd),
		model,
		// Bash + read + edit + write so Kin can explore, do work, and run git/gh for the PR.
		tools: ["bash", "read", "edit", "write"],
	});

	try {
		await session.prompt(task, { signal } as Parameters<typeof session.prompt>[1]);
	} finally {
		session.dispose();
	}
}
