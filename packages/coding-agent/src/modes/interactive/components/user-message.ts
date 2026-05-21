import { Container, Markdown, type MarkdownTheme, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.ts";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const USER_MARKER = "›";
const MESSAGE_PADDING_X = 2;
const MESSAGE_PADDING_Y = 1;
const MESSAGE_PREFIX_WIDTH = 2;

function padToWidth(text: string, width: number): string {
	const currentWidth = visibleWidth(text);
	if (currentWidth >= width) {
		return truncateToWidth(text, width, "");
	}
	return text + " ".repeat(width - currentWidth);
}

/**
 * Component that renders a user message
 */
export class UserMessageComponent extends Container {
	private text: string;
	private markdownTheme: MarkdownTheme;

	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();
		this.text = text;
		this.markdownTheme = markdownTheme;
	}

	override render(width: number): string[] {
		const contentWidth = Math.max(1, width - MESSAGE_PADDING_X * 2 - MESSAGE_PREFIX_WIDTH);
		const markdown = new Markdown(this.text, 0, 0, this.markdownTheme, {
			color: (content: string) => theme.fg("userMessageText", content),
		});
		const rendered = markdown.render(contentWidth);
		const blankLine = theme.bg("userMessageBg", " ".repeat(width));
		const lines = rendered.map((line, index) => {
			const marker = index === 0 ? theme.fg("accent", USER_MARKER) : " ";
			const content = padToWidth(line.trimEnd(), contentWidth);
			return theme.bg(
				"userMessageBg",
				`${" ".repeat(MESSAGE_PADDING_X)}${marker} ${content}${" ".repeat(MESSAGE_PADDING_X)}`,
			);
		});

		if (lines.length === 0) {
			return lines;
		}

		for (let i = 0; i < MESSAGE_PADDING_Y; i++) {
			lines.unshift(blankLine);
			lines.push(blankLine);
		}

		lines[0] = OSC133_ZONE_START + lines[0];
		lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1];
		return lines;
	}
}
