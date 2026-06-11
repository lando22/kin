/**
 * Post-edit TypeScript diagnostics.
 *
 * After the edit/write tools touch a .ts/.tsx file, this module type-checks that one
 * file and returns new errors so the model sees ground truth at the moment of the
 * mistake instead of at end-of-task verification.
 *
 * "New" is literal: the tools capture a baseline of the file's errors before the first
 * write, and only errors absent from that baseline are reported. Pre-existing breakage
 * the user left in the file must not read as "your edit broke this" — that invites
 * off-scope fix-ups.
 *
 * Design constraints:
 * - Kin does not ship `typescript`; the *project's own* copy is resolved from the edited
 *   file's directory. No copy → no diagnostics. This also guarantees version agreement.
 * - Best-effort everywhere: any failure (no tsconfig, parse error, crash) returns null
 *   and must never break the edit itself.
 * - Language services are cached per tsconfig so only the first check in a project pays
 *   program construction; later checks are incremental. Checks run synchronously on the
 *   event loop, so a project whose check exceeds SLOW_CHECK_DISABLE_MS is disabled for
 *   the rest of the session rather than freezing the TUI on every edit.
 */

import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";

type TS = typeof import("typescript");
type LanguageService = import("typescript").LanguageService;

interface ProjectService {
	ts: TS;
	service: LanguageService;
	/** Files named by the tsconfig at service creation time. */
	fileNames: Set<string>;
	/** Files edited later that the original tsconfig parse didn't include (e.g. newly created). */
	extraFiles: Set<string>;
	/** Tripped when a check runs too long; further checks for this tsconfig are skipped. */
	disabled: boolean;
}

/** Keyed by tsconfig path. Module-level so the cache spans tool instances in a session. */
const services = new Map<string, ProjectService>();

/**
 * Errors present before Kin's first write to a file this session, keyed by absolute path.
 * Captured once per file — the baseline means "state before Kin touched it", so later
 * edits don't absorb Kin's own unfixed errors into it.
 */
const baselines = new Map<string, Set<string>>();

const MAX_SERVICES = 4;
const MAX_ERRORS_REPORTED = 10;
const SLOW_CHECK_DISABLE_MS = 5000;
const TS_FILE_RE = /\.[cm]?tsx?$/i;

/** Drop all cached language services and baselines (used by tests). */
export function clearTsDiagnosticsCache(): void {
	for (const entry of services.values()) {
		try {
			entry.service.dispose();
		} catch {
			// disposal is best-effort
		}
	}
	services.clear();
	baselines.clear();
}

