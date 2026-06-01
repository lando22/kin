#!/usr/bin/env npx tsx

/**
 * Search-shape analytics for Kin's tool calls.
 *
 * tool-stats.ts answers "where do tokens/calls go." This answers a narrower, decision-driving
 * question: of the searching Kin does, how much is *symbol navigation* (find where an identifier
 * is defined / who uses it) versus *content search* (a string, a config value, a regex)? Only the
 * symbol slice is addressable by a language server or a symbol-search tool; content search stays
 * grep no matter what. So this is the data that says whether LSP / a symbol tool is worth building.
 *
 * Usage: scripts/search-stats.ts [--sessions-dir <dir>] [--json]
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

interface ToolCallBlock {
	type: string;
	name?: string;
	arguments?: Record<string, unknown>;
}
interface Entry {
	type?: string;
	message?: { role?: string; content?: unknown };
}

const SEARCH_BINS = new Set(["grep", "rg", "egrep", "fgrep", "ag", "ack", "find", "fd", "glob", "locate"]);
const GREP_BINS = new Set(["grep", "rg", "egrep", "fgrep", "ag", "ack"]);
// Definition keywords across the languages Kin works in. If the search command mentions one of
// these next to the pattern, the user is hunting for a declaration — squarely symbol-navigation.
const DEF_KEYWORDS =
	/\b(class|interface|type|function|func|def|const|let|var|struct|enum|impl|trait|fn|export|module|namespace)\b/;
// A bare identifier: the classic "where is `Foo`" lookup that grep answers noisily and a symbol
// tool answers exactly.
const BARE_IDENT = /^[A-Za-z_][A-Za-z0-9_]{2,}$/;

function parseArgs(): { sessionsDir: string; json: boolean } {
	let sessionsDir = join(homedir(), ".kin", "agent", "sessions");
	let json = false;
	const args = process.argv.slice(2);
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--sessions-dir" && args[i + 1]) sessionsDir = resolve(args[++i]);
		else if (arg === "--json") json = true;
		else if (arg === "--help" || arg === "-h") {
			console.log("Usage: scripts/search-stats.ts [--sessions-dir <dir>] [--json]");
			process.exit(0);
		}
	}
	return { sessionsDir, json };
}

function jsonlFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...jsonlFiles(path));
		else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(path);
	}
	return out;
}

/** Crude shell tokenizer: good enough to find a command's leading words and a grep pattern. */
function tokenize(command: string): string[] {
	return command.match(/"[^"]*"|'[^']*'|[^\s]+/g)?.map((t) => t.replace(/^['"]|['"]$/g, "")) ?? [];
}

/** First word of each &&/||/;/| segment — the binaries this command actually runs. */
function segmentLeaders(command: string): string[] {
	return command
		.split(/&&|\|\||;|\|/)
		.map((seg) => tokenize(seg)[0] ?? "")
		.filter(Boolean);
}

/** Best-effort: the first non-flag argument to the first grep-family binary in the command. */
function grepPattern(command: string): string | undefined {
	const toks = tokenize(command);
	for (let i = 0; i < toks.length; i++) {
		if (!GREP_BINS.has(toks[i])) continue;
		for (let j = i + 1; j < toks.length; j++) {
			const t = toks[j];
			if (t.startsWith("-")) {
				if (["-e", "--regexp", "--include", "--glob", "-g"].includes(t)) j++; // flag takes an arg
				continue;
			}
			return t;
		}
	}
	return undefined;
}

const { sessionsDir, json } = parseArgs();
if (!existsSync(sessionsDir)) throw new Error(`Sessions directory not found: ${sessionsDir}`);

const toolCalls = new Map<string, number>();
const bashClass = { search: 0, other: 0 };
const searchBins = new Map<string, number>();
const grepShape = { symbol: 0, definition: 0, content: 0, unparsed: 0 };
let totalCalls = 0;

