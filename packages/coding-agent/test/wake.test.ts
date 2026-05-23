import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildWakeContext,
	formatWakeContextMessage,
	getWakePath,
	getWakeSeenPath,
	isNoneResponse,
	isWakeSeen,
	markWakeSeen,
	readUnseenWake,
	writeWake,
} from "../src/core/wake.js";

describe("Wake engine", () => {
	describe("isNoneResponse", () => {
		it("matches <NONE> exactly", () => {
			expect(isNoneResponse("<NONE>")).toBe(true);
		});

		it("ignores surrounding whitespace", () => {
			expect(isNoneResponse("  <NONE>  ")).toBe(true);
			expect(isNoneResponse("<NONE>\n")).toBe(true);
		});

		it("is case-insensitive", () => {
			expect(isNoneResponse("<none>")).toBe(true);
			expect(isNoneResponse("<None>")).toBe(true);
		});

		it("rejects non-none responses", () => {
			expect(isNoneResponse("Good morning!")).toBe(false);
			expect(isNoneResponse("")).toBe(false);
			expect(isNoneResponse("Something <NONE> here")).toBe(false);
		});
	});

	describe("buildWakeContext", () => {
		it("includes reflection, memory, and project content in the user prompt", () => {
			const ctx = buildWakeContext({
				reflection: "Today we built a lot.",
				reflectionDate: "2026-05-21",
				memory: "# User\nLandon",
				projectContent: "# Project\nPi",
				projectName: "pi",
			});

			const firstContent = ctx.messages[0]!.content[0]!;
			if (typeof firstContent === "string" || firstContent.type !== "text") {
				throw new Error("Expected wake prompt content to be text");
			}
			const userText = firstContent.text;
			expect(ctx.systemPrompt).toContain("<NONE>");
			expect(userText).toContain("Today we built a lot.");
			expect(userText).toContain("# User");
			expect(userText).toContain("# Project");
			expect(userText).toContain("pi");
		});

		it("shows placeholder for empty files", () => {
			const ctx = buildWakeContext({
				reflection: "R",
				reflectionDate: "2026-05-21",
				memory: null,
				projectContent: null,
				projectName: "unknown",
			});

			const firstContent = ctx.messages[0]!.content[0]!;
			if (typeof firstContent === "string" || firstContent.type !== "text") {
				throw new Error("Expected wake prompt content to be text");
			}
			const userText = firstContent.text;
			expect(userText).toContain("*(empty memory file)*");
			expect(userText).toContain("*(empty project file)*");
		});
	});

	describe("wake seen state", () => {
		it("reads an unseen wake and marks it seen", () => {
			const homeDir = mkdtempSync(join(tmpdir(), "pi-wake-test-"));
			try {
				const date = new Date("2026-05-22T12:00:00");
				writeWake("Morning. Let's start with the weird part.", date, homeDir);

				expect(getWakePath(date, homeDir)).toContain("2026-05-22/WAKE.md");
				expect(getWakeSeenPath(date, homeDir)).toContain("2026-05-22/WAKE.seen");
				expect(isWakeSeen(date, homeDir)).toBe(false);
				expect(readUnseenWake(date, homeDir)?.content).toBe("Morning. Let's start with the weird part.");

				markWakeSeen(date, homeDir);

				expect(isWakeSeen(date, homeDir)).toBe(true);
				expect(readUnseenWake(date, homeDir)).toBeNull();
			} finally {
				rmSync(homeDir, { recursive: true, force: true });
			}
		});

		it("makes an overwritten wake unseen again", () => {
			const homeDir = mkdtempSync(join(tmpdir(), "pi-wake-test-"));
			try {
				const date = new Date("2026-05-22T12:00:00");
				writeWake("First wake", date, homeDir);
				markWakeSeen(date, homeDir);

				writeWake("Second wake", date, homeDir);

				expect(isWakeSeen(date, homeDir)).toBe(false);
				expect(readUnseenWake(date, homeDir)?.content).toBe("Second wake");
			} finally {
				rmSync(homeDir, { recursive: true, force: true });
			}
		});
	});

	describe("formatWakeContextMessage", () => {
		it("wraps wake text for LLM context", () => {
			expect(formatWakeContextMessage("  Morning.\n\nStart here.  ")).toBe(
				"<wake>\nMorning.\n\nStart here.\n</wake>",
			);
		});
	});
});