/** Walk up from a directory to the nearest tsconfig.json. */
function findTsconfig(fromDir: string): string | null {
	let dir = fromDir;
	while (true) {
		const candidate = join(dir, "tsconfig.json");
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/** Resolve the project's own typescript package relative to the edited file. */
function loadProjectTs(fromFile: string): TS | null {
	try {
		return createRequire(fromFile)("typescript") as TS;
	} catch {
		return null;
	}
}

function createService(ts: TS, tsconfigPath: string): ProjectService | null {
	const configResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
	if (configResult.error) return null;
	const projectDir = dirname(tsconfigPath);
	const parsed = ts.parseJsonConfigFileContent(configResult.config, ts.sys, projectDir);

	const fileNames = new Set(parsed.fileNames);
	const extraFiles = new Set<string>();

	const host: import("typescript").LanguageServiceHost = {
		getScriptFileNames: () => [...new Set([...fileNames, ...extraFiles])],
		// mtime+size versioning means edits made outside the tools (git checkout, bash) are picked up too.
		getScriptVersion: (file) => {
			try {
				const s = statSync(file);
				return `${s.mtimeMs}:${s.size}`;
			} catch {
				return "missing";
			}
		},
		getScriptSnapshot: (file) => {
			const content = ts.sys.readFile(file);
			return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
		},
		getCurrentDirectory: () => projectDir,
		getCompilationSettings: () => parsed.options,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		fileExists: ts.sys.fileExists,
		readFile: ts.sys.readFile,
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
	};

	return {
		ts,
		service: ts.createLanguageService(host, ts.createDocumentRegistry()),
		fileNames,
		extraFiles,
		disabled: false,
	};
}

function getOrCreateService(absolutePath: string, tsconfigPath: string): ProjectService | null {
	const cached = services.get(tsconfigPath);
	if (cached) return cached;

	const ts = loadProjectTs(absolutePath);
	if (!ts) return null;
	const entry = createService(ts, tsconfigPath);
	if (!entry) return null;

	if (services.size >= MAX_SERVICES) {
		const oldest = services.keys().next().value;
		if (oldest !== undefined) {
			services.get(oldest)?.service.dispose();
			services.delete(oldest);
		}
	}
	services.set(tsconfigPath, entry);
	return entry;
}

type ErrorDiagnostics = { ts: TS; errors: import("typescript").Diagnostic[] };

/** Run the shared guard chain and collect the file's current error diagnostics. */
function collectErrors(absolutePath: string): ErrorDiagnostics | null {
	if (process.env.KIN_NO_EDIT_DIAGNOSTICS) return null;
	if (!TS_FILE_RE.test(absolutePath) || absolutePath.endsWith(".d.ts")) return null;
	if (absolutePath.includes(`${sep}node_modules${sep}`)) return null;

	const tsconfigPath = findTsconfig(dirname(absolutePath));
	if (!tsconfigPath) return null;

	const entry = getOrCreateService(absolutePath, tsconfigPath);
	if (!entry || entry.disabled) return null;
	if (!entry.fileNames.has(absolutePath)) entry.extraFiles.add(absolutePath);

	const start = Date.now();
	const { ts, service } = entry;
	const errors = [
		...service.getSyntacticDiagnostics(absolutePath),
		...service.getSemanticDiagnostics(absolutePath),
	].filter((d) => d.category === ts.DiagnosticCategory.Error);
	if (Date.now() - start > SLOW_CHECK_DISABLE_MS) {
		entry.disabled = true;
	}
	return { ts, errors };
}

/**
 * Identity of an error across edits. Line numbers shift with every edit, so key on
 * code + message; a pre-existing error that merely moved stays suppressed.
 */
function diagnosticKey(ts: TS, d: import("typescript").Diagnostic): string {
	return `${d.code}:${ts.flattenDiagnosticMessageText(d.messageText, " ")}`;
}

/**
 * Record the file's current errors as pre-existing, so getTsDiagnostics only reports
 * errors introduced after this point. Call before the first write to a file; no-op if a
 * baseline was already captured this session. A missing file baselines to "no errors".
 */
export function captureTsBaseline(absolutePath: string): void {
	try {
		if (baselines.has(absolutePath)) return;
		if (!existsSync(absolutePath)) {
			baselines.set(absolutePath, new Set());
			return;
		}
		const collected = collectErrors(absolutePath);
		if (!collected) return;
		baselines.set(absolutePath, new Set(collected.errors.map((d) => diagnosticKey(collected.ts, d))));
	} catch {
		// Baselines are a convenience; a failure here must never break the edit.
	}
}

/**
 * Type-check one file after an edit. Returns a compact listing of errors introduced
 * since the file's baseline (see captureTsBaseline) for that file only, or null when
 * the file is clean, isn't TypeScript, or diagnostics aren't available (no tsconfig,
 * no project typescript, disabled, KIN_NO_EDIT_DIAGNOSTICS set).
 */
export function getTsDiagnostics(absolutePath: string): string | null {
	try {
		const collected = collectErrors(absolutePath);
		if (!collected) return null;
		const { ts } = collected;

		const baseline = baselines.get(absolutePath);
		const diagnostics = baseline
			? collected.errors.filter((d) => !baseline.has(diagnosticKey(ts, d)))
			: collected.errors;

		if (diagnostics.length === 0) return null;

		const lines = diagnostics.slice(0, MAX_ERRORS_REPORTED).map((d) => {
			const message = ts.flattenDiagnosticMessageText(d.messageText, " ");
			if (d.file && d.start !== undefined) {
				const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
				return `${line + 1}:${character + 1} TS${d.code}: ${message}`;
			}
			return `TS${d.code}: ${message}`;
		});
		if (diagnostics.length > MAX_ERRORS_REPORTED) {
			lines.push(`... and ${diagnostics.length - MAX_ERRORS_REPORTED} more`);
		}
		return lines.join("\n");
	} catch {
		// Diagnostics are a convenience; a failure here must never break the edit.
		return null;
	}
}
