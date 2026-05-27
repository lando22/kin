import chalk from "chalk";
import { APP_NAME } from "../config.ts";
import { exportPiContext, findLatestKinContextArchive, importPiContext } from "../core/context-transfer.ts";

type ContextTransferCommand = "export" | "import";

function getCommand(args: string[]): ContextTransferCommand | undefined {
	if (args[0] === "export" || args[0] === "import") {
		return args[0];
	}
	return undefined;
}

function getPathArg(args: string[]): string | undefined {
	return args.find((arg, index) => index > 0 && !arg.startsWith("-"));
}

function printHelp(command: ContextTransferCommand): void {
	if (command === "export") {
		console.log(`${APP_NAME} export [output.tar.gz]

Export Pi context for moving to another computer.

Includes memory, preferences, working notes, reflections, wakes, projects, personal skills, sessions, prompt/theme/extension folders, settings, models.json, and global AGENTS/CLAUDE context files.
Excludes auth.json, cached binaries, tools, and debug logs.`);
		return;
	}

	console.log(`${APP_NAME} import [archive.tar.gz]

Import a Pi context archive. If no path is given, Pi uses the newest ${APP_NAME}-context-*.tar.gz archive found in the current directory, ~/Downloads, or ~.`);
}

export function isContextTransferCommand(args: string[]): boolean {
	return getCommand(args) !== undefined;
}

export async function runContextTransferMode(args: string[]): Promise<number> {
	const command = getCommand(args);
	if (!command) {
		return 1;
	}
	if (args.includes("--help") || args.includes("-h")) {
		printHelp(command);
		return 0;
	}

	try {
		if (command === "export") {
			const outputPath = getPathArg(args);
			const result = exportPiContext(outputPath);
			console.log(`Exported Pi context to: ${result.path}`);
			console.log(chalk.dim(`${result.files} files, ${result.bytes} bytes. Auth tokens were not included.`));
			return 0;
		}

		const inputPath = getPathArg(args) ?? findLatestKinContextArchive();
		const result = importPiContext(inputPath);
		console.log(`Imported Pi context from: ${result.path}`);
		console.log(chalk.dim(`${result.files} files, ${result.bytes} bytes.`));
		return 0;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(chalk.red(`Error: ${message}`));
		return 1;
	}
}
