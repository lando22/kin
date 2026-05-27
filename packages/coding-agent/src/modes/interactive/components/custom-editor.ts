import {
	Editor,
	type EditorOptions,
	type EditorTheme,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/kin-tui";
import { APP_NAME } from "../../../config.ts";
import type { AppKeybinding, KeybindingsManager } from "../../../core/keybindings.ts";
import { theme } from "../theme/theme.ts";

const MIN_FRAMED_EDITOR_WIDTH = 16;
const PROMPT_MARKER = "›";

function padToWidth(text: string, width: number): string {
	const currentWidth = visibleWidth(text);
	if (currentWidth >= width) {
		return truncateToWidth(text, width, "");
	}
	return text + " ".repeat(width - currentWidth);
}

function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}

function borderText(text: string): string {
	return theme.fg("borderMuted", text);
}

function extractScrollLabel(line: string): string | undefined {
	const plain = stripAnsi(line).replace(/─/g, " ").replace(/\s+/g, " ").trim();
	return plain.includes("↑") || plain.includes("↓") ? plain : undefined;
}

function isEditorBorderLine(line: string): boolean {
	const plain = stripAnsi(line).trim();
	return /^─+$/.test(plain) || /^─── [↑↓] \d+ more ─*$/.test(plain);
}

function buildBorder(width: number, left: string, right: string, leftLabel?: string, rightLabel?: string): string {
	const innerWidth = Math.max(0, width - 2);
	const safeLeftLabel = leftLabel ? ` ${truncateToWidth(leftLabel, Math.max(0, innerWidth - 2), "")} ` : "";
	const safeRightLabel = rightLabel ? ` ${truncateToWidth(rightLabel, Math.max(0, innerWidth - 2), "")} ` : "";
	const leftLabelWidth = visibleWidth(safeLeftLabel);
	const rightLabelWidth = visibleWidth(safeRightLabel);

	if (leftLabelWidth + rightLabelWidth >= innerWidth) {
		return borderText(left + "─".repeat(innerWidth) + right);
	}

	const middleDashWidth = innerWidth - leftLabelWidth - rightLabelWidth;
	const leftDashWidth = safeLeftLabel ? 1 : Math.max(0, middleDashWidth - (safeRightLabel ? 1 : 0));
	const rightDashWidth = Math.max(0, middleDashWidth - leftDashWidth);

	return [
		borderText(left),
		borderText("─".repeat(leftDashWidth)),
		safeLeftLabel ? theme.fg("dim", safeLeftLabel) : "",
		borderText("─".repeat(rightDashWidth)),
		safeRightLabel ? theme.fg("dim", safeRightLabel) : "",
		borderText(right),
	].join("");
}

/**
 * Custom editor that handles app-level keybindings for coding-agent.
 */
export class CustomEditor extends Editor {
	private keybindings: KeybindingsManager;
	public actionHandlers: Map<AppKeybinding, () => void> = new Map();

	// Special handlers that can be dynamically replaced
	public onEscape?: () => void;
	public onCtrlD?: () => void;
	public onPasteImage?: () => void;
	/** Handler for extension-registered shortcuts. Returns true if handled. */
	public onExtensionShortcut?: (data: string) => boolean;

	constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, options?: EditorOptions) {
		super(tui, theme, options);
		this.keybindings = keybindings;
	}

	render(width: number): string[] {
		if (width < MIN_FRAMED_EDITOR_WIDTH) {
			return super.render(width);
		}

		const textAreaWidth = Math.max(1, width - 4);
		const baseLines = super.render(textAreaWidth);
		if (baseLines.length < 3) {
			return baseLines;
		}

		const bottomBorderIndex = (() => {
			for (let i = baseLines.length - 1; i >= 1; i--) {
				if (isEditorBorderLine(baseLines[i] ?? "")) {
					return i;
				}
			}
			return baseLines.length - 1;
		})();

		const topScrollLabel = extractScrollLabel(baseLines[0] ?? "");
		const bottomScrollLabel = extractScrollLabel(baseLines[bottomBorderIndex] ?? "");
		const contentLines = baseLines.slice(1, bottomBorderIndex);
		const autocompleteLines = baseLines.slice(bottomBorderIndex + 1);
		const rightLabel = this.getText().trim().startsWith("!") ? "bash" : APP_NAME;
		const result: string[] = [buildBorder(width, "╭", "╮", topScrollLabel)];
		const isEmpty = this.getText().length === 0;

		for (let i = 0; i < contentLines.length; i++) {
			const prefix = i === 0 ? `${theme.fg("accent", PROMPT_MARKER)} ` : "  ";
			let content = (contentLines[i] ?? "").trimEnd();
			if (isEmpty && i === 0) {
				content += theme.fg("dim", " Type a command...");
			}
			result.push(`${borderText("│")}${prefix}${padToWidth(content, textAreaWidth)}${borderText("│")}`);
		}

		for (const line of autocompleteLines) {
			const content = line.trimEnd();
			result.push(`${borderText("│")}  ${padToWidth(content, textAreaWidth)}${borderText("│")}`);
		}

		result.push(buildBorder(width, "╰", "╯", bottomScrollLabel, rightLabel));
		return result;
	}

	/**
	 * Register a handler for an app action.
	 */
	onAction(action: AppKeybinding, handler: () => void): void {
		this.actionHandlers.set(action, handler);
	}

	handleInput(data: string): void {
		// Check extension-registered shortcuts first
		if (this.onExtensionShortcut?.(data)) {
			return;
		}

		// Check for paste image keybinding
		if (this.keybindings.matches(data, "app.clipboard.pasteImage")) {
			this.onPasteImage?.();
			return;
		}

		// Check app keybindings first

		// Escape/interrupt - only if autocomplete is NOT active
		if (this.keybindings.matches(data, "app.interrupt")) {
			if (!this.isShowingAutocomplete()) {
				// Use dynamic onEscape if set, otherwise registered handler
				const handler = this.onEscape ?? this.actionHandlers.get("app.interrupt");
				if (handler) {
					handler();
					return;
				}
			}
			// Let parent handle escape for autocomplete cancellation
			super.handleInput(data);
			return;
		}

		// Exit (Ctrl+D) - only when editor is empty
		if (this.keybindings.matches(data, "app.exit")) {
			if (this.getText().length === 0) {
				const handler = this.onCtrlD ?? this.actionHandlers.get("app.exit");
				if (handler) handler();
				return;
			}
			// Fall through to editor handling for delete-char-forward when not empty
		}

		// Check all other app actions
		for (const [action, handler] of this.actionHandlers) {
			if (action !== "app.interrupt" && action !== "app.exit" && this.keybindings.matches(data, action)) {
				handler();
				return;
			}
		}

		// Pass to parent for editor handling
		super.handleInput(data);
	}
}
