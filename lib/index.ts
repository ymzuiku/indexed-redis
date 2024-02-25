import { debounce } from "throttle-debounce";

export type IndexedRedis<T> = ReturnType<typeof indexedRedis<T>>;

export const indexedRedis = <T>(dbName: string) => {
	const isHaveIndexedDb = typeof window.indexedDB !== "undefined";
	if (!isHaveIndexedDb) {
		console.error(
			"[indexed-redis] [Error] Your browser not have indexedDB, Now use localStorage.",
		);
	}
	let db: IDBDatabase;
	let lastClearTime = 0;
	let setExJobs: Record<string, { expire: number; value: unknown }> = {};
	let valueCache: Record<string, { expire: number; value: unknown }> = {};

	const initDb = () => {
		return new Promise((res) => {
			if (!db) {
				const reqDb = window.indexedDB.open("indexed-redis");
				reqDb.onerror = console.error;
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				reqDb.onsuccess = (event: any) => {
					if (!db) {
						db = event.target.result;
					}
					res(void 0);
				};
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				reqDb.onupgradeneeded = (event: any) => {
					if (!db) {
						db = event.target.result;
					}
					db.createObjectStore(dbName, {
						autoIncrement: false,
						keyPath: "key",
					});
				};
			} else {
				res(void 0);
			}
		});
	};

	const getCacheValue = (key: string) => {
		const old = valueCache[key];
		if (old) {
			if (old.expire && old.expire < Date.now()) {
				delete valueCache[key];
				return void 0;
			}
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			return old.value as any;
		}
	};

	const get = async <K extends keyof T>(key: K): Promise<T[K] | undefined> => {
		const cacheValue = getCacheValue(key as string);
		if (cacheValue !== void 0) {
			return cacheValue;
		}
		clearExpiredItems();
		if (!isHaveIndexedDb) {
			return new Promise((res) => {
				let data = localStorage.getItem(`[${dbName}] ${key as string}`);
				if (data) {
					try {
						const obj = JSON.parse(data);
						data = obj?.value;
						if (obj?.expire && obj.expire < Date.now()) {
							localStorage.removeItem(`[${dbName}] ${key as string}`);
							res(void 0);
							return;
						}
					} catch (err) {}
				}
				if (data === void 0 || data === null) {
					res(void 0);
					return;
				}
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				res(data as any);
			});
		}
		if (!db) {
			await initDb();
		}
		return new Promise((res) => {
			if (db.objectStoreNames.contains(dbName)) {
				const transaction = db.transaction([dbName]);
				const objectStore = transaction.objectStore(dbName);
				const request = objectStore.get(key as string);
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				request.onsuccess = (event: any) => {
					const data = event.target.result;
					res(data?.value);
				};
			} else {
				res(void 0);
			}
		});
	};

	const getAll = async (): Promise<Partial<T>> => {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		const out = {} as any;
		Object.keys(valueCache).forEach((key) => {
			const v = valueCache[key];
			if (v.expire && v.expire < Date.now()) {
				delete valueCache[key];
				return;
			}
			out[key] = v.value;
		});
		// 获取所有数据
		if (!isHaveIndexedDb) {
			return new Promise((res) => {
				const now = Date.now();
				for (let i = 0; i < localStorage.length; i++) {
					const key = localStorage.key(i) || "";
					if (key.indexOf(`[${dbName}] `) === 0) {
						const itemStr = localStorage.getItem(key);
						if (itemStr) {
							let item: { expire: number; value: unknown };
							try {
								item = JSON.parse(itemStr);
								if (item.expire && now > item.expire) {
									localStorage.removeItem(key);
									continue;
								}
								const realKey = key.replace(`[${dbName}] `, "");
								if (out[realKey] === void 0) {
									out[realKey] = item.value;
								}
							} catch (error) {
								// eslint-disable-next-line no-continue
							}
						}
					}
				}
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				res(out as any);
			});
		}
		if (!db) {
			await initDb();
		}
		return new Promise((res) => {
			if (db.objectStoreNames.contains(dbName)) {
				const transaction = db.transaction([dbName]);
				const objectStore = transaction.objectStore(dbName);
				const request = objectStore.getAll();
				const needDelete: string[] = [];
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				request.onsuccess = (event: any) => {
					const data = event.target.result;
					const now = Date.now();
					// biome-ignore lint/suspicious/noExplicitAny: <explanation>
					data.forEach((v: any) => {
						if (v.expire && v.expire < now) {
							needDelete.push(v.key);
							return;
						}
						if (out[v.key] === void 0) {
							out[v.key] = v.value;
						}
					});
					res(out);
					setTimeout(() => {
						needDelete.forEach((key) => {
							del(key as keyof T);
						});
					});
				};
			} else {
				res(out);
			}
		});
	};

	const setEx = async <K extends keyof T>(
		key: K,
		expireMillisecond: number,
		obj: T[K],
	) => {
		clearExpiredItems();
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		const theObj = obj as any;
		if (!isHaveIndexedDb) {
			return new Promise((res) => {
				localStorage.setItem(
					`[${dbName}] ${key as string}`,
					JSON.stringify({
						value: theObj,
						expire: expireMillisecond ? Date.now() + expireMillisecond : 0,
					}),
				);
				res(obj);
			});
		}
		if (!db) {
			await initDb();
		}
		return new Promise((res) => {
			if (db.objectStoreNames.contains(dbName)) {
				const transaction = db.transaction([dbName], "readwrite");
				const objectStore = transaction.objectStore(dbName);
				const data = {
					key: key,
					value: theObj,
					expire: expireMillisecond ? Date.now() + expireMillisecond : 0,
				};
				const request = objectStore.put(data);
				request.onerror = (err) => {
					console.error(err);
					res(obj);
				};
				request.onsuccess = () => {
					res(obj);
				};
			} else {
				res(obj);
			}
		});
	};

	const assignEx = async <K extends keyof T>(
		key: K,
		expireMillisecond: number,
		obj: T[K],
	): Promise<T[typeof key]> => {
		if (typeof obj !== "object") {
			throw new Error("[NanoIndexed.assign] assign need is object");
		}
		const old = await out.get(key);
		if (!old) {
			out.setEx(key, expireMillisecond, obj);
			return obj;
		}
		if (typeof old !== "object") {
			return old;
		}
		const next = Object.assign(old, obj);
		out.setEx(key, expireMillisecond, next);
		return next;
	};

	const del = async <K extends keyof T>(key: K): Promise<T[K] | undefined> => {
		delete valueCache[key as string];
		if (!isHaveIndexedDb) {
			return new Promise((res) => {
				localStorage.removeItem(`[${dbName}] ${key as string}`);
				res(void 0);
			});
		}
		if (!db) {
			await initDb();
		}

		return new Promise((res) => {
			if (db.objectStoreNames.contains(dbName)) {
				const transaction = db.transaction([dbName], "readwrite");
				const objectStore = transaction.objectStore(dbName);
				const request = objectStore.delete(key as "string");
				request.onerror = (err) => {
					console.error(err);
					res(void 0);
				};
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				request.onsuccess = res as any;
			} else {
				res(void 0);
			}
		});
	};

	const clearExpiredItems = async (force = false) => {
		const now = Date.now();
		if (!force && lastClearTime && now - lastClearTime < 60 * 1000 * 5) {
			// Less than 5 minutes has passed since the last clear, so we do nothing
			return;
		}
		lastClearTime = now;

		return getAll();
	};

	clearExpiredItems();

	const flushDb = async () => {
		const all = await getAll();
		await Promise.all(
			Object.keys(all).map((key) => {
				return del(key as keyof T);
			}),
		);
	};

	let reduceValueCache = 0;

	const runSetExJobs = debounce(500, () => {
		reduceValueCache++;
		if (reduceValueCache > 200) {
			reduceValueCache = 0;
			Object.keys(valueCache).forEach((k) => {
				const v = valueCache[k];
				if (v.expire && v.expire < Date.now()) {
					delete valueCache[k];
				}
			});
			const keys = Object.keys(valueCache);
			if (keys.length > 500) {
				valueCache = {};
			}
		}

		const keys = Object.keys(setExJobs);
		if (keys.length === 0) {
			return;
		}
		keys.forEach((key) => {
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			const job = setExJobs[key] as any;
			if (job) {
				setEx(key as keyof T, job.expire, job.value);
			}
		});
		setExJobs = {};
	});

	const out = {
		set: async <K extends keyof T>(key: K, value: T[K]) => {
			out.setEx(key, 0, value);
		},
		setEx: async (
			key: keyof T,
			expireMillisecond: number,
			value: T[typeof key],
		) => {
			const now = Date.now();
			setExJobs[key as string] = {
				expire: expireMillisecond,
				value,
			};
			valueCache[key as string] = {
				expire: expireMillisecond ? now + expireMillisecond : 0,
				value,
			};
			runSetExJobs();
		},
		get: async <K extends keyof T>(key: K): Promise<T[K] | undefined> => {
			const old = getCacheValue(key as string);
			if (old !== void 0) {
				return old;
			}
			return get(key);
		},
		getAll,
		assignEx,
		del,
		flushDb,
		clearExpiredItems,
	};
	return out;
};
