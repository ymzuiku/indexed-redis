# indexed-redis

indexed-redis is a simplified web-indexedDB method

## Feature

- Use Typescript, type safety.
- Use Indexed-DB or LocalStorage(Automatic downgrade), Like redis
- For the sake of performance, the cache layer will be operated first before operating the IndexedDB, and the IndexedDB is eventually consistent.

## API

#### Top API

- indexedRedis<T>(dbName:string):Db

#### DB API

- `get(key:K):Promise<T[K]>`
- `set(key:K, value: T[K])`
- `setEx(key:K, expireMillisecond: number, value: T[K])`
- `assignEx(key:K, expireMillisecond: number, value: T[K])`
- `getAll()->Promise<T>`
- `del(key:K):Promise<T[K]>`
- `flushDb():Promise<void>`

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
