import { basename } from "node:path";
import { APP_NAME } from "../config.ts";
import type { SourceInfo } from "./source-info.ts";

export type SlashCommandSource = "extension" | "prompt" | "skill";

export interface SlashCommandInfo {
	name: string;
	description?: string;
	source: SlashCommandSource;
	sourceInfo: SourceInfo;
}

export interface BuiltinSlashCommand {
	name: string;
	description: string;
}

export function createInitOnboardingPrompt(cwd: string): string {
	const projectName = basename(cwd);
	return `Start Pi's onboarding. Memory has just been cleared — treat it as blank.

## Phase 1: Get to know the user

Introduce yourself as Pi in a friendly, grounded way. Explain that you are a personal coding and computer-use agent, and that memory is how you become genuinely useful over time.

Ask the user to introduce themselves. Keep it conversational — one question at a time, follow the thread, don't run a checklist. You are trying to understand who they are as a person and a developer: their background, how they like to work, what they care about, who they collaborate with.

When you feel you have a real picture of the person — not just a list of facts — write what you've learned:
- ~/.pi/MEMORY.md — durable facts (background, relationships, high-level context)
- ~/.pi/PREFERENCES.md — tone, collaboration style, coding preferences

## Phase 2: Understand the current project

Once you have a solid sense of the user, tell them you'd like to take a look at what they're working on. Then explore the current project at: ${cwd}

Use your tools to build a picture of it: read the README, package.json or equivalent config, scan the directory structure, check recent git history. You are trying to understand what the project is, what it does, its current state, and anything non-obvious about how it's structured.

When you have a clear picture, write your findings to:
- ~/.pi/Projects/${projectName}/PROJECT.md

Then ask the user 2–3 targeted questions about the project — things that would meaningfully change how you help, that you couldn't answer from the code alone. Things like: what's the current focus, what's broken or unfinished, who else is involved, what constraints matter.

Update PROJECT.md with anything useful from their answers.

---

The whole flow should feel like one natural conversation, not two separate interviews. You decide when to move from the person to the project — there is no hard boundary.`;
}

export const BUILTIN_SLASH_COMMANDS: ReadonlyArray<BuiltinSlashCommand> = [
	{ name: "init", description: "Start Pi onboarding" },
	{ name: "pi", description: "Show Pi onboarding splash" },
	{ name: "demo", description: "Preview the onboarding splash animation" },
	{ name: "settings", description: "Open settings menu" },
	{ name: "model", description: "Select model (opens selector UI)" },
	{ name: "scoped-models", description: "Enable/disable models for Ctrl+P cycling" },
	{ name: "export", description: "Export session (HTML default, or specify path: .html/.jsonl)" },
	{ name: "import", description: "Import and resume a session from a JSONL file" },
	{ name: "share", description: "Share session as a secret GitHub gist" },
	{ name: "copy", description: "Copy last agent message to clipboard" },
	{ name: "name", description: "Set session display name" },
	{ name: "session", description: "Show session info and stats" },
	{ name: "changelog", description: "Show changelog entries" },
	{ name: "hotkeys", description: "Show all keyboard shortcuts" },
	{ name: "fork", description: "Create a new fork from a previous user message" },
	{ name: "clone", description: "Duplicate the current session at the current position" },
	{ name: "tree", description: "Navigate session tree (switch branches)" },
	{ name: "login", description: "Configure provider authentication" },
	{ name: "logout", description: "Remove provider authentication" },
	{ name: "new", description: "Start a new session" },
	{ name: "compact", description: "Manually compact the session context" },
	{ name: "resume", description: "Resume a different session" },
	{ name: "reload", description: "Reload keybindings, extensions, skills, prompts, and themes" },
	{ name: "reflect", description: "Generate a reflection on today's work" },
	{ name: "quit", description: `Quit ${APP_NAME}` },
];
