export const isHaveIndexedDb =
	typeof (window || global) !== "undefined" &&
	typeof (window || global).indexedDB !== "undefined";

if (!isHaveIndexedDb) {
	console.error(
		"[indexed-redis] [WARN] Your browser not have indexedDB, Now use localStorage.",
	);
}
