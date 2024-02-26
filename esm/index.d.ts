// Generated by dts-bundle-generator v8.1.2

export interface IndexedRedisOptions<T> {
	dbName: string;
	defaultValue: T;
	optimisticDelay?: number;
}
export declare class IndexedRedis<T> {
	private dbName;
	private defaultValue;
	private optimisticDelay;
	private db?;
	private lastClearTime;
	private valueCache;
	private setExJobs;
	private initd;
	private runSetExJobs;
	private reduceValueCache;
	constructor({ dbName, defaultValue, optimisticDelay, }: IndexedRedisOptions<T>);
	private initDb;
	clearExpiredItems: (force?: boolean) => Promise<void>;
	private baseSetEx;
	private baseAssignEx;
	private getCacheValue;
	private baseGet;
	setEx: <K extends keyof T>(key: K, expireMillisecond: number, value: T[K]) => void;
	set: <K extends keyof T>(key: K, value: T[K]) => void;
	assignEx: <K extends keyof T>(key: K, expireMillisecond: number, value: Partial<T[K]>) => Promise<Partial<T[K]>>;
	assign: <K extends keyof T>(key: K, value: Partial<T[K]>) => Promise<Partial<T[K]>>;
	get: <K extends keyof T>(key: K) => Promise<T[K] | undefined>;
	getAll: () => Promise<Partial<T>>;
	del: <K extends keyof T>(key: K) => Promise<T[K] | undefined>;
	flushDb: () => Promise<void>;
}

export {};
