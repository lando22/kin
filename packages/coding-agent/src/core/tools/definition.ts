import { createInterface } from "node:readline";
import type { AgentTool } from "@landongarrison/kin-agent-core";
import { Text } from "@landongarrison/kin-tui";
import { spawn } from "child_process";
import path from "path";
import { type Static, Type } from "typebox";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.ts";
import { theme } from "../../modes/interactive/theme/theme.ts";
import { ensureTool } from "../../utils/tools-manager.ts";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.ts";
import { resolveToCwd } from "./path-utils.ts";
import { getTextOutput, invalidArgText, shortenPath, str } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";
import { truncateLine } from "./truncate.ts";

/**
 * The "find where this is defined" tool — a precise, language-aware alternative to grepping for a
 * symbol by hand. Measurement of real sessions showed ~1 in 10 of Kin's tool calls is a bare
 * grep for an identifier ("where is `Foo`?"), which returns every definition, call, comment, and
 * string match mixed together and usually needs a follow-up read to disambiguate. This collapses
 * that into one call that returns only the declaration sites.
 *
 * It is intentionally NOT a language server: no per-language server process, no cold start. It
 * builds a ripgrep regex covering the common declaration forms across the languages Kin works in.
 * That trades a little recall (it won't catch every exotic definition form, e.g. a class method
 * with no leading keyword) for near-zero cost — and the model still has bash with rg for the rest.
 */

const definitionSchema = Type.Object({
	name: Type.String({
		description: "The identifier to find the definition of (function, class, type, variable, etc.)",
	}),
	path: Type.Optional(Type.String({ description: "Directory or file to search (default: current directory)" })),
});

export type DefinitionToolInput = Static<typeof definitionSchema>;

const DEFAULT_LIMIT = 50;

export interface DefinitionToolDetails {
	matchLimitReached?: number;
}

interface RipgrepMatchEvent {
	type: "match";
	data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } };
}

function isRipgrepMatchEvent(event: unknown): event is RipgrepMatchEvent {
	return typeof event === "object" && event !== null && (event as { type?: unknown }).type === "match";
}

/** Escape a user-supplied identifier so it's a literal inside the ripgrep regex. */
function escapeForRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Declaration keywords across the languages Kin touches. `\b<kw>\s+Name` catches `export class Foo`,
// `pub fn foo`, `async function foo`, etc. because the word boundary sits right before the keyword.
const DECL_KEYWORDS = [
	"class",
	"interface",
	"type",
	"enum",
	"struct",
	"trait",
	"protocol",
	"record",
	"object",
	"function",
	"func",
	"fn",
	"def",
	"defn",
	"sub",
	"method",
	"module",
	"namespace",
	"package",
	"const",
	"let",
	"var",
	"val",
];

/**
 * Build a regex matching the common ways `name` gets declared:
 *  1. a declaration keyword followed by the name (most languages)
 *  2. an assignment whose right-hand side starts a function/arrow/generic (JS/TS `const Foo = () =>`,
 *     `Foo: (` object methods and type members)
 */
function buildDefinitionPattern(name: string): string {
	const ident = escapeForRegex(name);
	const keyword = `\\b(${DECL_KEYWORDS.join("|")})\\s+${ident}\\b`;
	const assignment = `\\b${ident}\\s*[:=]\\s*(async\\s+)?(\\(|function\\b|<)`;
	return `(${keyword})|(${assignment})`;
}

function formatDefinitionCall(args: { name?: string; path?: string } | undefined): string {
	const name = str(args?.name);
	const rawPath = str(args?.path);
	const where = rawPath ? shortenPath(rawPath) : ".";
	const nameDisplay = name === null ? invalidArgText(theme) : theme.fg("accent", name || "");
	return `${theme.fg("toolTitle", theme.bold("definition"))} ${nameDisplay}${theme.fg("toolOutput", ` in ${where}`)}`;
}

