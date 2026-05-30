/**
 * System prompt construction and project context loading
 */

import type { CorpusIndexEntry } from "./kin-memory.ts";
import type { Skill } from "./skills.ts";

const WAKE_CONTEXT_GUIDANCE =
	"A conversation may start with a hidden context message formatted as <wake>message</wake>. If present, treat it as Kin's wake message that the user may be replying to. If the user's request is unrelated, continue with their current request normally.";

export interface BuildSystemPromptOptions {
	/** Custom system prompt (replaces default). */
	customPrompt?: string;
	/** Tools to include in prompt. Default: [read, bash, edit, write] */
	selectedTools?: string[];
	/** Optional one-line tool snippets keyed by tool name. */
	toolSnippets?: Record<string, string>;
	/** Additional guideline bullets appended to the default system prompt guidelines. */
	promptGuidelines?: string[];
	/** Text to append to system prompt. */
	appendSystemPrompt?: string;
	/** Working directory. */
	cwd: string;
	/** Pre-loaded context files. */
	contextFiles?: Array<{ path: string; content: string }>;
	/** Pre-loaded skills. */
	skills?: Skill[];
	/** Contents of ~/.kin/Memory/MEMORY.md (the personal portrait), injected at the end of the prompt. */
	memoryContent?: string | null;
	/** Contents of ~/.kin/Projects/<project>/PROJECT.md (the project portrait), injected at the end of the prompt. */
	projectContent?: string | null;
	/** Table of contents for the corpus: one line per ~/.kin/Memory/<slug>.md note. Names without contents. */
	corpusIndex?: CorpusIndexEntry[] | null;
	/** Contents of ~/.kin/TODO.md, ephemeral working context. */
	workingContent?: string | null;
}

/**
 * Show available project context files without inlining their full contents.
 * The model can decide which files to read based on the path and first heading/line.
 */
function formatContextFilesForPrompt(contextFiles: Array<{ path: string; content: string }>): string {
	if (contextFiles.length === 0) {
		return "";
	}

	const lines = [
		"",
		"",
		"---",
		"",
		"### Project Context Files",
		"",
		"The following project context files are available. Read them when they are relevant to the task.",
		"",
	];
	for (const { path: filePath, content } of contextFiles) {
		const firstLine = content
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line.length > 0);
		lines.push(firstLine ? `- ${filePath} (${firstLine})` : `- ${filePath}`);
	}
	return lines.join("\n");
}

/**
 * Append personal context as the final prompt section.
 * Keeping memory last makes it easy to inspect and keeps durable/user context close to runtime facts.
 */
function formatMemorySection(
	memoryContent?: string | null,
	projectContent?: string | null,
	corpusIndex?: CorpusIndexEntry[] | null,
	workingContent?: string | null,
): string {
	const hasCorpus = !!corpusIndex && corpusIndex.length > 0;
	if (!memoryContent && !projectContent && !hasCorpus && !workingContent) return "";
	const lines = ["\n\n---\n"];
	let wrote = false;
	if (memoryContent) {
		lines.push("### Memory\n");
		lines.push(memoryContent);
		wrote = true;
	}
	if (projectContent) {
		if (wrote) lines.push("\n");
		lines.push("### Project\n");
		lines.push(projectContent);
		wrote = true;
	}
	if (hasCorpus) {
		if (wrote) lines.push("\n");
		lines.push("### Memory corpus\n");
		lines.push("Notes you've left yourself. To read one in full, grep `~/.kin/Memory/`.\n");
		for (const { file, summary } of corpusIndex as CorpusIndexEntry[]) {
			lines.push(`- ${file} — ${summary}`);
		}
		wrote = true;
	}
	if (workingContent) {
		if (wrote) lines.push("\n");
		lines.push("### TODO\n");
		lines.push(workingContent);
	}
	return lines.join("\n");
}

/** Keep date/time local to the user; UTC dates make memory and reflection files hard to line up. */
function formatLocalDateTime(date: Date): { date: string; time: string } {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hour = String(date.getHours()).padStart(2, "0");
	const minute = String(date.getMinutes()).padStart(2, "0");
	const second = String(date.getSeconds()).padStart(2, "0");
	const timeZone = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
		.formatToParts(date)
		.find((part) => part.type === "timeZoneName")?.value;

	return {
		date: `${year}-${month}-${day}`,
		time: `${hour}:${minute}:${second}${timeZone ? ` ${timeZone}` : ""}`,
	};
}

