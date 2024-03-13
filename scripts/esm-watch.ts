import fs from "node:fs/promises";
import { $ } from "bun";

(async () => {
	const watcher = fs.watch("lib", { recursive: true });
	for await (const event of watcher) {
		if (/\.ts$/.test(event.filename || "")) {
			await $`bun run scripts/esm.ts`;
		}
	}
})();