function formatDefinitionResult(
	result: { content: Array<{ type: string; text?: string }>; details?: DefinitionToolDetails },
	options: ToolRenderResultOptions,
	showImages: boolean,
): string {
	const output = getTextOutput(result, showImages).trim();
	if (!output) return "";
	const lines = output.split("\n");
	const maxLines = options.expanded ? lines.length : 15;
	const shown = lines.slice(0, maxLines);
	let text = `\n${shown.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
	const remaining = lines.length - maxLines;
	if (remaining > 0) {
		text += `${theme.fg("muted", `\n... (${remaining} more,`)} ${keyHint("app.tools.expand", "to expand")})`;
	}
	return text;
}

export function createDefinitionToolDefinition(
	cwd: string,
): ToolDefinition<typeof definitionSchema, DefinitionToolDetails | undefined> {
	return {
		name: "definition",
		label: "definition",
		description:
			"Find where a name is defined — the declaration site of a function, class, type, interface, variable, etc. Language-aware (searches common declaration forms across languages) and respects .gitignore. Prefer this when you want to jump to a symbol's definition; use bash with rg for content/text search or to find usages. Returns file:line for each candidate declaration. If it finds nothing (e.g. a class method with no leading keyword), fall back to bash with rg.",
		promptSnippet: "Find where a symbol (function/class/type/etc.) is defined",
		parameters: definitionSchema,
		async execute(_toolCallId, { name, path: searchDir }: { name: string; path?: string }, signal?: AbortSignal) {
			return new Promise((resolve, reject) => {
				if (signal?.aborted) {
					reject(new Error("Operation aborted"));
					return;
				}
				if (!name || !name.trim()) {
					reject(new Error("A non-empty `name` is required"));
					return;
				}

				let settled = false;
				const settle = (fn: () => void) => {
					if (!settled) {
						settled = true;
						fn();
					}
				};

				(async () => {
					try {
						const rgPath = await ensureTool("rg", true);
						if (!rgPath) {
							settle(() => reject(new Error("ripgrep (rg) is not available and could not be downloaded")));
							return;
						}

						const searchPath = resolveToCwd(searchDir || ".", cwd);
						const pattern = buildDefinitionPattern(name.trim());
						const args = ["--json", "--line-number", "--color=never", "--hidden", "-e", pattern, searchPath];
						const child = spawn(rgPath, args, { stdio: ["ignore", "pipe", "pipe"] });
						const rl = createInterface({ input: child.stdout });

						let stderr = "";
						let matchCount = 0;
						let aborted = false;
						let killedDueToLimit = false;
						const matches: Array<{ filePath: string; lineNumber: number; lineText: string }> = [];

						const cleanup = () => {
							rl.close();
							signal?.removeEventListener("abort", onAbort);
						};
						const onAbort = () => {
							aborted = true;
							if (!child.killed) child.kill();
						};
						signal?.addEventListener("abort", onAbort, { once: true });
						child.stderr?.on("data", (chunk) => {
							stderr += chunk.toString();
						});

						rl.on("line", (line) => {
							if (!line.trim() || matchCount >= DEFAULT_LIMIT) return;
							let event: unknown;
							try {
								event = JSON.parse(line);
							} catch {
								return;
							}
							if (!isRipgrepMatchEvent(event)) return;
							const filePath = event.data?.path?.text;
							const lineNumber = event.data?.line_number;
							const lineText = event.data?.lines?.text ?? "";
							if (filePath && typeof lineNumber === "number") {
								matches.push({ filePath, lineNumber, lineText });
								matchCount++;
								if (matchCount >= DEFAULT_LIMIT) {
									killedDueToLimit = true;
									if (!child.killed) child.kill();
								}
							}
						});

						child.on("error", (error) => {
							cleanup();
							settle(() => reject(new Error(`Failed to run ripgrep: ${error.message}`)));
						});
						child.on("close", (code) => {
							cleanup();
							if (aborted) {
								settle(() => reject(new Error("Operation aborted")));
								return;
							}
							if (!killedDueToLimit && code !== 0 && code !== 1) {
								settle(() => reject(new Error(stderr.trim() || `ripgrep exited with code ${code}`)));
								return;
							}
							if (matchCount === 0) {
								settle(() =>
									resolve({
										content: [
											{
												type: "text",
												text: `No definition found for "${name}". It may be a class method, an unusual declaration form, or defined elsewhere — try bash with rg.`,
											},
										],
										details: undefined,
									}),
								);
								return;
							}

							const formatPath = (filePath: string): string => {
								const relative = path.relative(searchPath, filePath);
								return relative && !relative.startsWith("..") ? relative.replace(/\\/g, "/") : filePath;
							};
							const outputLines = matches.map((m) => {
								const sanitized = m.lineText.replace(/\r?\n$/, "").replace(/\r/g, "");
								const { text } = truncateLine(sanitized);
								return `${formatPath(m.filePath)}:${m.lineNumber}: ${text.trim()}`;
							});
							let output = outputLines.join("\n");
							const details: DefinitionToolDetails = {};
							if (killedDueToLimit) {
								output += `\n\n[${DEFAULT_LIMIT} candidates limit reached — refine with a more specific name or narrow the path]`;
								details.matchLimitReached = DEFAULT_LIMIT;
							}
							settle(() =>
								resolve({
									content: [{ type: "text", text: output }],
									details: Object.keys(details).length > 0 ? details : undefined,
								}),
							);
						});
					} catch (error) {
						settle(() => reject(error));
					}
				})();
			});
		},
		renderCall(args, _theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatDefinitionCall(args));
			return text;
		},
		renderResult(result, options, _theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatDefinitionResult(result, options, context.showImages));
			return text;
		},
	};
}

export function createDefinitionTool(cwd: string): AgentTool<typeof definitionSchema> {
	return wrapToolDefinition(createDefinitionToolDefinition(cwd));
}
