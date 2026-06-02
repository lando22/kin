import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const aiSrcIndex = fileURLToPath(new URL("../ai/src/index.ts", import.meta.url));
const aiSrcOAuth = fileURLToPath(new URL("../ai/src/oauth.ts", import.meta.url));
const agentSrcIndex = fileURLToPath(new URL("../agent/src/index.ts", import.meta.url));
const tuiSrcIndex = fileURLToPath(new URL("../tui/src/index.ts", import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		testTimeout: 30000,
		server: {
			deps: {
				external: [/@silvia-odwyer\/photon-node/],
			},
		},
	},
	resolve: {
		alias: [
			{ find: /^@landongarrison\/kin-ai$/, replacement: aiSrcIndex },
			{ find: /^@landongarrison\/kin-ai\/oauth$/, replacement: aiSrcOAuth },
			{ find: /^@landongarrison\/kin-agent-core$/, replacement: agentSrcIndex },
			{ find: /^@landongarrison\/kin-tui$/, replacement: tuiSrcIndex },
			{ find: /^@mariozechner\/kin-ai$/, replacement: aiSrcIndex },
			{ find: /^@mariozechner\/kin-ai\/oauth$/, replacement: aiSrcOAuth },
			{ find: /^@mariozechner\/kin-agent-core$/, replacement: agentSrcIndex },
		],
	},
});
