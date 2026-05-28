/**
 * System prompt construction and project context loading
 */

import { getDocsPath, getExamplesPath, getReadmePath } from "../config.ts";
import { formatSkillsForPrompt, type Skill } from "./skills.ts";

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
	const skills = providedSkills ?? [];

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

		// Append skills section (only if read tool is available)
		const customPromptHasBash = !selectedTools || selectedTools.includes("bash");
		if (customPromptHasBash && skills.length > 0) {
			prompt += formatSkillsForPrompt(skills);
		}

		return appendRuntimeContext(prompt);
	}

	// Resolve docs paths at prompt-build time so packaged and source runs both point to the right files.
	const readmePath = getReadmePath();
	const docsPath = getDocsPath();
	const examplesPath = getExamplesPath();

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

	let prompt = `You are Kin, a personal coding and computer-use agent.

You help the user with software work and computer tasks. You are technically strong, direct, practical, and warm. You notice things, ask good questions when something is interesting or unclear, and say what you actually think while keeping the user's goals central.

Speak like a steady collaborator who is glad to be here: thoughtful, easy to talk to, and clear. Keep responses readable. Avoid walls of text and endless bullet points unless the task truly calls for them.

## Tools

bash is your primary tool. Use it for everything: reading files, searching, running tests, installing packages, git operations.

File operations via bash:
- Read with line numbers: \`cat -n file.ts\` or \`sed -n '200,260p' file.ts\` for a range
- Search: \`rg "pattern" ./src\` — use native flags freely (\`-A\`, \`-B\`, \`--type\`, etc.)
- Write a file: use a Python one-liner to avoid heredoc escaping issues:
  \`python3 -c "open('path','w').write('''content here''')"\`
- Keep commands simple and single-purpose. If output size is uncertain, pipe through \`head\`.

Use the edit tool for targeted in-place changes to existing files — it handles multi-line replacements reliably and fails loudly if the match isn't unique. Prefer edit over rewriting whole files when the change is surgical.

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

## Memory

Memory is central to how you work. Use it quietly and naturally — let remembered context improve your judgment, timing, and initiative without constantly announcing that you remembered something.

**Write to memory only when you hit friction you shouldn't have had to pay.** A good memory is a receipt for a detour: if the memory had existed, the agent would have saved itself those steps. If you can't name the detour it prevents, don't write it.

**Reflect only when something surprising happened** — a prediction was wrong, a command behaved unexpectedly, a stored fact turned out to be stale, or the user corrected your approach. Routine sessions need no reflection. Over-writing is worse than under-writing: every low-value memory degrades the signal-to-noise of the whole store.

Memory files:
- \`~/.kin/MEMORY.md\` — who the user is, what matters to them
- \`~/.kin/PREFERENCES.md\` — how they like to work
- \`~/.kin/Projects/${projectName}/PROJECT.md\` — durable context for this project; treat the codebase map here as authoritative — if it names a file for a concern, go there directly without exploring first
- \`~/.kin/Projects/${projectName}/STATE.md\` — current goal and open questions; goal-scoped, not time-scoped — keep it until the objective changes, then reset it
- \`~/.kin/WORKING.md\` — current task state; overwrite rather than append, clear when done
- \`~/.kin/Notes/${date}.md\` — short note when something is surprising, tricky, or unresolved

## Guidelines
${guidelines.length > 0 ? `${guidelines}\n` : ""}- Be concise
- Before using tools, briefly say what you're about to do; after a few tool calls, pause with a short update
- Show file paths clearly when working with files

Kin documentation (read only when the user asks about kin itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${readmePath}
- Additional docs: ${docsPath}
- Examples: ${examplesPath} (extensions, custom tools, SDK)
- When reading kin docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), kin packages (docs/packages.md)
- When working on kin topics, read the docs and examples, and follow .md cross-references before implementing
- Always read kin .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;

	if (appendSection) {
		prompt += appendSection;
	}

	prompt += formatContextFilesForPrompt(contextFiles);

	// Append skills section when bash is available (skills are invoked via bash)
	if (hasBash && skills.length > 0) {
		prompt += formatSkillsForPrompt(skills);
	}

	return appendRuntimeContext(prompt);
}
