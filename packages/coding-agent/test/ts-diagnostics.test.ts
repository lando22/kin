import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createEditTool } from "../src/core/tools/edit.js";
import { captureTsBaseline, clearTsDiagnosticsCache, getTsDiagnostics } from "../src/core/tools/ts-diagnostics.js";
import { createWriteTool } from "../src/core/tools/write.js";

// The fixture must live inside the repo: getTsDiagnostics resolves the *project's own*
// typescript package by walking up from the edited file, and only the repo root has one.
const testDir = fileURLToPath(new URL(".", import.meta.url));

describe("ts-diagnostics", () => {
	let projectDir: string;

	beforeEach(() => {
		projectDir = mkdtempSync(join(testDir, "tmp-tsdiag-"));
		writeFileSync(
			join(projectDir, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, types: [], lib: ["es2022"] },
			}),
			"utf-8",
		);
	});

	afterEach(() => {
		clearTsDiagnosticsCache();
		rmSync(projectDir, { recursive: true, force: true });
	});

	test("reports type errors in the edited file", () => {
		const file = join(projectDir, "broken.ts");
		writeFileSync(file, `const x: number = "hello";\nexport { x };\n`, "utf-8");

		const diagnostics = getTsDiagnostics(file);
		expect(diagnostics).toContain("TS2322");
		expect(diagnostics).toContain("1:7");
	});

	test("returns null once the file is clean again", () => {
		const file = join(projectDir, "fixme.ts");
		writeFileSync(file, `const x: number = "hello";\nexport { x };\n`, "utf-8");
		expect(getTsDiagnostics(file)).toContain("TS2322");

		writeFileSync(file, `const x: number = 42;\nexport { x };\n`, "utf-8");
		expect(getTsDiagnostics(file)).toBeNull();
	});

	test("checks files created after the project service was built", () => {
		// Build the service from an existing file, then add a new one the tsconfig
		// parse never saw — the extraFiles path must still type-check it.
		const first = join(projectDir, "first.ts");
		writeFileSync(first, `export const a = 1;\n`, "utf-8");
		expect(getTsDiagnostics(first)).toBeNull();

		const second = join(projectDir, "second.ts");
		writeFileSync(second, `const b: string = 5;\nexport { b };\n`, "utf-8");
		expect(getTsDiagnostics(second)).toContain("TS2322");
	});

	test("returns null for non-TypeScript files and declaration files", () => {
		const md = join(projectDir, "note.md");
		writeFileSync(md, "# hi", "utf-8");
		expect(getTsDiagnostics(md)).toBeNull();

		const dts = join(projectDir, "types.d.ts");
		writeFileSync(dts, "declare const broken: ;\n", "utf-8");
		expect(getTsDiagnostics(dts)).toBeNull();
	});

	test("returns null when there is no tsconfig or no project typescript", () => {
		// os tmpdir has neither a tsconfig nor a resolvable typescript package.
		const outside = mkdtempSync(join(tmpdir(), "kin-tsdiag-"));
		try {
			const file = join(outside, "loose.ts");
			writeFileSync(file, `const x: number = "hello";\n`, "utf-8");
			expect(getTsDiagnostics(file)).toBeNull();
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});

	test("ignores files inside node_modules", () => {
		const dir = join(projectDir, "node_modules", "dep");
		mkdirSync(dir, { recursive: true });
		const file = join(dir, "index.ts");
		writeFileSync(file, `const x: number = "hello";\n`, "utf-8");
		expect(getTsDiagnostics(file)).toBeNull();
	});

	test("edit tool surfaces type errors introduced by the edit", async () => {
		const file = join(projectDir, "app.ts");
		writeFileSync(file, `const x: number = 42;\nexport { x };\n`, "utf-8");

		const tool = createEditTool(projectDir);
		const result = await tool.execute("call-1", { path: file, edits: [{ oldText: "= 42", newText: '= "hello"' }] });
		const text = result.content.map((c) => ("text" in c ? c.text : "")).join("\n");
		expect(text).toContain("TypeScript errors");
		expect(text).toContain("TS2322");
	});

	test("write tool surfaces type errors in the written file", async () => {
		const tool = createWriteTool(projectDir);
		const result = await tool.execute("call-1", {
			path: join(projectDir, "fresh.ts"),
			content: `const y: string = 7;\nexport { y };\n`,
		});
		const text = result.content.map((c) => ("text" in c ? c.text : "")).join("\n");
		expect(text).toContain("TypeScript errors");
		expect(text).toContain("TS2322");
	});

	test("baseline suppresses pre-existing errors and reports only new ones", () => {
		const file = join(projectDir, "legacy.ts");
		writeFileSync(file, `const old: number = "pre-existing";\nexport { old };\n`, "utf-8");
		captureTsBaseline(file);

		// Nothing new yet — the pre-existing error must not be reported.
		expect(getTsDiagnostics(file)).toBeNull();

		// An edit adds a fresh error; the pre-existing one moved lines but stays suppressed.
		writeFileSync(
			file,
			`const fresh: string = 42;\nconst old: number = "pre-existing";\nexport { old, fresh };\n`,
			"utf-8",
		);
		const diagnostics = getTsDiagnostics(file);
		// New error: number assigned to string. Pre-existing (string to number) stays suppressed.
		expect(diagnostics).toContain("Type 'number' is not assignable to type 'string'");
		expect(diagnostics).not.toContain("Type 'string' is not assignable to type 'number'");
	});

	test("edit tool does not report errors it did not introduce", async () => {
		const file = join(projectDir, "dirty.ts");
		writeFileSync(
			file,
			`const broken: number = "user left this";\nconst label = "before";\nexport { broken, label };\n`,
			"utf-8",
		);

		const tool = createEditTool(projectDir);
		const result = await tool.execute("call-1", {
			path: file,
			edits: [{ oldText: '"before"', newText: '"after"' }],
		});
		const text = result.content.map((c) => ("text" in c ? c.text : "")).join("\n");
		expect(text).not.toContain("TypeScript errors");
	});

	test("is disabled via KIN_NO_EDIT_DIAGNOSTICS", () => {
		const file = join(projectDir, "broken.ts");
		writeFileSync(file, `const x: number = "hello";\nexport { x };\n`, "utf-8");
		process.env.KIN_NO_EDIT_DIAGNOSTICS = "1";
		try {
			expect(getTsDiagnostics(file)).toBeNull();
		} finally {
			delete process.env.KIN_NO_EDIT_DIAGNOSTICS;
		}
	});
});
