import {
	type Component,
	Markdown,
	type MarkdownTheme,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@landongarrison/kin-tui";
import { getMarkdownTheme, theme } from "../theme/theme.ts";

const WAKE_BORDER_COLOR = "#ffcd79";
const SUNRISE_FRAMES = ["  o  ", " .o. ", " \\o/ ", " \\O/ ", " \\O/ ", " \\o/ ", " .o. "] as const;
const SUNRISE_HORIZON = "~~~~~";
const MAX_ANIMATION_TICKS = 80;

function truecolorForeground(hex: string, text: string): string {
	const cleaned = hex.replace("#", "");
	const r = parseInt(cleaned.slice(0, 2), 16);
	const g = parseInt(cleaned.slice(2, 4), 16);
	const b = parseInt(cleaned.slice(4, 6), 16);
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

function padToWidth(text: string, width: number): string {
	const currentWidth = visibleWidth(text);
	if (currentWidth >= width) {
		return truncateToWidth(text, width, "");
	}
	return text + " ".repeat(width - currentWidth);
}

/** Component that renders Kin's unseen daily wake message. */
export class WakeMessageComponent implements Component {
	private readonly markdown: Markdown;
	private readonly tui: TUI;
	private interval: ReturnType<typeof setInterval> | undefined;
	private tick = 0;

	constructor(tui: TUI, message: string, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		this.tui = tui;
		this.markdown = new Markdown(message.trim(), 0, 0, markdownTheme, {
			color: (text: string) => theme.fg("text", text),
		});
		this.startAnimation();
	}

	invalidate(): void {
		this.markdown.invalidate();
	}

	dispose(): void {
		this.stopAnimation();
	}

	render(width: number): string[] {
		const border = (text: string) => truecolorForeground(WAKE_BORDER_COLOR, text);
		const contentWidth = Math.max(1, width - 4);
		const result: string[] = [];

		result.push(border(`┌${"┄".repeat(Math.max(1, width - 2))}┐`));
		result.push(`${border("┆")} ${padToWidth(this.renderSunrise(), contentWidth)} ${border("┆")}`);
		result.push(`${border("┆")} ${padToWidth(border(SUNRISE_HORIZON), contentWidth)} ${border("┆")}`);
		result.push(`${border("┆")} ${" ".repeat(contentWidth)} ${border("┆")}`);

		for (const line of this.markdown.render(contentWidth)) {
			result.push(`${border("┆")} ${padToWidth(line, contentWidth)} ${border("┆")}`);
		}

		result.push(border(`└${"┄".repeat(Math.max(1, width - 2))}┘`));
		return result;
	}

	private renderSunrise(): string {
		const frame = SUNRISE_FRAMES[this.tick % SUNRISE_FRAMES.length];
		return truecolorForeground(WAKE_BORDER_COLOR, frame);
	}

	private startAnimation(): void {
		this.interval = setInterval(() => {
			this.tick += 1;
			if (this.tick >= MAX_ANIMATION_TICKS) {
				this.stopAnimation();
			}
			this.tui.requestRender();
		}, 500);
		this.interval.unref?.();
	}

	private stopAnimation(): void {
		if (!this.interval) return;
		clearInterval(this.interval);
		this.interval = undefined;
	}
}
