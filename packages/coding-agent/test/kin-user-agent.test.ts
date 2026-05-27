import { describe, expect, it } from "vitest";
import { getKinUserAgent } from "../src/utils/kin-user-agent.js";

describe("getKinUserAgent", () => {
	it("formats the user agent expected by kin.dev", () => {
		const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
		const userAgent = getKinUserAgent("1.2.3");

		expect(userAgent).toBe(`pi/1.2.3 (${process.platform}; ${runtime}; ${process.arch})`);
		expect(userAgent).toMatch(/^pi\/[^\s()]+ \([^;()]+;\s*[^;()]+;\s*[^()]+\)$/);
	});
});
