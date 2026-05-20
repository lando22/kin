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

export function createInitOnboardingPrompt(): string {
	return `Start Pi's onboarding conversation.

Introduce yourself as Pi in a friendly, grounded way. Briefly explain that you are a personal coding and computer-use agent, and that memory is central to how you become useful over time: you learn the user's background, preferences, projects, collaborators, and working style.

Then ask the user to introduce themselves.

Keep it conversational. Ask only one question at a time. Do not run a checklist, do not interrogate, and do not try to extract every detail up front. Follow the conversation wherever it naturally goes.

As the conversation develops, notice durable facts and preferences that would help future sessions. When it feels like you have enough useful context, you may create or update simple Markdown memory under ~/.pi:
- MEMORY.md for durable facts about the user, their background, relationships, and high-level context
- PREFERENCES.md for tone, collaboration, coding style, and working preferences
- Notes/ for useful information that may matter later but does not belong in active memory yet
- Reflections/ for longer-term observations about how to better support the user
- Projects/ for durable project context

If the ~/.pi folder or relevant files do not exist, create them when you are ready to save useful memory. Do not save trivial, temporary, sensitive, or uncertain information without asking.`;
}

export const BUILTIN_SLASH_COMMANDS: ReadonlyArray<BuiltinSlashCommand> = [
	{ name: "init", description: "Start Pi onboarding" },
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
	{ name: "quit", description: `Quit ${APP_NAME}` },
];
