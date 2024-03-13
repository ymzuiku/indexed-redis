import fs from "node:fs/promises";
import { build } from "./esm";

(async () => {
	await build();
	let timer: Timer | null = null;
	const watcher = fs.watch("lib", { recursive: true });
	try {
		for await (const event of watcher) {
			if (/\.ts$/.test(event.filename || "")) {
				if (timer) clearTimeout(timer);
				timer = setTimeout(async () => {
					try {
						await build();
					} catch (e) {
						console.error(e);
					}
				}, 1000);
			}
		}
	} catch (e) {
		console.error(e);
	}
})();
