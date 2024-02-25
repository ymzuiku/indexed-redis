import dts from "bun-plugin-dts";

(async () => {
	await Bun.build({
		sourcemap: "external",
		target: "browser",
		external: ["throttle-debounce"],
		entrypoints: ["./lib/index.ts"],
		outdir: "./esm",
		plugins: [dts()],
	});
})();
