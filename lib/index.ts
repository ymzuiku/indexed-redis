import { debounce } from "throttle-debounce";
import { isHaveIndexedDb } from "./is-have-indexed-db";

interface IndexedRedisOptions<T> {
	dbName: string;
	defaultValue: T;
	optimisticDelay?: number;
}

// aaa

export class IndexedRedis<T> {
	private dbName: string;
	private defaultValue: T;
	private optimisticDelay: number;
	private db?: IDBDatabase;
	private lastClearTime: number;
	private valueCache: Record<string, { expire: number; value: unknown }>;
	private setExJobs: Record<string, { expire: number; value: unknown }>;
	private initd: boolean;
	private runSetExJobs: () => void;
	private reduceValueCache = 0;

	constructor({
		dbName,
		defaultValue,
		optimisticDelay = 500,
	}: IndexedRedisOptions<T>) {
		this.dbName = dbName;
		this.defaultValue = defaultValue;
		this.optimisticDelay = optimisticDelay;
		this.lastClearTime = 0;
		this.valueCache = {};
		this.setExJobs = {};
		this.initd =
			localStorage.getItem(`indexed-redis-initd-${dbName}`) === "true";

		this.runSetExJobs = debounce(this.optimisticDelay, () => {
			this.reduceValueCache++;
			if (this.reduceValueCache > 200) {
				this.reduceValueCache = 0;
				Object.keys(this.valueCache).forEach((k) => {
					const v = this.valueCache[k];
					if (v.expire && v.expire < Date.now()) {
						delete this.valueCache[k];
					}
				});
				const keys = Object.keys(this.valueCache);
				if (keys.length > 500) {
					this.valueCache = {};
				}
			}

			const keys = Object.keys(this.setExJobs);
			if (keys.length === 0) {
				return;
			}
			keys.forEach((key) => {
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				const job = this.setExJobs[key] as any;
				if (job) {
					this.baseSetEx(key as keyof T, job.expire, job.value);
				}
			});
			this.setExJobs = {};
		});
	}

	private initDb = async () => {
		if (!this.initd) {
			for (const key of Object.keys(this.defaultValue as object)) {
				await this.baseSetEx(
					key as keyof T,
					0,
					this.defaultValue[key as keyof T],
					true,
				);
			}
			localStorage.setItem(`indexed-redis-initd-${this.dbName}`, "true");
			this.initd = true;
		}
		if (!isHaveIndexedDb) {
			return;
		}
		return new Promise((res) => {
			if (!this.db) {
				const reqDb = window.indexedDB.open("indexed-redis-" + this.dbName);
				reqDb.onerror = console.error;
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				reqDb.onsuccess = (event: any) => {
					if (!this.db) {
						this.db = event.target.result;
					}
					res(void 0);
				};
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				reqDb.onupgradeneeded = (event: any) => {
					if (!this.db) {
						this.db = event.target.result;
					}
					this.db?.createObjectStore(this.dbName, {
						autoIncrement: false,
						keyPath: "key",
					});
				};
			} else {
				res(void 0);
			}
		});
	};

	public clearExpiredItems = async (force?: boolean) => {
		const now = Date.now();
		if (
			!force &&
			this.lastClearTime &&
			now - this.lastClearTime < 60 * 1000 * 5
		) {
			// Less than 5 minutes has passed since the last clear, so we do nothing
			return;
		}
		this.lastClearTime = now;
		await this.getAll();
	};

	private baseSetEx = async <K extends keyof T>(
		key: K,
		expireMillisecond: number,
		value: T[K],
		isInit?: boolean,
	) => {
		if (!this.db && !isInit) {
			await this.initDb();
		}
		this.clearExpiredItems();
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		const theObj = value as any;
		if (!isHaveIndexedDb) {
			return new Promise((res) => {
				localStorage.setItem(
					`[${this.dbName}] ${key as string}`,
					JSON.stringify({
						value: theObj,
						expire: expireMillisecond ? Date.now() + expireMillisecond : 0,
					}),
				);
				res(value);
			});
		}

		return new Promise((res) => {
			if (this.db?.objectStoreNames.contains(this.dbName)) {
				const transaction = this.db.transaction([this.dbName], "readwrite");
				const objectStore = transaction.objectStore(this.dbName);
				const data = {
					key: key,
					value: theObj,
					expire: expireMillisecond ? Date.now() + expireMillisecond : 0,
				};
				const request = objectStore.put(data);
				request.onerror = (err) => {
					console.error(err);
					res(value);
				};
				request.onsuccess = () => {
					res(value);
				};
			} else {
				res(value);
			}
		});
	};

	private baseAssignEx = async <K extends keyof T>(
		key: K,
		expireMillisecond: number,
		value: Partial<T[K]>,
	): Promise<Partial<T[K]>> => {
		if (typeof value !== "object") {
			throw new Error("[NanoIndexed.assign] assign need is object");
		}
		const old = await this.get(key);
		if (!old) {
			throw new Error("[NanoIndexed.assign] assign need has old object");
		}
		if (typeof old !== "object") {
			return old;
		}
		const next = Object.assign(old, value);
		this.setEx(key, expireMillisecond, next);
		return next;
	};

