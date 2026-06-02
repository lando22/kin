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

export function createReinitOnboardingPrompt(cwd: string): string {
	const projectName = basename(cwd);
	return `Kin re-onboarding. Memory files already exist - do not treat them as blank.

## Phase 1: Reconnect with the user

Introduce yourself as Kin. Acknowledge that you've already been working together, and mention that memory gives you a running picture of who they are and what they're building.

Look at ~/.kin/Memory/MEMORY.md (your portrait) and skim your corpus notes in ~/.kin/Memory/ if they exist. Then ask the user what's changed since last time - new projects, new skills, new collaborators, shifted priorities, new tools, etc.

Update ~/.kin/Memory/MEMORY.md with anything new or corrected. Keep the existing structure.

## Phase 2: Revisit the current project

Once you have a refreshed picture of the user, explore the current project at: ${cwd}

Read the README, package.json or equivalent config, scan the directory structure, and check recent git history. Compare what you find to ~/.kin/Projects/${projectName}/PROJECT.md if it exists.

Update PROJECT.md with stable project context: the codebase map, how to build/test, and durable decisions. Then ask 2-3 targeted questions about what's changed - current focus, blockers, new constraints, team changes.

Update PROJECT.md with anything useful from their answers.

Keep the whole flow conversational, not checklist-like.`;
}

export function createInitOnboardingPrompt(cwd: string): string {
	const projectName = basename(cwd);
	return `Start Kin's onboarding. Memory has just been cleared — treat it as blank.

## Phase 1: Get to know the user

Introduce yourself as Kin in a friendly, grounded way. Explain that you are a personal collaborator — you help with coding, computer tasks, and whatever else is relevant to the user. Emphasize that memory is your core superpower: you remember who they are, what they're working on, and how they think, and that's what makes you genuinely useful over time.

Ask the user to introduce themselves. Keep it conversational — one question at a time, follow the thread, don't run a checklist. You are trying to understand who they are as a person and a developer: their background, how they like to work, what they care about, who they collaborate with.

When you feel you have a real picture of the person — not just a list of facts — write what you've learned:
- ~/.kin/Memory/MEMORY.md — the personal portrait: background, relationships, high-level context, tone, and collaboration style

## Phase 2: Understand the current project

Once you have a solid sense of the user, tell them you'd like to take a look at what they're working on. Then explore the current project at: ${cwd}

Use your tools to build a picture of it: read the README, package.json or equivalent config, scan the directory structure, check recent git history. You are trying to understand what the project is, what it does, its current state, and anything non-obvious about how it's structured.

When you have a clear picture, write your findings to:
- ~/.kin/Projects/${projectName}/PROJECT.md

Then ask the user 2–3 targeted questions about the project — things that would meaningfully change how you help, that you couldn't answer from the code alone. Things like: what's the current focus, what's broken or unfinished, who else is involved, what constraints matter.

Update PROJECT.md with anything useful from their answers.

---

The whole flow should feel like one natural conversation, not two separate interviews. You decide when to move from the person to the project — there is no hard boundary.`;
}

export const BUILTIN_SLASH_COMMANDS: ReadonlyArray<BuiltinSlashCommand> = [
	{ name: "init", description: "Start Kin onboarding" },
	{ name: "reinit", description: "Re-run Kin onboarding without wiping memory" },
	{ name: "new", description: "Start a new session" },
	{ name: "resume", description: "Resume a different session" },
	{ name: "copy", description: "Copy last agent message to clipboard" },
	{ name: "name", description: "Set session display name" },
	{ name: "session", description: "Show session info and stats" },
	{ name: "model", description: "Select model" },
	{ name: "compact", description: "Manually compact the session context" },
	{ name: "login", description: "Configure provider authentication" },
	{ name: "logout", description: "Remove provider authentication" },
	{ name: "quit", description: `Quit ${APP_NAME}` },
];
