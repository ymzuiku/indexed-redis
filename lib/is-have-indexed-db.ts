export const isHaveIndexedDb =
	typeof window !== "undefined" && typeof window.indexedDB !== "undefined";

if (!isHaveIndexedDb) {
	console.error(
		"[indexed-redis] [WARN] Your browser not have indexedDB, Now use localStorage.",
	);
}
