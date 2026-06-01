import { describe, expect, test } from "vitest";
import { ageInDays, formatAgeShort, freshnessCaveat, STALE_THRESHOLD_DAYS } from "../src/core/memory-freshness.js";

const DAY = 86_400_000;

describe("ageInDays", () => {
	test("counts whole days since mtime and never goes negative", () => {
		const now = 100 * DAY;
		expect(ageInDays(now, now)).toBe(0);
		expect(ageInDays(now - 3 * DAY, now)).toBe(3);
		// Future mtime (clock skew) clamps to 0 rather than reporting a negative age.
		expect(ageInDays(now + 5 * DAY, now)).toBe(0);
	});
});

describe("formatAgeShort", () => {
	test("uses the right unit per age bucket", () => {
		expect(formatAgeShort(0)).toBe("today");
		expect(formatAgeShort(5)).toBe("5d");
		expect(formatAgeShort(21)).toBe("3w");
		expect(formatAgeShort(90)).toBe("3mo");
		expect(formatAgeShort(730)).toBe("2y");
	});
});

describe("freshnessCaveat", () => {
	test("is null while fresh and a verify-before-relying note once stale", () => {
		expect(freshnessCaveat(STALE_THRESHOLD_DAYS - 1)).toBeNull();
		const caveat = freshnessCaveat(STALE_THRESHOLD_DAYS);
		expect(caveat).toContain("point-in-time");
		expect(caveat).toContain("verify");
	});
});
