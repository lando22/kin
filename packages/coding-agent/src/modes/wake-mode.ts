/**
 * Wake mode — standalone CLI command for `pi wake`.
 *
 * Bootstraps the services (settings, auth, model registry), reads the latest
 * reflection, generates a wake message via the LLM, and writes it to
 * ~/.pi/Wakes/<date>/WAKE.md if there's something worth saying.
 */

import { basename, join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import chalk from "chalk";
import { getAgentDir } from "../config.ts";
import { createAgentSessionServices } from "../core/agent-session-services.ts";
import { AuthStorage } from "../core/auth-storage.ts";
import type { ModelRegistry } from "../core/model-registry.ts";
import { readMemoryContent, readProjectContent } from "../core/pi-memory.ts";
import { formatLocalDate, readAgenda } from "../core/reflect.ts";
import { SettingsManager } from "../core/settings-manager.ts";
import { findLatestReflection, generateWake, getWakePath, isNoneResponse, readWake, writeWake } from "../core/wake.ts";

/** Run the wake mode and return an exit code. */
export async function runWakeMode(args: string[], { date }: { date?: Date } = {}): Promise<number> {
	// Allow --cwd flag
	const cwdIndex = args.indexOf("--cwd");
	const cwd = cwdIndex >= 0 && args[cwdIndex + 1] ? args[cwdIndex + 1] : process.cwd();
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.create(cwd, agentDir);

	// Create services to get a model
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

	// Find the latest reflection
	const latestReflection = findLatestReflection();
	if (!latestReflection) {
		console.error(chalk.yellow("No reflections found yet. Run `pi reflect` first."));
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

	// Generate wake
	console.error(chalk.dim("Generating wake message..."));
	let rawWake: string;
	try {
		rawWake = await generateWake(model, {
			reflection: latestReflection.content,
			reflectionDate: formatLocalDate(latestReflection.date),
			memory: currentMemory,
			projectContent: currentProject,
			projectName,
			agenda,
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(chalk.red(`Wake generation failed: ${message}`));
		return 1;
	}

	// Check for <NONE> or empty response
	if (!rawWake || isNoneResponse(rawWake)) {
		console.error(chalk.dim("Pi has nothing to wake about today. <NONE>"));
		return 0;
	}

	// Write wake
	writeWake(rawWake, wakeDate);
	console.error(chalk.green(`Wake written to ${getWakePath(wakeDate)}`));

	// Print the wake to stdout
	console.log(rawWake);

	return 0;
}

/** Resolve the model to use for wake. */
async function resolveWakeModel(
	settingsManager: SettingsManager,
	modelRegistry: ModelRegistry,
): Promise<Model<any> | undefined> {
	// 1. Always prefer deepseek-v4-flash for wake
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