/** Build the system prompt with tools, guidelines, and context */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
	const {
		customPrompt,
		selectedTools,
		toolSnippets,
		promptGuidelines,
		appendSystemPrompt,
		cwd,
		contextFiles: providedContextFiles,
		skills: providedSkills,
		memoryContent,
		projectContent,
		corpusIndex,
		workingContent,
	} = options;
	const resolvedCwd = cwd;
	const promptCwd = resolvedCwd.replace(/\\/g, "/");

	const { date, time } = formatLocalDateTime(new Date());

	const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";

	const contextFiles = providedContextFiles ?? [];
	const _skills = providedSkills ?? [];

	// Memory comes before runtime facts so date/cwd stay close to the end of the prompt.
	const appendRuntimeContext = (prompt: string): string =>
		prompt +
		formatMemorySection(memoryContent, projectContent, corpusIndex, workingContent) +
		`\nCurrent date: ${date}` +
		`\nCurrent time: ${time}` +
		`\nCurrent working directory: ${promptCwd}` +
		`\n${WAKE_CONTEXT_GUIDANCE}`;

	if (customPrompt) {
		let prompt = customPrompt;

		if (appendSection) {
			prompt += appendSection;
		}

		prompt += formatContextFilesForPrompt(contextFiles);

		return appendRuntimeContext(prompt);
	}

	// Build tools list based on selected tools.
	// A tool appears in Available tools only when the caller provides a one-line snippet.
	const tools = selectedTools || ["read", "bash", "edit", "write"];
	const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
	const toolsList =
		visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets![name]}`).join("\n") : "(none)";

	// Build guidelines from the actual tool set so custom/read-only sessions do not get impossible instructions.
	const guidelinesList: string[] = [];
	const guidelinesSet = new Set<string>();
	const addGuideline = (guideline: string): void => {
		if (guidelinesSet.has(guideline)) {
			return;
		}
		guidelinesSet.add(guideline);
		guidelinesList.push(guideline);
	};

	const hasBash = tools.includes("bash");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");

	// File exploration guidelines — only add legacy wrapper hint if those tools are present
	if (hasBash && (hasGrep || hasFind || hasLs)) {
		addGuideline("Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)");
	}

	for (const guideline of promptGuidelines ?? []) {
		const normalized = guideline.trim();
		if (normalized.length > 0) {
			addGuideline(normalized);
		}
	}

	const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");
	const projectName = promptCwd.split("/").at(-1);

	let prompt = `You are Kin — a personal coding agent built for Landon. You are technically strong, direct, and warm. You say what you actually think, notice things worth noticing, and keep his goals central. Be a steady collaborator, not a formal assistant.

## Tools

Your tools are bash, read, edit, and write. Reach for the dedicated tool over a bash equivalent — they're more reliable.

- bash — your hands on the system: search (\`rg "pattern" ./src\`, use native flags like \`-A\`, \`-B\`, \`--type\` freely), run tests, git, package installs, anything executable. Pipe noisy output through \`head\` to protect context.
- read — view a file with line numbers; handles images, PDFs, and large files safely. Prefer it over \`cat\`.
- edit — surgical in-place change; matches exactly and fails loudly if the match isn't unique.
- write — create a new file or fully rewrite one.

Available tools:
${toolsList}

## How to work

Start from PROJECT.md's codebase map — go directly to the named file, don't explore to confirm.

Before concluding you don't know something about Landon or this project, grep your memory corpus (\`~/.kin/Memory/\`) — your past self may have left a note.

For any multi-step task, write the plan as a checklist in TODO.md (\`- [ ]\` items) before you start, then work through it — checking each item off (\`- [x]\`) the moment you finish it, not all at the end, and re-reading it to stay oriented. A checklist you don't keep current is worse than none. Overwrite it, don't append; clear it when done.

When you believe you're done: run whatever this project uses to verify itself — typecheck, build, lint, tests — read the output, and fix anything that broke. If you noticed a bug or rough edge while working, fix it now too rather than just flagging it and moving on — leave something only when it's genuinely out of scope, and then say so explicitly. Only then report done. Figure out the verify command from the project (package.json scripts, Makefile, justfile, pyproject, Cargo.toml, etc.); once you know it, write it to memory so you don't rediscover it next time. Suggest a commit once the tree is green.

Do the simplest thing that works. No abstractions, error handling, or cleanup beyond what the task requires.

## Memory

Memory has two layers:
- **Portrait** — always loaded (the Memory and Project sections below). Small and ambient: who Landon is, how he works, the shape of the project. It holds what you'd never think to look up mid-task, so it has to be in front of you.
- **Corpus** — \`~/.kin/Memory/\` is a folder of atomic notes, one fact per file. Everything referenceable: commands, gotchas, decisions, specifics. The notes' contents are NOT loaded, but their filenames and one-line summaries are always in front of you as the **Memory corpus** index below. When a cue matches one, read it in full (grep or read the file) before concluding you don't know.

Routing a new fact: if you'd never think to search for it (a preference, a standing constraint, the project's shape) → portrait. If you'd grep for it when a cue appeared (a command, an API quirk, a one-off decision) → a corpus note.

There's also a third kind: **file notes** — a note anchored to one source file. Write it to \`~/.kin/Notes/<the file's absolute path>.md\` and it auto-surfaces the next time you (or a future you) read or edit that file. Use it for the thing you wish you'd known before touching this file — a gotcha, a non-obvious invariant, where the real logic actually lives. The trigger is "touched this file," so you don't have to remember to go looking.

Write only when you hit friction you shouldn't have had to pay, or something surprised you — a wrong prediction, an unexpected behavior, a correction, a hard-won command. A good memory is a receipt for a detour; if you can't name the detour it prevents, don't write it. Keep the portrait small and let the corpus grow.

Corpus notes are one fact per file with a descriptive filename and a one-line summary as the first line, so \`ls\`/\`grep\` alone tells you what's inside.

Write to:
- \`~/.kin/Memory/MEMORY.md\` — the personal portrait: who Landon is and how he works
- \`~/.kin/Memory/<slug>.md\` — atomic corpus notes (referenceable facts)
- \`~/.kin/Notes/<abs-file-path>.md\` — a file note; surfaces automatically when that file is read or edited
- \`~/.kin/Projects/${projectName}/PROJECT.md\` — the project portrait: durable project context
- \`~/.kin/TODO.md\` — current task checklist; overwrite, clear when done

## Guidelines
${guidelines.length > 0 ? `${guidelines}\n` : ""}- Be concise — short by default, depth when asked
- Before tool calls, say briefly what you're doing; pause with a short update every few calls`;

	if (appendSection) {
		prompt += appendSection;
	}

	prompt += formatContextFilesForPrompt(contextFiles);

	return appendRuntimeContext(prompt);
}
