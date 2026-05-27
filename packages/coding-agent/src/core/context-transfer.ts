import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import {
	APP_NAME,
	ENV_SESSION_DIR,
	expandTildePath,
	getAgentDir,
	getCustomThemesDir,
	getKinDir,
	getModelsPath,
	getPromptsDir,
	getSessionsDir,
	getSettingsPath,
	getSkillsDir,
	VERSION,
} from "../config.ts";
import { spawnProcessSync } from "../utils/child-process.ts";
import { SettingsManager } from "./settings-manager.ts";

const PERSONAL_ENTRIES = [
	"MEMORY.md",
	"PREFERENCES.md",
	"WORKING.md",
	"Notes",
	"Reflections",
	"Wakes",
	"Projects",
] as const;

const AGENT_FILENAMES = ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"] as const;

export interface ContextExportResult {
	path: string;
	files: number;
	bytes: number;
}

export interface ContextImportResult {
	path: string;
	files: number;
	bytes: number;
}

interface StagedPath {
	source: string;
	target: string;
}

function localTimestamp(date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	const hh = String(date.getHours()).padStart(2, "0");
	const mm = String(date.getMinutes()).padStart(2, "0");
	const ss = String(date.getSeconds()).padStart(2, "0");
	return `${y}-${m}-${d}-${hh}${mm}${ss}`;
}

function resolveOutputPath(outputPath: string | undefined, cwd: string): string {
	if (!outputPath) {
		return join(cwd, `${APP_NAME}-context-${localTimestamp()}.tar.gz`);
	}
	const expanded = expandTildePath(outputPath);
	if (expanded.endsWith(sep) || (existsSync(expanded) && statSync(expanded).isDirectory())) {
		return join(expanded, `${APP_NAME}-context-${localTimestamp()}.tar.gz`);
	}
	return resolve(cwd, expanded);
}

function getConfiguredSessionDir(cwd: string, agentDir: string): string {
	const envSessionDir = process.env[ENV_SESSION_DIR];
	if (envSessionDir) {
		return expandTildePath(envSessionDir);
	}
	return SettingsManager.create(cwd, agentDir).getSessionDir() ?? getSessionsDir();
}

function addIfExists(paths: StagedPath[], source: string, target: string): void {
	if (existsSync(source)) {
		paths.push({ source, target });
	}
}

function collectStagedPaths(cwd: string): StagedPath[] {
	const agentDir = getAgentDir();
	const piDir = getKinDir(agentDir);
	const paths: StagedPath[] = [];

	for (const entry of PERSONAL_ENTRIES) {
		addIfExists(paths, join(piDir, entry), entry);
	}
	addIfExists(paths, getSkillsDir(agentDir), "SKILLS");

	const agentTarget = "agent";
	for (const file of AGENT_FILENAMES) {
		addIfExists(paths, join(agentDir, file), join(agentTarget, file));
	}
	addIfExists(paths, getSettingsPath(), join(agentTarget, "settings.json"));
	addIfExists(paths, getModelsPath(), join(agentTarget, "models.json"));
	addIfExists(paths, getPromptsDir(), join(agentTarget, "prompts"));
	addIfExists(paths, getCustomThemesDir(), join(agentTarget, "themes"));
	addIfExists(paths, join(agentDir, "extensions"), join(agentTarget, "extensions"));

	const sessionDir = getConfiguredSessionDir(cwd, agentDir);
	addIfExists(paths, sessionDir, join(agentTarget, "sessions"));

	return dedupeStagedPaths(paths);
}

function dedupeStagedPaths(paths: StagedPath[]): StagedPath[] {
	const seenTargets = new Set<string>();
	const deduped: StagedPath[] = [];
	for (const path of paths) {
		if (seenTargets.has(path.target)) {
			continue;
		}
		seenTargets.add(path.target);
		deduped.push(path);
	}
	return deduped;
}

function copyIntoStage(stagePiDir: string, paths: StagedPath[]): void {
	for (const path of paths) {
		const target = join(stagePiDir, path.target);
		mkdirSync(dirname(target), { recursive: true });
		cpSync(path.source, target, { recursive: true, force: true });
	}
}

