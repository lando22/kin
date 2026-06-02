/**
 * Wake mode — standalone CLI command for `kin wake`.
 *
 * Bootstraps the services (settings, auth, model registry), reads the latest
 * reflection, generates a wake message via the LLM, and writes it to
 * ~/.kin/Wakes/<date>/WAKE.md if there's something worth saying.
 */

import { basename, join } from "node:path";
import type { Model } from "@landongarrison/kin-ai";
import chalk from "chalk";
import { getAgentDir } from "../config.ts";
import { createAgentSessionServices } from "../core/agent-session-services.ts";
import { AuthStorage } from "../core/auth-storage.ts";
import { readMemoryContent, readProjectContent } from "../core/kin-memory.ts";
import type { ModelRegistry } from "../core/model-registry.ts";
import { formatLocalDate, readAgenda } from "../core/reflect.ts";
import { SettingsManager } from "../core/settings-manager.ts";
import { findLatestReflection, getWakePath, readWake } from "../core/wake.ts";
import { runWakeAgent } from "../core/wake-agent.ts";

/** Run the wake mode and return an exit code. */
export async function runWakeMode(args: string[], { date }: { date?: Date } = {}): Promise<number> {
	// Allow --cwd flag
	const cwdIndex = args.indexOf("--cwd");
	const cwd = cwdIndex >= 0 && args[cwdIndex + 1] ? args[cwdIndex + 1] : process.cwd();
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.create(cwd, agentDir);

	// Create only the services needed to resolve auth/settings/models; wake generation does not need
	// extensions, skills, themes, prompt templates, or project context discovery.
	const services = await createAgentSessionServices({
		cwd,
		agentDir,
		authStorage: AuthStorage.create(join(agentDir, "auth.json")),
		settingsManager,
		resourceLoaderOptions: {
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
		},
	});

	// Report diagnostics
	if (services.diagnostics.length > 0) {
		for (const d of services.diagnostics) {
			const color = d.type === "error" ? chalk.red : d.type === "warning" ? chalk.yellow : chalk.dim;
			console.error(color(`[${d.type}] ${d.message}`));
		}
	}

	// Resolve model
	let model = await resolveWakeModel(services.settingsManager, services.modelRegistry);

	if (!model) {
		const available = services.modelRegistry.getAvailable();
		if (available.length > 0) {
			model = available[0];
			console.error(chalk.yellow(`No default model configured. Using ${model.provider}/${model.id}.`));
		} else {
			console.error(chalk.red("No models available. Configure a model first."));
			return 1;
		}
	}

	const showModel = `${model.provider}/${model.id}`;
	console.error(chalk.dim(`Waking using ${showModel}...`));

	// Wake is based on the latest available reflection, not necessarily today's.
	const latestReflection = findLatestReflection();
	if (!latestReflection) {
		console.error(chalk.yellow("No reflections found yet. Run `kin reflect` first."));
		return 0;
	}

	console.error(chalk.dim(`Found reflection from ${formatLocalDate(latestReflection.date)}.`));

	// Check if wake already exists
	const wakeDate = date ?? new Date();
	const existingWake = readWake(wakeDate);
	if (existingWake) {
		console.error(chalk.dim(`Existing wake found at ${getWakePath(wakeDate)}. Will overwrite.`));
	}

	// Read current memory, project context, and any agenda Pi left for itself
	const currentMemory = readMemoryContent();
	const currentProject = readProjectContent(cwd);
	const projectName = basename(cwd);
	const agenda = readAgenda(latestReflection.date);

	if (agenda) {
		console.error(chalk.dim("Found agenda from last reflection."));
	}

	// Run the wake agent. It decides whether to leave a message or do work
	// (branch + PR), and writes WAKE.md itself — or leaves it absent if there's
	// nothing worth saying.
	console.error(chalk.dim("Running wake agent..."));
	try {
		await runWakeAgent({
			model,
			services,
			reflection: latestReflection.content,
			reflectionDate: latestReflection.date,
			agenda,
			memory: currentMemory,
			projectContent: currentProject,
			projectName,
			date: wakeDate,
			onProgress: (message) => console.error(chalk.dim(message)),
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(chalk.red(`Wake agent failed: ${message}`));
		return 1;
	}

	// The agent writes WAKE.md when it has something to say or do.
	const produced = readWake(wakeDate);
	if (!produced) {
		console.error(chalk.dim("Kin had nothing to wake about today."));
		return 0;
	}

	console.error(chalk.green(`Wake written to ${getWakePath(wakeDate)}`));
	console.log(produced);

	return 0;
}

/** Resolve the model to use for wake. */
async function resolveWakeModel(
	settingsManager: SettingsManager,
	modelRegistry: ModelRegistry,
): Promise<Model<any> | undefined> {
	// 1. Always prefer deepseek-v4-flash for wake; it mirrors reflection's stable default.
	const preferred = modelRegistry.find("openrouter", "deepseek/deepseek-v4-flash");
	if (preferred) return preferred;

	// 2. Fall back to the default model from settings
	const provider = settingsManager.getDefaultProvider();
	const modelId = settingsManager.getDefaultModel();
	if (provider && modelId) {
		return modelRegistry.find(provider, modelId);
	}

	// 3. Fall back to scoped models
	const enabledModels = settingsManager.getEnabledModels();
	if (enabledModels && enabledModels.length > 0) {
		const first = enabledModels[0];
		const [prov, ...rest] = first.split("/");
		if (rest.length > 0) {
			return modelRegistry.find(prov, rest.join("/"));
		}
	}

	return undefined;
}

/** Check if the given args include the wake command. */
export function isWakeCommand(args: string[]): boolean {
	return args[0] === "wake" || args.includes("--wake");
}
