import { debounce } from "throttle-debounce";
import { isHaveIndexedDb } from "./is-have-indexed-db";

interface IndexedRedisOptions<T> {
	dbName: string;
	defaultValue: T;
	optimisticDelay?: number;
	ignoreCache?: boolean;
	onlyUseLocalStorage?: boolean;
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	setFormat?: (value: any) => any | Promise<any>;
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	getFormat?: (value: any) => any | Promise<any>;
}

const baseFormat = (v: unknown) => v;

export type IndexedRedis<T> = ReturnType<typeof IndexedRedis<T>>;

export function IndexedRedis<T>(options: IndexedRedisOptions<T>) {
	const dbName = options.dbName;
	const defaultValue = options.defaultValue;
	const optimisticDelay = options.optimisticDelay || 500;
	const isUseIndexedDb = options.onlyUseLocalStorage ? false : isHaveIndexedDb;
	const setFormat = options.setFormat || baseFormat;
	const getFormat = options.getFormat || baseFormat;
	const ignoreCache = options.ignoreCache || false;
	const oldKeys = localStorage.getItem(`[${dbName}-keys]`);
	let hasKeys: Record<string, number> = {};
	if (oldKeys) {
		try {
			hasKeys = JSON.parse(oldKeys);
		} catch (error) {
			//
		}
	}

	const valueCache: Record<string, { expire: number; value: unknown }> = {};
	const setExJobs: Record<string, { expire: number; value: unknown }> = {};
	let db: IDBDatabase | undefined;
	let initd = localStorage.getItem(`indexed-redis-initd-${dbName}`) === "true";

	const getDefaultValue = <K extends keyof T>(key: K): T[K] => {
		if (defaultValue[key] === void 0) {
			return defaultValue[key];
		}
		return JSON.parse(JSON.stringify(defaultValue[key]));
	};

	const runSetExJobs = debounce(optimisticDelay, () => {
		const keys = Object.keys(setExJobs);
		if (keys.length === 0) {
			return;
		}
		keys.forEach((key) => {
			const job = setExJobs[key];
			if (job) {
				setWithFormat(key, job);
			}
			delete setExJobs[key];
		});
	});

	const saveOtherLocal = () => {
		localStorage.setItem(`[${dbName}-keys]`, JSON.stringify(hasKeys));
	};

	const initDb = async () => {
		if (db) {
			return;
		}
		if (!initd) {
			localStorage.setItem(`indexed-redis-initd-${dbName}`, "true");
			initd = true;
		}
		if (!isUseIndexedDb) {
			return;
		}
		return new Promise((res) => {
			if (!db) {
				const reqDb = window.indexedDB.open(dbName);
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
					db?.createObjectStore(dbName, {
						autoIncrement: false,
						keyPath: "key",
					});
				};
			} else {
				res(void 0);
			}
		});
	};
	const delDb = async <K extends keyof T>(key: K) => {
		await initDb();
		saveOtherLocal();
		if (!isUseIndexedDb) {
			localStorage.removeItem(`[${dbName}] ${key as string}`);
		}
		return new Promise((res) => {
			if (db) {
				const transaction = db.transaction([dbName], "readwrite");
				const objectStore = transaction.objectStore(dbName);
				const request = objectStore.delete(key as string);
				request.onerror = (err) => {
					console.error(err);
					res(void 0);
				};
				request.onsuccess = () => {
					res(void 0);
				};
			} else {
				res(void 0);
			}
		});
	};
	const setDb = async (key: string, value: unknown) => {
		await initDb();
		saveOtherLocal();
		if (!isUseIndexedDb) {
			localStorage.setItem(
				`[${dbName}] ${key as string}`,
				JSON.stringify({
					pis: value,
				}),
			);
		}
		return new Promise((res) => {
			if (db) {
				const transaction = db.transaction([dbName], "readwrite");
				const objectStore = transaction.objectStore(dbName);
				const data = {
					key: key,
					value: value,
				};
				const request = objectStore.put(data);
				request.onerror = (err) => {
					console.error(err);
					res(void 0);
				};
				request.onsuccess = () => {
					res(void 0);
				};
			} else {
				res(void 0);
			}
		});
	};
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const getDb = async (key: any): Promise<any> => {
		await initDb();
		if (!isUseIndexedDb) {
			const old = localStorage.getItem(`[${dbName}] ${key as string}`);
			if (old === void 0 || old === null) {
				return void 0;
			}
			try {
				return JSON.parse(old as string).pis;
			} catch (error) {
				console.error("[indexed-redis] get error:", error);
				return void 0;
			}
		}
		return new Promise((res) => {
			if (db) {
				const transaction = db.transaction([dbName], "readonly");
				const objectStore = transaction.objectStore(dbName);
				const request = objectStore.get(key as string);
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				request.onsuccess = (event: any) => {
					const data = event.target.result;
					if (data?.value === void 0) {
						res(void 0);
					} else {
						res(data?.value);
					}
				};
			} else {
				res(void 0);
			}
		});
	};
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const getWithFormat = async (key: any): Promise<any> => {
		const data = await getDb(key);
		if (data === void 0 || data === null) {
			return data;
		}
		return Promise.resolve(getFormat(data));
	};
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const setWithFormat = async (key: any, value: any) => {
		const nextValue = await Promise.resolve(setFormat(value));
		return setDb(key, nextValue);
	};

	const set = (key: keyof T, value: T[keyof T]) => {
		return setExWithCache(key, 0, value);
	};

	// use cache
	const setExWithCache = async <K extends keyof T>(
		key: K,
		expireMillisecond: number,
		value: T[K],
	) => {
		hasKeys[key as string] = 1;
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
	};
	const getExWithCache = async <K extends keyof T>(key: K): Promise<T[K]> => {
		const cacheValue = valueCache[key as string];
		if (cacheValue === void 0) {
			const data = await getWithFormat(key);
			if (data === void 0 || data === null) {
				return getDefaultValue(key);
			}
			if (data.expire && data.expire < Date.now()) {
				await delWithCache(key);
				return getDefaultValue(key);
			}
			if (data.value === void 0) {
				data.value = getDefaultValue(key);
			}
			if (!ignoreCache) {
				valueCache[key as string] = data;
			}
			return data.value;
		}
		if (cacheValue.expire && cacheValue.expire < Date.now()) {
			delWithCache(key);
			return getDefaultValue(key);
		}
		return cacheValue.value as T[K];
	};
	const delWithCache = async <K extends keyof T>(key: K) => {
		delete hasKeys[key as string];
		delete valueCache[key as string];
		delete setExJobs[key as string];
		await delDb(key);
	};
	const assign = async <K extends keyof T>(
		key: K,
		value: Partial<T[K]>,
	): Promise<Partial<T[K]>> => {
		return assignEx(key, 0, value);
	};
	const assignEx = async <K extends keyof T>(
		key: K,
		expireMillisecond: number,
		value: Partial<T[K]>,
	): Promise<Partial<T[K]>> => {
		const old = (await getExWithCache(key)) || getDefaultValue(key);
		if (!old) {
			throw new Error("[NanoIndexed.assign] assign need is object");
		}
		const next = Object.assign(old, value) as T[K];
		setExWithCache(key, expireMillisecond, next);
		return next;
	};

	const getAll = async () => {
		const keys = Object.keys({
			...defaultValue,
			...hasKeys,
		}) as (keyof T)[];
		const out = {} as T;
		for (const key of keys) {
			const value = await getExWithCache(key);
			out[key] = value;
		}
		return out;
	};

	const flushDb = async () => {
		const keys = Object.keys({
			...defaultValue,
			...hasKeys,
		}) as (keyof T)[];
		for (const key of keys) {
			await delWithCache(key);
		}
	};

	// assignEx -> getEx + setEx
	// assign -> assignEx
	// set -> setExWithCache -> setWithFormat -> setDb
	// get -> getExWithCache -> getWithFormat -> getDb
	return {
		get: getExWithCache,
		setEx: setExWithCache,
		set,
		assign,
		assignEx,
		del: delWithCache,
		getAll,
		flushDb,
		getDefaultValue,
	};
}
