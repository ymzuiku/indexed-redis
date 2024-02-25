# indexed-redis

indexed-redis is a simplified web-indexedDB method

## Feature

- Use Typescript, type safety.
- Use Indexed-DB or LocalStorage(Automatic downgrade), Like redis
- For the sake of performance, the cache layer will be operated first before operating the IndexedDB, and the IndexedDB is eventually consistent.

## API

```ts
declare const indexedRedis: <T>(dbName: string) => {
  set: <K extends keyof T>(key: K, value: T[K]) => Promise<void>;
  setEx: (
    key: keyof T,
    expireMillisecond: number,
    value: T[keyof T]
  ) => Promise<void>;
  get: <K_1 extends keyof T>(key: K_1) => Promise<T[K_1] | undefined>;
  getAll: () => Promise<Partial<T>>;
  assignEx: <K_2 extends keyof T>(
    key: K_2,
    expireMillisecond: number,
    obj: T[K_2]
  ) => Promise<T[K_2]>;
  del: <K_3 extends keyof T>(key: K_3) => Promise<T[K_3] | undefined>;
  flushDb: () => Promise<void>;
  clearExpiredItems: (force?: boolean) => Promise<Partial<T> | undefined>;
};
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
  const db = indexedRedis<Model>("my-db");

  // Store data
  await db.set("user", { email: "example@gmail.com" });

  await db.setEx("page", 1000, { name: "bobo", age: 20 });

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
