/// <reference lib="dom" />

import { beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { IndexedRedis, indexedRedis } from ".";

describe("indexedDB", () => {
	let db: IndexedRedis<{ dog?: string; obj?: { age?: number; name?: string } }>;

	beforeEach(() => {
		db = indexedRedis(Math.random().toString());
		setSystemTime(new Date());
	});

	it("set, get", async () => {
		const data = await db.get("obj");
		expect(data).toBeUndefined();

		db.set("obj", { age: 50 });

		const data3 = await db.get("obj");
		expect(data3).toEqual({ age: 50 });
	});

	it("setEx, get", async () => {
		const data = await db.get("obj");
		expect(data).toBeUndefined();

		db.setEx("obj", 1000, { age: 50 });

		const data3 = await db.get("obj");
		expect(data3).toEqual({ age: 50 });

		setSystemTime(new Date(Date.now() + 2000));
		db.clearExpiredItems(true);
		const data4 = await db.get("obj");
		expect(data4).toBeUndefined();
	});

	it("setEx, get all", async () => {
		const data = await db.get("obj");
		expect(data).toBeUndefined();

		db.set("dog", "the dog");
		db.setEx("obj", 1000, { age: 50 });
		const obj2 = await db.get("obj");
		const all = await db.getAll();
		expect(all.obj).toEqual({ age: 50 });

		setSystemTime(new Date(Date.now() + 2000));
		db.clearExpiredItems(true);
		const all2 = await db.getAll();
		expect(all2.obj).toBeUndefined();
		expect(all2.dog).toEqual("the dog");
	});

	it("assign, get all", async () => {
		const data = await db.get("obj");
		expect(data).toBeUndefined();

		await db.set("dog", "the dog");
		await db.setEx("obj", 1000, { age: 50 });

		const data3 = await db.assignEx("obj", 1000, { name: "the name" });
		expect(data3?.name).toEqual("the name");
		expect(data3?.age).toEqual(50);

		const all = await db.getAll();
		expect(all).not.toBeUndefined();
		expect(all.obj).toEqual({ age: 50, name: "the name" });
		expect(all.obj?.name).toEqual("the name");
		expect(all.obj?.age).toEqual(50);

		setSystemTime(new Date(Date.now() + 2000));
		db.clearExpiredItems(true);
		const all2 = await db.getAll();
		expect(all2.obj).toBeUndefined();
		expect(all2.dog).toEqual("the dog");
	});

	it("should return undefined for non-existing items", async () => {
		const item = await db.get("nonExistingItem" as "dog");
		expect(item).toBeUndefined();
	});

	it("should return the correct item after it has been set", async () => {
		await db.set("item" as "dog", "value");
		const item = await db.get("item" as "dog");
		expect(item).toEqual("value");
	});

	it("should overwrite existing items when set is called", async () => {
		await db.set("item" as "dog", "value");
		await db.set("item" as "dog", "newValue");
		const item = await db.get("item" as "dog");
		expect(item).toEqual("newValue");
	});

	it("should remove item", async () => {
		await db.set("dog", "value");
		await db.del("dog");
		const aa = await db.getAll();
		const item = await db.get("dog");
		expect(item).toBeUndefined();
	});

	it("should remove items when clear is called", async () => {
		await db.set("dog", "value");
		await db.flushDb();
		const aa = await db.getAll();
		const item = await db.get("dog");
		expect(item).toBeUndefined();
	});
});
