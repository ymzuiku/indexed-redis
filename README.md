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

- get(key:K):Promise<T[K]>
- set(key:K, value: T[K]);
- setEx(key:K, expireMillisecond: number, value: T[K]);
- assignEx(key:K, expireMillisecond: number, value: T[K]);
- getAll()->Promise<T>;
- del(key:K):Promise<T[K]>;
- flushDb():Promise<void>;

## Use

```js
import { indexedRedis } from "indexed-redis";

// Example of explicitly declared instance
const example = async () => {
  const db =
    indexedRedis <
    { page: { name: string, age: number }, user: { email: string } } >
    "my-db";

  // Store data
  await db.setEx("page", 1000 * 60, { name: "bobo", age: 20 });

  // Retrieve data
  const data = await db.get("page");

  // Update partial values
  const nextData = await db.assign("page", { name: "dog" });

  // Delete data
  await db.remove("page");
};
example();
```
