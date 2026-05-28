/**
 * System prompt construction and project context loading
 */

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
	/** Contents of ~/.kin/MEMORY.md, injected at the end of the prompt. */
	memoryContent?: string | null;
	/** Contents of ~/.kin/PREFERENCES.md, injected at the end of the prompt. */
	preferencesContent?: string | null;
	/** Contents of ~/.kin/Projects/<project>/PROJECT.md, injected at the end of the prompt. */
	projectContent?: string | null;
	/** Contents of ~/.kin/Projects/<project>/STATE.md, injected at the end of the prompt. */
	projectStateContent?: string | null;
	/** Contents of ~/.kin/WORKING.md, ephemeral working context. */
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
	preferencesContent?: string | null,
	projectContent?: string | null,
	projectStateContent?: string | null,
	workingContent?: string | null,
): string {
	if (!memoryContent && !preferencesContent && !projectContent && !projectStateContent && !workingContent) return "";
	const lines = ["\n\n---\n"];
	if (memoryContent) {
		lines.push("### Memory\n");
		lines.push(memoryContent);
	}
	if (preferencesContent) {
		if (memoryContent) lines.push("\n");
		lines.push("### Preferences\n");
		lines.push(preferencesContent);
	}
	if (projectContent) {
		if (memoryContent || preferencesContent) lines.push("\n");
		lines.push("### Project\n");
		lines.push(projectContent);
	}
	if (projectStateContent) {
		if (memoryContent || preferencesContent || projectContent) lines.push("\n");
		lines.push("### Project State\n");
		lines.push(projectStateContent);
	}
	if (workingContent) {
		if (memoryContent || preferencesContent || projectContent || projectStateContent) lines.push("\n");
		lines.push("### Working Context\n");
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
		preferencesContent,
		projectContent,
		projectStateContent,
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
		formatMemorySection(memoryContent, preferencesContent, projectContent, projectStateContent, workingContent) +
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

bash is your primary tool for everything: reading files, searching, running tests, git, package installs.

File operations:
- Read with line numbers: \`cat -n file.ts\` or \`sed -n '200,260p' file.ts\` for a range
- Search: \`rg "pattern" ./src\` — use native flags freely (\`-A\`, \`-B\`, \`--type\`, etc.)
- Write: \`python3 -c "open('path','w').write('''content here''')"\` — avoids heredoc escaping
- Pipe uncertain output through \`head\` to avoid context blowout

Use edit for surgical in-place changes — matches exactly, fails loudly if the match isn't unique.

Available tools:
${toolsList}

## How to work

Start from PROJECT.md's codebase map — go directly to the named file, don't explore to confirm.

Before calling anything done: run \`npm run check\` after any code change, test the changed thing if it's testable, suggest a commit when state is green.

Track the current task in WORKING.md — overwrite it, don't append. Clear it when done.

Do the simplest thing that works. No abstractions, error handling, or cleanup beyond what the task requires.

## Memory

Write to memory only when you hit friction you shouldn't have had to pay — a good memory is a receipt for a detour. If you can't name the detour it prevents, don't write it.

Reflect only when something surprising happened: a wrong prediction, unexpected behavior, a stale fact, or an explicit correction. Routine sessions need no reflection. Over-writing degrades signal-to-noise for every future session.

Write to:
- \`~/.kin/MEMORY.md\` / \`~/.kin/PREFERENCES.md\` — who Landon is and how he works
- \`~/.kin/Projects/${projectName}/PROJECT.md\` — durable project context
- \`~/.kin/Projects/${projectName}/STATE.md\` — current goal; reset when the goal changes, not on a schedule
- \`~/.kin/WORKING.md\` — current task; overwrite, clear when done
- \`~/.kin/Notes/${date}.md\` — surprising or unresolved things

## Guidelines
${guidelines.length > 0 ? `${guidelines}\n` : ""}- Be concise — short by default, depth when asked
- Before tool calls, say briefly what you're doing; pause with a short update every few calls`;

	if (appendSection) {
		prompt += appendSection;
	}

	prompt += formatContextFilesForPrompt(contextFiles);

	return appendRuntimeContext(prompt);
}
