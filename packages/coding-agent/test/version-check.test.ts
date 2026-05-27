import { afterEach, describe, expect, it, vi } from "vitest";
import {
	checkForNewKinVersion,
	comparePackageVersions,
	getLatestKinRelease,
	getLatestKinVersion,
	isNewerPackageVersion,
} from "../src/utils/version-check.js";

const originalSkipVersionCheck = process.env.PI_SKIP_VERSION_CHECK;
const originalOffline = process.env.KIN_OFFLINE;
const originalForceVersionCheck = process.env.PI_FORCE_VERSION_CHECK;

afterEach(() => {
	vi.unstubAllGlobals();
	if (originalSkipVersionCheck === undefined) {
		delete process.env.PI_SKIP_VERSION_CHECK;
	} else {
		process.env.PI_SKIP_VERSION_CHECK = originalSkipVersionCheck;
	}
	if (originalOffline === undefined) {
		delete process.env.KIN_OFFLINE;
	} else {
		process.env.KIN_OFFLINE = originalOffline;
	}
	if (originalForceVersionCheck === undefined) {
		delete process.env.PI_FORCE_VERSION_CHECK;
	} else {
		process.env.PI_FORCE_VERSION_CHECK = originalForceVersionCheck;
	}
});

describe("version checks", () => {
	it("compares package versions", () => {
		expect(comparePackageVersions("0.70.6", "0.70.5")).toBeGreaterThan(0);
		expect(comparePackageVersions("0.70.5", "0.70.5")).toBe(0);
		expect(comparePackageVersions("0.70.4", "0.70.5")).toBeLessThan(0);
		expect(isNewerPackageVersion("0.70.5", "0.70.5")).toBe(false);
		expect(isNewerPackageVersion("0.70.6", "0.70.5")).toBe(true);
	});

	it("returns only newer versions", async () => {
		process.env.PI_FORCE_VERSION_CHECK = "1";
		const fetchMock = vi.fn(async () => Response.json({ version: "1.2.3" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(checkForNewKinVersion("1.2.3")).resolves.toBeUndefined();
		await expect(checkForNewKinVersion("1.2.2")).resolves.toEqual({ version: "1.2.3" });
	});

	it("uses the kin.dev version check api with a pi user agent", async () => {
		process.env.PI_FORCE_VERSION_CHECK = "1";
		const fetchMock = vi.fn(async () => Response.json({ version: "1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestKinVersion("1.2.3")).resolves.toBe("1.2.4");
		expect(fetchMock).toHaveBeenCalledWith(
			"https://kin.dev/api/latest-version",
			expect.objectContaining({
				headers: expect.objectContaining({
					"User-Agent": expect.stringMatching(/^pi\/1\.2\.3 /),
					accept: "application/json",
				}),
			}),
		);
	});

	it("returns the active package metadata from the version check api", async () => {
		process.env.PI_FORCE_VERSION_CHECK = "1";
		const fetchMock = vi.fn(async () =>
			Response.json({
				packageName: "@new-scope/kin",
				version: "1.2.4",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestKinRelease("1.2.3")).resolves.toEqual({
			packageName: "@new-scope/kin",
			version: "1.2.4",
		});
	});

	it("returns update notes from the version check api", async () => {
		process.env.PI_FORCE_VERSION_CHECK = "1";
		const fetchMock = vi.fn(async () => Response.json({ note: " **Read this** ", version: "1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestKinRelease("1.2.3")).resolves.toEqual({ note: "**Read this**", version: "1.2.4" });
	});

	it("skips api calls when version checks are disabled", async () => {
		process.env.PI_SKIP_VERSION_CHECK = "1";
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestKinVersion("1.2.3")).resolves.toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("skips api calls when the package disables version checks", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestKinVersion("1.2.3")).resolves.toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
