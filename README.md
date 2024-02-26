# indexed-redis

indexed-redis is a simplified web-indexedDB method

## Feature

- Use Typescript, type safety.
- All value use default value, if your delete the key, return the default value.
- Use Indexed-DB or LocalStorage(Automatic downgrade), Like redis
- For the sake of performance, the cache layer will be operated first before operating the IndexedDB, and the IndexedDB is eventually consistent.

## API

```ts
export interface IndexedRedisOptions<T> {
  dbName: string;
  defaultValue: T;
  optimisticDelay?: number;
}
export declare class IndexedRedis<T> {
  constructor({
    dbName,
    defaultValue,
    optimisticDelay,
  }: IndexedRedisOptions<T>);
  clearExpiredItems: (force?: boolean) => Promise<void>;

  setEx: <K extends keyof T>(
    key: K,
    expireMillisecond: number,
    value: T[K]
  ) => Promise<void>;
  set: <K extends keyof T>(key: K, value: T[K]) => Promise<void>;
  assignEx: <K extends keyof T>(
    key: K,
    expireMillisecond: number,
    value: Partial<T[K]>
  ) => Promise<Partial<T[K]>>;
  assign: <K extends keyof T>(
    key: K,
    value: Partial<T[K]>
  ) => Promise<Partial<T[K]>>;
  get: <K extends keyof T>(key: K) => Promise<T[K]>;
  getAll: () => Promise<Partial<T>>;
  del: <K extends keyof T>(key: K) => Promise<T[K]>;
  flushDb: () => Promise<void>;
}
```

## Use

```ts
import { indexedRedis } from "indexed-redis";

// Example of explicitly declared instance
interface Model {
  page: { name: string; age: number };
  user: { email: string };
}

const example = async () => {
  const db = new IndexedRedis<Model>({
    dbName: "my-db",
    defaultValue: { page: { name: "", age: 0 }, user: { email: "" } },
  });

  // Store data
  await db.set("user", { email: "example@gmail.com" });

  await db.setEx("page", 1000, { name: "dog", age: 20 });

  // Retrieve data
  const data = await db.get("page"); // has

  // Update partial values
  const nextData = await db.assignEx("page", 1000, { name: "dog" });

  await new Promise((res) => setTimeout(res, 1000 * 2));

  const data = await db.get("page"); // void 0

  // Delete data
  await db.del("user");

  // Delete all data
  const data = await db.getAll(); // Model

  // Delete all data
  await db.flushDb();
};

example();
```
