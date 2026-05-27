/**
 * Reflect mode — standalone CLI command for `pi reflect`.
 *
 * Runs Pi as a headless agent with full tool access so it can explore its own
 * session history, read code, and write a reflection (and optional agenda)
 * rather than receiving everything pre-stuffed in a single completion call.
 */

import { join } from "node:path";
import type { Model } from "@earendil-works/kin-ai";
import chalk from "chalk";
import { getAgentDir, getSessionsDir } from "../config.ts";
import { createAgentSessionServices } from "../core/agent-session-services.ts";
import { AuthStorage } from "../core/auth-storage.ts";
import type { ModelRegistry } from "../core/model-registry.ts";
import { agendaExists, getAgendaPath, getReflectionPath, reflectionExists } from "../core/reflect.ts";
import { runReflectAgent } from "../core/reflect-agent.ts";
import { SettingsManager } from "../core/settings-manager.ts";

/** Run the reflect mode and return an exit code. */
export async function runReflectMode(
	args: string[],
	{ sessionsDir, date }: { sessionsDir?: string; date?: Date } = {},
): Promise<number> {
	// Allow --cwd flag to override process.cwd()
	const cwdIndex = args.indexOf("--cwd");
	const cwd = cwdIndex >= 0 && args[cwdIndex + 1] ? args[cwdIndex + 1] : process.cwd();

	// Allow --model flag to override the model (format: provider/modelId)
	const modelIndex = args.indexOf("--model");
	const explicitModel = modelIndex >= 0 && args[modelIndex + 1] ? args[modelIndex + 1] : undefined;
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.create(cwd, agentDir);

	// Resolve sessions directory
	const sessionDir = sessionsDir ?? settingsManager.getSessionDir() ?? getSessionsDir();

	// Create services with a minimal resource load. Extensions stay enabled so reflection can use
	// installed tools, but ambient prompt assets are disabled to keep the headless task focused.
	const services = await createAgentSessionServices({
		cwd,
		agentDir,
		authStorage: AuthStorage.create(join(agentDir, "auth.json")),
		settingsManager,
		resourceLoaderOptions: {
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
	let model = await resolveReflectionModel(services.settingsManager, services.modelRegistry, explicitModel);

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

	const reflectDate = date ?? new Date();
	const showModel = `${model.provider}/${model.id}`;
	console.error(chalk.dim(`Reflecting using ${showModel}...`));

	if (reflectionExists(reflectDate)) {
		console.error(chalk.dim(`Existing reflection at ${getReflectionPath(reflectDate)} — will overwrite.`));
	}

	try {
		await runReflectAgent({
			model,
			services,
			sessionDir,
			date: reflectDate,
			onProgress: (msg) => console.error(chalk.dim(msg)),
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(chalk.red(`Reflect agent failed: ${message}`));
		return 1;
	}

	if (!reflectionExists(reflectDate)) {
		console.error(chalk.yellow("Reflect agent finished but no reflection was written."));
		return 1;
	}

	console.error(chalk.green(`Reflection written to ${getReflectionPath(reflectDate)}`));

	if (agendaExists(reflectDate)) {
		console.error(chalk.green(`Agenda written to ${getAgendaPath(reflectDate)}`));
	}

	return 0;
}

/** Resolve the model to use for reflection. */
async function resolveReflectionModel(
	settingsManager: SettingsManager,
	modelRegistry: ModelRegistry,
	explicitModel?: string,
): Promise<Model<any> | undefined> {
	if (explicitModel) {
		const [prov, ...rest] = explicitModel.split("/");
		if (rest.length > 0) {
			const found = modelRegistry.find(prov, rest.join("/"));
			if (found) return found;
		}
	}

	// Always prefer deepseek-v4-flash for reflection; Gemini has produced empty files here.
	const preferred = modelRegistry.find("openrouter", "deepseek/deepseek-v4-flash");
	if (preferred) return preferred;

	// Fall back to default model from settings
	const provider = settingsManager.getDefaultProvider();
	const modelId = settingsManager.getDefaultModel();
	if (provider && modelId) {
		return modelRegistry.find(provider, modelId);
	}

	// Fall back to scoped models so scheduled reflection still has a chance to run.
	const enabledModels = settingsManager.getEnabledModels();
	if (enabledModels && enabledModels.length > 0) {
		const first = enabledModels[0];
		const [prov, ...rest] = first.split("/");
		if (rest.length > 0) return modelRegistry.find(prov, rest.join("/"));
	}

	return undefined;
}

/** Check if the given args include the reflect command. */
export function isReflectCommand(args: string[]): boolean {
	return args[0] === "reflect" || args.includes("--reflect");
}
