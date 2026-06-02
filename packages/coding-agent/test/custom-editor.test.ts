import { stripVTControlCharacters } from "node:util";
import type { TUI } from "@landongarrison/kin-tui";
import { visibleWidth } from "@landongarrison/kin-tui";
import { describe, expect, it } from "vitest";
import { KeybindingsManager } from "../src/core/keybindings.js";
import { CustomEditor } from "../src/modes/interactive/components/custom-editor.js";
import { getEditorTheme, initTheme } from "../src/modes/interactive/theme/theme.js";

function createTestTui(rows = 24): TUI {
	return {
		terminal: { rows },
		requestRender: () => {},
	} as unknown as TUI;
}

describe("CustomEditor", () => {
	it("renders the default prompt in a framed command box", () => {
		initTheme(undefined, false);
		const editor = new CustomEditor(createTestTui(), getEditorTheme(), new KeybindingsManager(), { paddingX: 0 });
		const lines = editor.render(40);

		expect(lines.map((line) => visibleWidth(line))).toEqual(lines.map(() => 40));
		expect(lines).toHaveLength(3);
		expect(stripVTControlCharacters(lines[0] ?? "")).toMatch(/^╭─+╮$/);
		expect(stripVTControlCharacters(lines[1] ?? "")).toContain("›");
		expect(stripVTControlCharacters(lines[1] ?? "")).toContain("Type a command...");
		expect(stripVTControlCharacters(lines.at(-1) ?? "")).toContain(" pi ");
	});

	it("switches the prompt box label in bash mode", () => {
		initTheme(undefined, false);
		const editor = new CustomEditor(createTestTui(), getEditorTheme(), new KeybindingsManager(), { paddingX: 0 });
		editor.setText("!ls");

		expect(stripVTControlCharacters(editor.render(40).at(-1) ?? "")).toContain(" bash ");
	});
});
