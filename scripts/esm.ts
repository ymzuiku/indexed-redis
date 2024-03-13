import dts from "bun-plugin-dts";

import * as fs from "node:fs/promises";

export const build = async () => {
	const pkg = JSON.parse((await fs.readFile("package.json")).toString());
	await Bun.build({
		sourcemap: "external",
		target: "browser",
		external: pkg.peerDependencies
			? Object.keys(pkg.peerDependencies)
			: undefined,
		entrypoints: ["./lib/index.ts"],
		outdir: "./esm",
		plugins: [dts()],
	});
};

build();
