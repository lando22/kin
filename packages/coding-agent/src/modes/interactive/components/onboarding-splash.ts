import { type Component, type Focusable, type TUI, visibleWidth } from "@landongarrison/kin-tui";

const BRAND_COLORS = ["#ffcd79", "#ffb887", "#dfa9ff", "#ff9d79"] as const;
const WORDMARK_TEXT = "Kin";
const WORDMARK_GAP = 2;
const TAGLINE = "Your personal intelligence. Remembers. Learns. Helps.";
const CONTENT_WIDTH = TAGLINE.length; // widest line — holds centering stable
const SQUARE_REVEAL_TICKS = 8;
const COLOR_CYCLE_START = 24;
const COLOR_CYCLE_RATE = 4;
const WORDMARK_START = 32;
const TAGLINE_START = 50;
const INTRO_TOTAL = TAGLINE_START + TAGLINE.length;
const PROMPT_START = INTRO_TOTAL;
const TICK_MS = 70;

function truecolorFg(hex: string, text: string): string {
	const cleaned = hex.replace("#", "");
	const r = parseInt(cleaned.slice(0, 2), 16);
	const g = parseInt(cleaned.slice(2, 4), 16);
	const b = parseInt(cleaned.slice(4, 6), 16);
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

function halfBlock(topHex: string, bottomHex: string): string {
	const tc = topHex.replace("#", "");
	const bc = bottomHex.replace("#", "");
	const tr = parseInt(tc.slice(0, 2), 16),
		tg = parseInt(tc.slice(2, 4), 16),
		tb = parseInt(tc.slice(4, 6), 16);
	const br = parseInt(bc.slice(0, 2), 16),
		bg = parseInt(bc.slice(2, 4), 16),
		bb = parseInt(bc.slice(4, 6), 16);
	return `\x1b[38;2;${tr};${tg};${tb}m\x1b[48;2;${br};${bg};${bb}m▀\x1b[39m\x1b[49m`;
}

function bold(text: string): string {
	return `\x1b[1m${text}\x1b[22m`;
}

function dim(text: string): string {
	return `\x1b[2m${text}\x1b[22m`;
}

function centeredBlock(contentLines: string[], width: number, minBlockWidth: number): string[] {
	const blockWidth = contentLines.reduce((max, line) => Math.max(max, visibleWidth(line)), minBlockWidth);
	const outerPad = Math.max(0, Math.floor((width - blockWidth) / 2));
	return contentLines.map((line) => {
		const innerPad = Math.max(0, Math.floor((blockWidth - visibleWidth(line)) / 2));
		return " ".repeat(outerPad + innerPad) + line;
	});
}

function centeredLine(text: string, width: number): string {
	const outerPad = Math.max(0, Math.floor((width - visibleWidth(text)) / 2));
	return " ".repeat(outerPad) + text;
}

function renderLogo(tick: number, colorOffset: number): string[] {
	const squaresVisible = Math.min(4, Math.floor(tick / SQUARE_REVEAL_TICKS));
	const cycling = tick >= COLOR_CYCLE_START;
	const colors = BRAND_COLORS.map(
		(_, index) => BRAND_COLORS[(cycling ? index + colorOffset : index) % BRAND_COLORS.length]!,
	);

	// Build the two half-block chars that form the 2×2 color tile
	const leftBlock =
		squaresVisible >= 2
			? halfBlock(squaresVisible >= 1 ? colors[0]! : "#00000000", squaresVisible >= 3 ? colors[2]! : "#00000000")
			: squaresVisible >= 1
				? truecolorFg(colors[0]!, "▀")
				: " ";
	const rightBlock =
		squaresVisible >= 4
			? halfBlock(colors[1]!, colors[3]!)
			: squaresVisible >= 2
				? truecolorFg(colors[1]!, "▀")
				: " ";

	let wordmark = "";
	if (tick >= WORDMARK_START) {
		const progress = Math.min(Math.floor((tick - WORDMARK_START) / 2) + 1, WORDMARK_TEXT.length);
		wordmark = bold(truecolorFg("#ffffff", WORDMARK_TEXT.slice(0, progress)));
	}

	const gap = " ".repeat(WORDMARK_GAP);
	return [`${leftBlock}${rightBlock}${gap}${wordmark}`];
}

function renderSplashFrame(width: number, height: number, tick: number, colorOffset: number): string {
	const lines: string[] = [];
	const contentLines: string[] = renderLogo(tick, colorOffset);
	const showPrompt = tick >= PROMPT_START;

	// Always reserve tagline rows so block height and width stay stable throughout
	contentLines.push("");
	if (tick >= TAGLINE_START) {
		const tagProgress = Math.min(Math.floor(tick - TAGLINE_START) + 1, TAGLINE.length);
		contentLines.push(dim(TAGLINE.slice(0, tagProgress)));
	} else {
		contentLines.push(""); // placeholder — keeps vertical position locked
	}

	const bodyHeight = showPrompt ? Math.max(0, height - 2) : height;
	const topPad = Math.max(0, Math.floor((bodyHeight - contentLines.length) / 2));
	for (let i = 0; i < topPad; i++) {
		lines.push("");
	}
	lines.push(...centeredBlock(contentLines, width, CONTENT_WIDTH));
	while (lines.length < bodyHeight) {
		lines.push("");
	}

	if (showPrompt) {
		const promptText = tick % 14 < 7 ? bold("Press enter to continue") : "Press enter to continue";
		while (lines.length < height - 1) {
			lines.push("");
		}
		lines.push(centeredLine(promptText, width));
	}

	return lines.join("\n");
}

export class OnboardingSplashComponent implements Component, Focusable {
	private tick = 0;
	private colorOffset = 0;
	private lastColorAdvance = 0;
	private intervalId: ReturnType<typeof setInterval> | undefined;
	private tui: TUI;
	private onComplete: () => void;
	private done = false;
	private awaitingEnter = false;

	focused = false;

	constructor(tui: TUI, onComplete: () => void) {
		this.tui = tui;
		this.onComplete = onComplete;
		this.startAnimation();
	}

	invalidate(): void {}

	handleInput(data: string): void {
		if (this.awaitingEnter && (data === "\r" || data === "\n")) {
			this.dispose();
			this.done = true;
			this.onComplete();
		}
	}

	dispose(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = undefined;
		}
	}

	private startAnimation(): void {
		this.intervalId = setInterval(() => {
			if (this.done) return;

			if (this.tick < INTRO_TOTAL) {
				this.tick = Math.min(this.tick + 1, INTRO_TOTAL);
			}

			if (this.tick >= COLOR_CYCLE_START && this.tick - this.lastColorAdvance >= COLOR_CYCLE_RATE) {
				this.colorOffset = (this.colorOffset + 1) % BRAND_COLORS.length;
				this.lastColorAdvance = this.tick;
			}

			if (this.tick >= PROMPT_START && !this.awaitingEnter) {
				this.awaitingEnter = true;
			}

			this.tui.requestRender();
		}, TICK_MS);
	}

	render(width: number): string[] {
		return renderSplashFrame(width, this.tui.terminal.rows, this.tick, this.colorOffset).split("\n");
	}
}
