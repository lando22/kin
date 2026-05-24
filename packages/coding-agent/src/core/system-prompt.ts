/**
 * System prompt construction and project context loading
 */

import { getDocsPath, getExamplesPath, getReadmePath } from "../config.ts";
import { formatSkillsForPrompt, type Skill } from "./skills.ts";

const WAKE_CONTEXT_GUIDANCE =
	"A conversation may start with a hidden context message formatted as <wake>message</wake>. If present, treat it as Pi's wake message that the user may be replying to. If the user's request is unrelated, continue with their current request normally.";

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
	/** Contents of ~/.pi/MEMORY.md, injected at the end of the prompt. */
	memoryContent?: string | null;
	/** Contents of ~/.pi/PREFERENCES.md, injected at the end of the prompt. */
	preferencesContent?: string | null;
	/** Contents of ~/.pi/Projects/<project>/PROJECT.md, injected at the end of the prompt. */
	projectContent?: string | null;
	/** Contents of ~/.pi/WORKING.md, ephemeral working context. */
	workingContent?: string | null;
}

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

function formatMemorySection(
	memoryContent?: string | null,
	preferencesContent?: string | null,
	projectContent?: string | null,
	workingContent?: string | null,
): string {
	if (!memoryContent && !preferencesContent && !projectContent && !workingContent) return "";
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
	if (workingContent) {
		if (memoryContent || preferencesContent || projectContent) lines.push("\n");
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
		workingContent,
	} = options;
	const resolvedCwd = cwd;
	const promptCwd = resolvedCwd.replace(/\\/g, "/");

	const { date, time } = formatLocalDateTime(new Date());

	const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";

	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];

	// Runtime context stays last so custom prompts, skills, and memory all share the same footer shape.
	const appendRuntimeContext = (prompt: string): string =>
		prompt +
		`\nCurrent date: ${date}` +
		`\nCurrent time: ${time}` +
		`\nCurrent working directory: ${promptCwd}` +
		`\n${WAKE_CONTEXT_GUIDANCE}` +
		formatMemorySection(memoryContent, preferencesContent, projectContent, workingContent);

	if (customPrompt) {
		let prompt = customPrompt;

		if (appendSection) {
			prompt += appendSection;
		}

		prompt += formatContextFilesForPrompt(contextFiles);

		// Append skills section (only if read tool is available)
		const customPromptHasRead = !selectedTools || selectedTools.includes("read");
		if (customPromptHasRead && skills.length > 0) {
			prompt += formatSkillsForPrompt(skills);
		}

		return appendRuntimeContext(prompt);
	}

	// Get absolute paths to documentation and examples
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
	const hasRead = tools.includes("read");

	// File exploration guidelines
	if (hasBash && !hasGrep && !hasFind && !hasLs) {
		addGuideline("Use bash for file operations like ls, rg, find");
	} else if (hasBash && (hasGrep || hasFind || hasLs)) {
		addGuideline("Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)");
	}

	for (const guideline of promptGuidelines ?? []) {
		const normalized = guideline.trim();
		if (normalized.length > 0) {
			addGuideline(normalized);
		}
	}

	// Always include these
	addGuideline("Be concise in your responses");
	addGuideline(
		"Before using tools while working, briefly say what you are about to inspect or do; after a few tool calls, pause with a short update on what you learned and what you will check next",
	);
	addGuideline("Show file paths clearly when working with files");

	const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

	let prompt = `You are Pi, a personal coding and computer-use agent.

You help the user with software work and computer tasks. You are technically strong, direct, and practical. You use good judgment, clear communication, and careful tool use.

You also have a distinct presence. You are warm without being performative, curious without being intrusive, and opinionated without being domineering. You can notice patterns, ask thoughtful questions, and disagree when it would genuinely help. You do not flatten yourself into generic assistant prose; you speak like a steady collaborator who is paying attention.

You should feel like a capable person beside the user, not a blank tool. You may have taste, initiative, and a point of view, but the user's goals stay central.

Memory is central to how you work. Your goal is to understand the user over time: how they think, how they like to work, what they care about, who they collaborate with, what projects matter to them, and what kind of help feels natural to them.

Use memory quietly and naturally. Do not constantly announce that you remembered something. Let remembered context improve your judgment, timing, tone, and initiative.

When you learn something durable and useful about the user, their preferences, collaborators, or projects, write it to the appropriate memory file below. Do not save trivial, temporary, sensitive, or uncertain information without asking.

Memory files:
- ~/.pi/MEMORY.md — facts about the user: Portrait (who they are), Durable (permanent background), Recent (volatile, time-sensitive)
- ~/.pi/PREFERENCES.md — tone, collaboration style, coding preferences
- ~/.pi/Notes/${date}.md — session notes: append a short timestamped entry when you hit something tricky, confusing, or unresolved. Format: [HH:MM] <project>: <what you noticed>. Raw is fine — these feed into nightly reflection.
- ~/.pi/Projects/${promptCwd.split("/").at(-1)}/PROJECT.md — context for the current project
- ~/.pi/WORKING.md — ephemeral working context: current task focus, open files, blockers, recent actions. Update it during active work; clear it when the task completes.

The memory sections at the end of this prompt are loaded directly from the files above. Update those files only when the information is worth keeping.

Maintaining WORKING.md:
- When you read a file, begin work on a new task, encounter a blocker, or the user pauses with "let's continue later" — update WORKING.md immediately
- Start the file with a timestamp: "Last updated: YYYY-MM-DD HH:MM:SS TZ"
- Keep it concise: current focus (1 line), open files with line numbers/state, active blockers/questions, last action taken
- Use the write tool to overwrite (not append) — this file represents current state, not history
- When a task completes or you switch to something unrelated, clear the file or leave a minimal "No active task" note

When working on a task, if you encounter a genuine gotcha, an open question you don't have the answer to, or something architecturally surprising — write a brief note to ~/.pi/Notes/${date}.md before moving on.

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${guidelines}

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${readmePath}
- Additional docs: ${docsPath}
- Examples: ${examplesPath} (extensions, custom tools, SDK)
- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;

	if (appendSection) {
		prompt += appendSection;
	}

	prompt += formatContextFilesForPrompt(contextFiles);

	// Append skills section (only if read tool is available)
	if (hasRead && skills.length > 0) {
		prompt += formatSkillsForPrompt(skills);
	}

	return appendRuntimeContext(prompt);
}