function countFilesAndBytes(dir: string): { files: number; bytes: number } {
	let files = 0;
	let bytes = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			const child = countFilesAndBytes(path);
			files += child.files;
			bytes += child.bytes;
		} else if (entry.isFile()) {
			files += 1;
			bytes += statSync(path).size;
		}
	}
	return { files, bytes };
}

function runTar(args: string[], cwd: string): void {
	const result = spawnProcessSync("tar", args, {
		cwd,
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) {
		const details = result.stderr.trim() || result.stdout.trim() || `exit code ${result.status ?? "unknown"}`;
		throw new Error(`tar failed: ${details}`);
	}
}

export function exportPiContext(outputPath?: string, cwd = process.cwd()): ContextExportResult {
	const archivePath = resolveOutputPath(outputPath, cwd);
	const stageDir = mkdtempSync(join(tmpdir(), `${APP_NAME}-context-export-`));
	try {
		const stagePiDir = join(stageDir, ".kin");
		mkdirSync(stagePiDir, { recursive: true });
		const paths = collectStagedPaths(cwd);
		copyIntoStage(stagePiDir, paths);
		const stats = countFilesAndBytes(stagePiDir);
		const manifest = {
			format: "pi-context-archive",
			version: 1,
			app: APP_NAME,
			createdAt: new Date().toISOString(),
			piVersion: VERSION,
			files: stats.files,
			bytes: stats.bytes,
			excludes: ["auth.json", "bin", "tools", "debug logs"],
		};
		writeFileSync(join(stageDir, "pi-context-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
		mkdirSync(dirname(archivePath), { recursive: true });
		runTar(["-czf", archivePath, ".kin", "pi-context-manifest.json"], stageDir);
		return { path: archivePath, ...stats };
	} finally {
		rmSync(stageDir, { recursive: true, force: true });
	}
}

function isArchiveCandidate(path: string): boolean {
	const name = basename(path);
	return name.startsWith(`${APP_NAME}-context-`) && (name.endsWith(".tar.gz") || name.endsWith(".tgz"));
}

function findArchiveCandidates(dir: string): string[] {
	if (!existsSync(dir)) {
		return [];
	}
	return readdirSync(dir)
		.map((entry) => join(dir, entry))
		.filter((path) => {
			try {
				return statSync(path).isFile() && isArchiveCandidate(path);
			} catch {
				return false;
			}
		});
}

export function findLatestKinContextArchive(cwd = process.cwd()): string | undefined {
	const candidates = [
		...findArchiveCandidates(cwd),
		...findArchiveCandidates(join(homedir(), "Downloads")),
		...findArchiveCandidates(homedir()),
	];
	return candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

function resolveInputPath(inputPath: string | undefined, cwd: string): string {
	if (!inputPath) {
		const latest = findLatestKinContextArchive(cwd);
		if (!latest) {
			throw new Error(`No ${APP_NAME} context archive found in the current directory, ~/Downloads, or ~.`);
		}
		return latest;
	}
	const expanded = expandTildePath(inputPath);
	return resolve(cwd, expanded);
}

function assertSupportedArchive(path: string): void {
	if (!existsSync(path)) {
		throw new Error(`Archive not found: ${path}`);
	}
	if (extname(path) !== ".gz" && !path.endsWith(".tgz")) {
		throw new Error(`Unsupported archive type: ${path}`);
	}
}

export function importPiContext(inputPath?: string, cwd = process.cwd()): ContextImportResult {
	const archivePath = resolveInputPath(inputPath, cwd);
	assertSupportedArchive(archivePath);
	const stageDir = mkdtempSync(join(tmpdir(), `${APP_NAME}-context-import-`));
	try {
		runTar(["-xzf", archivePath, "-C", stageDir], cwd);
		const stagePiDir = join(stageDir, ".kin");
		if (!existsSync(stagePiDir)) {
			throw new Error("Archive does not contain a .kin context directory.");
		}
		const stats = countFilesAndBytes(stagePiDir);
		const piDir = getKinDir(getAgentDir());
		mkdirSync(piDir, { recursive: true });
		cpSync(stagePiDir, piDir, { recursive: true, force: true });
		return { path: archivePath, ...stats };
	} finally {
		rmSync(stageDir, { recursive: true, force: true });
	}
}