for (const file of jsonlFiles(sessionsDir)) {
	for (const line of readFileSync(file, "utf8").split("\n")) {
		if (!line.trim()) continue;
		let entry: Entry;
		try {
			entry = JSON.parse(line) as Entry;
		} catch {
			continue;
		}
		if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
		const content = entry.message.content;
		if (!Array.isArray(content)) continue;
		for (const raw of content) {
			const block = raw as ToolCallBlock;
			if (block.type !== "toolCall" || typeof block.name !== "string") continue;
			toolCalls.set(block.name, (toolCalls.get(block.name) ?? 0) + 1);
			totalCalls++;
			if (block.name !== "bash") continue;

			const command = typeof block.arguments?.command === "string" ? block.arguments.command : "";
			if (!command) continue;
			const leaders = segmentLeaders(command);
			const usesSearch = leaders.some((w) => SEARCH_BINS.has(w));
			if (!usesSearch) {
				bashClass.other++;
				continue;
			}
			bashClass.search++;
			for (const w of leaders) {
				if (SEARCH_BINS.has(w)) searchBins.set(w, (searchBins.get(w) ?? 0) + 1);
			}
			// Classify grep-family searches by shape (find/fd are excluded — they're path search).
			if (!GREP_BINS.has(leaders.find((w) => SEARCH_BINS.has(w)) ?? "")) continue;
			const pattern = grepPattern(command);
			if (!pattern) grepShape.unparsed++;
			else if (DEF_KEYWORDS.test(command)) grepShape.definition++;
			else if (BARE_IDENT.test(pattern)) grepShape.symbol++;
			else grepShape.content++;
		}
	}
}

const bashTotal = bashClass.search + bashClass.other;
const grepTotal = grepShape.symbol + grepShape.definition + grepShape.content + grepShape.unparsed;
// Symbol-addressable share of ALL calls: bare-identifier + definition-shaped grep searches.
const symbolNav = grepShape.symbol + grepShape.definition;

const report = {
	sessionsDir,
	totalCalls,
	byTool: Object.fromEntries([...toolCalls.entries()].sort((a, b) => b[1] - a[1])),
	bash: { ...bashClass, total: bashTotal },
	searchBins: Object.fromEntries([...searchBins.entries()].sort((a, b) => b[1] - a[1])),
	grepShape: { ...grepShape, total: grepTotal },
	symbolNavShareOfAllCalls: totalCalls ? symbolNav / totalCalls : 0,
};

if (json) {
	console.log(JSON.stringify(report, null, 2));
	process.exit(0);
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "—");
console.log(`Search-shape analytics over ${report.totalCalls} tool calls\n${sessionsDir}\n`);
console.log("By tool:");
for (const [name, n] of Object.entries(report.byTool)) {
	console.log(`  ${name.padEnd(8)} ${String(n).padStart(5)}  ${pct(n, totalCalls)}`);
}
console.log(`\nBash (${bashTotal} calls):`);
console.log(`  search   ${String(bashClass.search).padStart(5)}  ${pct(bashClass.search, bashTotal)}`);
console.log(`  other    ${String(bashClass.other).padStart(5)}  ${pct(bashClass.other, bashTotal)}`);
console.log(`  tools: ${JSON.stringify(report.searchBins)}`);
console.log(`\nGrep-family search shape (${grepTotal} searches — only these are LSP-addressable):`);
console.log(`  content    ${String(grepShape.content).padStart(5)}  ${pct(grepShape.content, grepTotal)}  (grep-only, not LSP)`);
console.log(`  symbol     ${String(grepShape.symbol).padStart(5)}  ${pct(grepShape.symbol, grepTotal)}  (bare identifier)`);
console.log(`  definition ${String(grepShape.definition).padStart(5)}  ${pct(grepShape.definition, grepTotal)}  (decl keyword; noisy)`);
console.log(`  unparsed   ${String(grepShape.unparsed).padStart(5)}  ${pct(grepShape.unparsed, grepTotal)}`);
console.log(`\n→ Symbol-navigation is ${pct(symbolNav, totalCalls)} of ALL tool calls.`);
console.log("  Full LSP buys precision on that slice at the cost of a per-language server subsystem;");
console.log("  a ripgrep-based symbol/definition tool buys most of it for almost nothing.");