	private getCacheValue = (key: string) => {
		const old = this.valueCache[key];
		if (old) {
			if (old.expire && old.expire < Date.now()) {
				delete this.valueCache[key];
				return void 0;
			}
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			return old.value as any;
		}
	};

	private baseGet = async <K extends keyof T>(key: K): Promise<T[K]> => {
		if (!this.db) {
			await this.initDb();
		}
		const cacheValue = this.getCacheValue(key as string);
		if (cacheValue !== void 0) {
			return cacheValue;
		}
		this.clearExpiredItems();
		if (!isHaveIndexedDb) {
			return new Promise((res) => {
				let data = localStorage.getItem(`[${this.dbName}] ${key as string}`);
				if (data) {
					try {
						const obj = JSON.parse(data);
						data = obj?.value;
						if (obj?.expire && obj.expire < Date.now()) {
							localStorage.removeItem(`[${this.dbName}] ${key as string}`);
							res(this.defaultValue[key]);
							return;
						}
					} catch (err) {}
				}
				if (data === void 0 || data === null) {
					res(this.defaultValue[key]);
					return;
				}
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				res(data as any);
			});
		}

		return new Promise((res) => {
			if (this.db?.objectStoreNames.contains(this.dbName)) {
				const transaction = this.db.transaction([this.dbName]);
				const objectStore = transaction.objectStore(this.dbName);
				const request = objectStore.get(key as string);
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				request.onsuccess = (event: any) => {
					const data = event.target.result;
					res(data?.value);
				};
			} else {
				res(this.defaultValue[key]);
			}
		});
	};

	// Public API
	public setEx = async <K extends keyof T>(
		key: K,
		expireMillisecond: number,
		value: T[K],
	) => {
		const now = Date.now();
		this.setExJobs[key as string] = {
			expire: expireMillisecond,
			value,
		};
		this.valueCache[key as string] = {
			expire: expireMillisecond ? now + expireMillisecond : 0,
			value,
		};
		this.runSetExJobs();
	};
	public set = async <K extends keyof T>(key: K, value: T[K]) => {
		return this.setEx(key, 0, value);
	};
	public assignEx = <K extends keyof T>(
		key: K,
		expireMillisecond: number,
		value: Partial<T[K]>,
	): Promise<Partial<T[K]>> => {
		return this.baseAssignEx(key, expireMillisecond, value);
	};
	public assign = <K extends keyof T>(
		key: K,
		value: Partial<T[K]>,
	): Promise<Partial<T[K]>> => {
		return this.baseAssignEx(key, 0, value);
	};
	public get = <K extends keyof T>(key: K): Promise<T[K]> => {
		return this.baseGet(key);
	};
	public getAll = async (): Promise<Partial<T>> => {
		if (!this.db) {
			await this.initDb();
		}

		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		const out = {} as any;
		Object.keys(this.valueCache).forEach((key) => {
			const v = this.valueCache[key];
			if (v.expire && v.expire < Date.now()) {
				delete this.valueCache[key];
				return;
			}
			out[key] = v.value;
		});

		if (!isHaveIndexedDb) {
			return new Promise((res) => {
				const now = Date.now();
				for (let i = 0; i < localStorage.length; i++) {
					const key = localStorage.key(i) || "";
					if (key.indexOf(`[${this.dbName}] `) === 0) {
						const itemStr = localStorage.getItem(key);
						if (itemStr) {
							let item: { expire: number; value: unknown };
							try {
								item = JSON.parse(itemStr);
								if (item.expire && now > item.expire) {
									localStorage.removeItem(key);
									continue;
								}
								const realKey = key.replace(`[${this.dbName}] `, "");
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

		return new Promise((res) => {
			if (this.db?.objectStoreNames.contains(this.dbName)) {
				const transaction = this.db.transaction([this.dbName]);
				const objectStore = transaction.objectStore(this.dbName);
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
							this.del(key as keyof T);
						});
					});
				};
			} else {
				res(out);
			}
		});
	};

	public del = async <K extends keyof T>(key: K): Promise<T[K]> => {
		if (!this.db) {
			await this.initDb();
		}
		delete this.valueCache[key as string];
		if (!isHaveIndexedDb) {
			return new Promise((res) => {
				localStorage.removeItem(`[${this.dbName}] ${key as string}`);
				res(this.defaultValue[key]);
			});
		}
		return new Promise((res) => {
			if (this.db?.objectStoreNames.contains(this.dbName)) {
				const transaction = this.db.transaction([this.dbName], "readwrite");
				const objectStore = transaction.objectStore(this.dbName);
				const request = objectStore.delete(key as "string");
				request.onerror = (err) => {
					console.error(err);
					res(this.defaultValue[key]);
				};
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				request.onsuccess = res as any;
			} else {
				res(this.defaultValue[key]);
			}
		});
	};

	public flushDb = async () => {
		const all = await this.getAll();
		await Promise.all(
			Object.keys(all).map((key) => {
				return this.del(key as keyof T);
			}),
		);
	};
}
