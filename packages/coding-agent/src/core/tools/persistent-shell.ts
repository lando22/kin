import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
	getShellConfig,
	getShellEnv,
	killProcessTree,
	trackDetachedChildPid,
	untrackDetachedChildPid,
} from "../../utils/shell.ts";
import type { BashOperations } from "./bash.ts";

/**
 * A persistent shell session: one long-lived shell process that all commands are fed into,
 * so working directory, environment variables, and shell state carry across calls. This is
 * the difference from the one-shot backend (which spawns a fresh `bash -c` every command and
 * forgets everything) — here a `cd` or an `export` in one command is still in effect for the
 * next.
 *
 * How completion is detected: each command is followed by a printf of a per-command random
 * sentinel plus the command's exit code. We scan stdout for that sentinel; everything before
 * it is the command's output, and the trailing integer is the exit code. A random UUID marker
 * is collision-free against real output for practical purposes.
 *
 * Each command's stdin is redirected from /dev/null inside a brace group, so a program that
 * reads stdin (a bare `cat`, a REPL) gets EOF — exactly as it would under the one-shot backend,
 * and crucially without consuming the shared command pipe. So this adds state persistence, not
 * interactive-program support.
 *
 * Failure handling is deliberately blunt: a single shell serves every command, so there is no
 * safe way to interrupt just one runaway command. On timeout, abort, or an unexpected shell
 * exit we tear the whole shell down and respawn lazily on the next command — persisted state is
 * lost on that path, which is the documented cost of recovery.
 */
export class PersistentShell {
	private readonly shellPath: string;
	private readonly env: NodeJS.ProcessEnv;
	private readonly startCwd: string;
	private child: ChildProcess | null = null;

	/** State for the command currently in flight, or null between commands. */
	private current: {
		marker: string;
		buf: string;
		onData: (data: Buffer) => void;
		settle: (result: { exitCode: number | null } | { error: Error }) => void;
	} | null = null;

	constructor(opts: { shellPath?: string; cwd: string; env?: NodeJS.ProcessEnv }) {
		this.shellPath = getShellConfig(opts.shellPath).shell;
		this.startCwd = opts.cwd;
		this.env = opts.env ?? getShellEnv();
	}

