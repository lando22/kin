import { type Component, type Focusable, type TUI, visibleWidth } from "@earendil-works/pi-tui";

const BRAND_COLORS = ["#ffcd79", "#ffb887", "#dfa9ff", "#ff9d79"] as const;
const TILE_WIDTH = 2;
const WORDMARK_GAP = 2;
const WORDMARK_TOP = "█▀█  ▀";
const WORDMARK_BOTTOM = "█▀▀  █";
const LOGO_WIDTH = TILE_WIDTH * 2 + WORDMARK_GAP + WORDMARK_TOP.length;
const SQUARE_REVEAL_TICKS = 8;
const COLOR_CYCLE_START = 24;
const COLOR_CYCLE_RATE = 4;
const WORDMARK_START = 32;
const TAGLINE_START = 50;
const PROMPT_START = 88;
const INTRO_TOTAL = 80;
const TICK_MS = 70;

function truecolorBg(hex: string, text: string): string {
	const cleaned = hex.replace("#", "");
	const r = parseInt(cleaned.slice(0, 2), 16);
	const g = parseInt(cleaned.slice(2, 4), 16);
	const b = parseInt(cleaned.slice(4, 6), 16);
	return `\x1b[48;2;${r};${g};${b}m${text}\x1b[49m`;
}

function bold(text: string): string {
	return `\x1b[1m${text}\x1b[22m`;
}

function dim(text: string): string {
	return `\x1b[2m${text}\x1b[22m`;
}

function padToWidth(text: string, width: number): string {
	const currentWidth = visibleWidth(text);
	if (currentWidth >= width) {
		return text;
	}
	return text + " ".repeat(width - currentWidth);
}

function centeredBlock(contentLines: string[], width: number, minBlockWidth: number): string[] {
	const blockWidth = contentLines.reduce((max, line) => Math.max(max, visibleWidth(line)), minBlockWidth);
	const outerPad = Math.max(0, Math.floor((width - blockWidth) / 2));
	return contentLines.map((line) => {
		const innerPad = Math.max(0, Math.floor((blockWidth - visibleWidth(line)) / 2));
		return " ".repeat(outerPad + innerPad) + line;
	});
}

function renderTileRow(leftVisible: boolean, rightVisible: boolean, leftColor: string, rightColor: string): string {
	const left = leftVisible ? truecolorBg(leftColor, " ".repeat(TILE_WIDTH)) : " ".repeat(TILE_WIDTH);
	const right = rightVisible ? truecolorBg(rightColor, " ".repeat(TILE_WIDTH)) : " ".repeat(TILE_WIDTH);
	return left + right;
}

function renderScaledWordmarkLine(text: string, progress: number): string {
	const visibleText = text.slice(0, Math.max(0, Math.min(progress, text.length)));
	return bold(padToWidth(visibleText, text.length));
}

function renderLogo(tick: number, colorOffset: number): string[] {
	const squaresVisible = Math.min(4, Math.floor(tick / SQUARE_REVEAL_TICKS));
	const cycling = tick >= COLOR_CYCLE_START;
	const colors = BRAND_COLORS.map(
		(_, index) => BRAND_COLORS[(cycling ? index + colorOffset : index) % BRAND_COLORS.length]!,
	);

	let wordmarkProgress = 0;
	if (tick >= WORDMARK_START) {
		wordmarkProgress = Math.min(Math.floor((tick - WORDMARK_START) / 2) + 1, WORDMARK_TOP.length);
	}

	const topSquares = renderTileRow(squaresVisible >= 1, squaresVisible >= 2, colors[0]!, colors[1]!);
	const bottomSquares = renderTileRow(squaresVisible >= 3, squaresVisible >= 4, colors[2]!, colors[3]!);
	const topWordmark = renderScaledWordmarkLine(WORDMARK_TOP, wordmarkProgress);
	const bottomWordmark = renderScaledWordmarkLine(WORDMARK_BOTTOM, wordmarkProgress);
	const gap = " ".repeat(WORDMARK_GAP);

	return [`${topSquares}${gap}${topWordmark}`, `${bottomSquares}${gap}${bottomWordmark}`];
}

function renderSplashFrame(width: number, height: number, tick: number, colorOffset: number): string {
	const lines: string[] = [];
	const contentLines: string[] = renderLogo(tick, colorOffset);

	if (tick >= TAGLINE_START) {
		const tagline = "Your personal agent for work.";
		const tagProgress = Math.min(Math.floor(tick - TAGLINE_START) + 1, tagline.length);
		contentLines.push("");
		contentLines.push(dim(tagline.slice(0, tagProgress)));
	}

	if (tick >= PROMPT_START) {
		const promptText = tick % 14 < 7 ? bold("Press Enter to get started") : "Press Enter to get started";
		contentLines.push("");
		contentLines.push(promptText);
	}

	const topPad = Math.max(0, Math.floor((height - contentLines.length) / 2));
	for (let i = 0; i < topPad; i++) {
		lines.push("");
	}
	lines.push(...centeredBlock(contentLines, width, LOGO_WIDTH));
	while (lines.length < height) {
		lines.push("");
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
