import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { PersistentShell } from "../src/core/tools/persistent-shell.js";

describe("PersistentShell", () => {
	let dir: string;
	let shell: PersistentShell;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "kin-shell-"));
		shell = new PersistentShell({ cwd: dir });
	});

	afterEach(() => {
		shell.dispose();
		rmSync(dir, { recursive: true, force: true });
	});

	/** Run a command, collecting forwarded output into a string. */
	async function run(command: string, opts?: { signal?: AbortSignal; timeout?: number }) {
		let out = "";
		const res = await shell.exec(command, {
			onData: (d) => {
				out += d.toString("utf8");
			},
			...opts,
		});
		return { out, exitCode: res.exitCode };
	}

	test("captures stdout and the exit code, without leaking the sentinel", async () => {
		const { out, exitCode } = await run("echo hello");
		expect(out.trim()).toBe("hello");
		expect(out).not.toContain("__KIN_DONE_");
		expect(exitCode).toBe(0);
	});

	test("reports a non-zero exit code", async () => {
		expect((await run("false")).exitCode).toBe(1);
		expect((await run("exit 0; true")).exitCode).toBe(0);
	});

	test("forwards stderr as output too", async () => {
		const { out } = await run("echo oops 1>&2");
		expect(out).toContain("oops");
	});

	test("persists working directory across commands", async () => {
		await run(`cd ${dir}`);
		await run("echo persisted > marker.txt");
		// A later command resolving a relative path proves cwd carried over.
		const { out } = await run("cat marker.txt");
		expect(out.trim()).toBe("persisted");
	});

	test("persists environment variables across commands", async () => {
		await run("export KIN_TEST=carried");
		const { out } = await run("echo $KIN_TEST");
		expect(out.trim()).toBe("carried");
	});

	test("gives a stdin-reading command EOF instead of letting it eat the command pipe", async () => {
		// `cat` with no args would block forever on a live stdin; here it must get EOF and exit.
		const { out, exitCode } = await run("cat", { timeout: 5 });
		expect(out).toBe("");
		expect(exitCode).toBe(0);
		// The shell is still healthy and ordered afterward.
		expect((await run("echo after")).out.trim()).toBe("after");
	});

	test("an `exit` builtin reports the shell's code and the next command respawns the shell", async () => {
		expect((await run("exit 7")).exitCode).toBe(7);
		expect((await run("echo back")).out.trim()).toBe("back");
	});

	test("times out a hung command and recovers on the next command", async () => {
		await expect(run("sleep 30", { timeout: 1 })).rejects.toThrow("timeout:1");
		expect((await run("echo recovered")).out.trim()).toBe("recovered");
	});

	test("aborts a running command via signal", async () => {
		const controller = new AbortController();
		const pending = run("sleep 30", { signal: controller.signal });
		setTimeout(() => controller.abort(), 100);
		await expect(pending).rejects.toThrow("aborted");
		expect((await run("echo alive")).out.trim()).toBe("alive");
	});

	test("an empty command is a no-op success", async () => {
		expect(await run("   ")).toEqual({ out: "", exitCode: 0 });
	});
});