	/** Start the shell if it isn't running. Restarts here land back at the original cwd. */
	private ensureStarted(): ChildProcess {
		if (this.child && this.child.exitCode === null && !this.child.killed) {
			return this.child;
		}
		const cwd = existsSync(this.startCwd) ? this.startCwd : process.cwd();
		// No `-c`: with stdin piped, the shell reads commands from stdin one after another.
		const child = spawn(this.shellPath, [], {
			cwd,
			detached: process.platform !== "win32",
			env: this.env,
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		if (child.pid) trackDetachedChildPid(child.pid);
		// Guard every listener on child identity: a shell we tore down can still emit a late
		// exit/data event, and without this it would clobber the freshly respawned shell's state.
		child.stdout?.on("data", (data: Buffer) => {
			if (this.child === child) this.onStdout(data);
		});
		child.stderr?.on("data", (data: Buffer) => {
			if (this.child === child) this.current?.onData(data);
		});
		child.on("exit", (code) => {
			if (this.child === child) this.onShellGone({ exitCode: code });
		});
		child.on("error", (error) => {
			if (this.child === child) this.onShellGone({ error });
		});
		this.child = child;
		return child;
	}

	/** Scan stdout for the in-flight command's sentinel, forwarding real output as it arrives. */
	private onStdout(data: Buffer): void {
		const cur = this.current;
		// Output arriving with no command in flight (e.g. a late background job) is dropped.
		if (!cur) return;
		cur.buf += data.toString("utf8");

		const markerIdx = cur.buf.indexOf(cur.marker);
		if (markerIdx === -1) {
			// No sentinel yet. Forward everything except a tail that could be a split sentinel.
			const safe = cur.buf.length - (cur.marker.length - 1);
			if (safe > 0) {
				cur.onData(Buffer.from(cur.buf.slice(0, safe), "utf8"));
				cur.buf = cur.buf.slice(safe);
			}
			return;
		}

		// Sentinel present. Wait until the exit-code line after it has fully arrived.
		const tail = cur.buf.slice(markerIdx + cur.marker.length);
		const codeMatch = /^ (\d+)\r?\n/.exec(tail);
		if (!codeMatch) {
			// Forward output before the sentinel now; keep the sentinel+partial-code buffered.
			const pre = cur.buf.slice(0, markerIdx);
			if (pre.length > 0) cur.onData(Buffer.from(pre, "utf8"));
			cur.buf = cur.buf.slice(markerIdx);
			return;
		}

		const pre = cur.buf.slice(0, markerIdx);
		if (pre.length > 0) cur.onData(Buffer.from(pre, "utf8"));
		cur.settle({ exitCode: Number.parseInt(codeMatch[1], 10) });
	}

	/** The shell process ended (a command ran `exit`, it crashed, or we killed it). */
	private onShellGone(result: { exitCode: number | null } | { error: Error }): void {
		this.child = null;
		const cur = this.current;
		if (!cur) return;
		// A command that ran `exit N` has no sentinel; report the shell's own exit code.
		cur.settle(result);
	}

	/** Run one command, resolving with its exit code once the sentinel is seen. */
	exec(
		command: string,
		options: { onData: (data: Buffer) => void; signal?: AbortSignal; timeout?: number },
	): Promise<{ exitCode: number | null }> {
		const { onData, signal, timeout } = options;

		// An empty command would make the brace group a syntax error; treat it as a no-op success.
		if (command.trim().length === 0) {
			return Promise.resolve({ exitCode: 0 });
		}
		if (this.current) {
			return Promise.reject(new Error("Persistent shell received a command while another was still running"));
		}
		if (signal?.aborted) {
			return Promise.reject(new Error("aborted"));
		}

		const child = this.ensureStarted();
		const marker = `__KIN_DONE_${randomUUID().replace(/-/g, "")}__`;

		return new Promise((resolve, reject) => {
			let settled = false;
			let timeoutHandle: NodeJS.Timeout | undefined;

			const teardownShell = () => {
				if (this.child?.pid) {
					untrackDetachedChildPid(this.child.pid);
					killProcessTree(this.child.pid);
				}
				this.child = null;
			};

			const settle = (result: { exitCode: number | null } | { error: Error }) => {
				if (settled) return;
				settled = true;
				if (timeoutHandle) clearTimeout(timeoutHandle);
				if (signal) signal.removeEventListener("abort", onAbort);
				this.current = null;
				if ("error" in result) reject(result.error);
				else resolve(result);
			};

			const onAbort = () => {
				teardownShell();
				settle({ error: new Error("aborted") });
			};

			this.current = { marker, buf: "", onData, settle };

			if (timeout !== undefined && timeout > 0) {
				timeoutHandle = setTimeout(() => {
					teardownShell();
					settle({ error: new Error(`timeout:${timeout}`) });
				}, timeout * 1000);
			}
			if (signal) signal.addEventListener("abort", onAbort, { once: true });

			// Brace group keeps cd/export in THIS shell (a subshell would discard them); </dev/null
			// gives the command EOF on stdin so it can't read from the command pipe.
			const script = `{\n${command}\n} </dev/null\n__kin_ec=$?\nprintf '%s %d\\n' "${marker}" "$__kin_ec"\n`;
			try {
				child.stdin?.write(script);
			} catch (error) {
				teardownShell();
				settle({ error: error instanceof Error ? error : new Error(String(error)) });
			}
		});
	}

	/** Kill the shell and its descendants. Safe to call more than once. */
	dispose(): void {
		if (this.child?.pid) {
			untrackDetachedChildPid(this.child.pid);
			killProcessTree(this.child.pid);
		}
		this.child = null;
		this.current = null;
	}
}

/**
 * A {@link BashOperations} backend whose commands share one persistent shell, so working
 * directory and environment survive between bash tool calls. The shell starts lazily on the
 * first command (at that command's cwd) and lives until {@link dispose} is called — wire that
 * into session teardown so the process doesn't leak.
 */
export function createPersistentBashOperations(opts?: { shellPath?: string }): BashOperations & {
	dispose: () => void;
} {
	let shell: PersistentShell | null = null;
	return {
		exec(command, cwd, { onData, signal, timeout, env }) {
			if (!shell) {
				shell = new PersistentShell({ shellPath: opts?.shellPath, cwd, env });
			}
			return shell.exec(command, { onData, signal, timeout });
		},
		dispose() {
			shell?.dispose();
			shell = null;
		},
	};
}
