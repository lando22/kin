import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createDefinitionToolDefinition } from "../src/core/tools/definition.js";

describe("definition tool", () => {
	let dir: string;
	let tool: any;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "kin-def-"));
		mkdirSync(join(dir, "src"), { recursive: true });
		writeFileSync(
			join(dir, "src", "user.ts"),
			[
				"export class UserService {",
				"  getUser() { return null; }",
				"}",
				"",
				"export const makeUser = () => ({});",
				"export function deleteUser() {}",
				"type UserId = string;",
				"",
				"// a usage, not a definition:",
				"const svc = new UserService();",
			].join("\n"),
		);
		writeFileSync(join(dir, "src", "py_user.py"), "def make_user():\n    return {}\n");
		tool = createDefinitionToolDefinition(dir);
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	async function find(name: string): Promise<string> {
		const res = await tool.execute("id", { name }, undefined);
		return res.content.map((c: { text?: string }) => c.text ?? "").join("\n");
	}

	test("finds a class declaration, not its usages", async () => {
		const out = await find("UserService");
		expect(out).toContain("src/user.ts:1:");
		expect(out).toContain("class UserService");
		// The `new UserService()` usage on line 10 must not be reported as a definition.
		expect(out).not.toContain(":10:");
	});

	test("finds an arrow-function const assignment", async () => {
		const out = await find("makeUser");
		expect(out).toContain("src/user.ts:5:");
		expect(out).toContain("makeUser");
	});

	test("finds a function declaration and a type alias", async () => {
		expect(await find("deleteUser")).toContain("deleteUser");
		expect(await find("UserId")).toContain("type UserId");
	});

	test("finds a python def via a different keyword", async () => {
		const out = await find("make_user");
		expect(out).toContain("py_user.py:1:");
	});

	test("returns a bash-with-rg fallback hint when nothing matches", async () => {
		const out = await find("NoSuchSymbol");
		expect(out.toLowerCase()).toContain("no definition found");
		expect(out).toContain("bash with rg");
	});
});
