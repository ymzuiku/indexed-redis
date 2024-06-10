// lib/index.ts
import {debounce} from "throttle-debounce";

// lib/is-have-indexed-db.ts
var isHaveIndexedDb = typeof (window || global) !== "undefined" && typeof (window || global).indexedDB !== "undefined";
if (!isHaveIndexedDb) {
  console.error("[indexed-redis] [WARN] Your browser not have indexedDB, Now use localStorage.");
}

// lib/index.ts
function IndexedRedis(options) {
  const dbName = options.dbName;
  const defaultValue = options.defaultValue;
  const optimisticDelay = options.optimisticDelay || 500;
  const isUseIndexedDb = options.onlyUseLocalStorage ? false : isHaveIndexedDb;
  const setFormat = options.setFormat || baseFormat;
  const getFormat = options.getFormat || baseFormat;
  const ignoreCache = options.ignoreCache || false;
  const oldKeys = localStorage.getItem(`[${dbName}-keys]`);
  let hasKeys = {};
  if (oldKeys) {
    try {
      hasKeys = JSON.parse(oldKeys);
    } catch (error) {
    }
  }
  const valueCache = {};
  const setExJobs = {};
  let db;
  let initd = localStorage.getItem(`indexed-redis-initd-${dbName}`) === "true";
  const getDefaultValue = (key) => {
    if (defaultValue[key] === undefined) {
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
        reqDb.onsuccess = (event) => {
          if (!db) {
            db = event.target.result;
          }
          res(undefined);
        };
        reqDb.onupgradeneeded = (event) => {
          if (!db) {
            db = event.target.result;
          }
          db?.createObjectStore(dbName, {
            autoIncrement: false,
            keyPath: "key"
          });
        };
      } else {
        res(undefined);
      }
    });
  };
  const delDb = async (key) => {
    await initDb();
    saveOtherLocal();
    if (!isUseIndexedDb) {
      localStorage.removeItem(`[${dbName}] ${key}`);
    }
    return new Promise((res) => {
      if (db) {
        const transaction = db.transaction([dbName], "readwrite");
        const objectStore = transaction.objectStore(dbName);
        const request = objectStore.delete(key);
        request.onerror = (err) => {
          console.error(err);
          res(undefined);
        };
        request.onsuccess = () => {
          res(undefined);
        };
      } else {
        res(undefined);
      }
    });
  };
  const setDb = async (key, value) => {
    await initDb();
    saveOtherLocal();
    if (!isUseIndexedDb) {
      localStorage.setItem(`[${dbName}] ${key}`, JSON.stringify({
        pis: value
      }));
    }
    return new Promise((res) => {
      if (db) {
        const transaction = db.transaction([dbName], "readwrite");
        const objectStore = transaction.objectStore(dbName);
        const data = {
          key,
          value
        };
        const request = objectStore.put(data);
        request.onerror = (err) => {
          console.error(err);
          res(undefined);
        };
        request.onsuccess = () => {
          res(undefined);
        };
      } else {
        res(undefined);
      }
    });
  };
  const getDb = async (key) => {
    await initDb();
    if (!isUseIndexedDb) {
      const old = localStorage.getItem(`[${dbName}] ${key}`);
      if (old === undefined || old === null) {
        return;
      }
      try {
        return JSON.parse(old).pis;
      } catch (error) {
        console.error("[indexed-redis] get error:", error);
        return;
      }
    }
    return new Promise((res) => {
      if (db) {
        const transaction = db.transaction([dbName], "readonly");
        const objectStore = transaction.objectStore(dbName);
        const request = objectStore.get(key);
        request.onsuccess = (event) => {
          const data = event.target.result;
          if (data?.value === undefined) {
            res(undefined);
          } else {
            res(data?.value);
          }
        };
      } else {
        res(undefined);
      }
    });
  };
  const getWithFormat = async (key) => {
    const data = await getDb(key);
    if (data === undefined || data === null) {
      return data;
    }
    return Promise.resolve(getFormat(data));
  };
  const setWithFormat = async (key, value) => {
    const nextValue = await Promise.resolve(setFormat(value));
    return setDb(key, nextValue);
  };
  const set = (key, value) => {
    return setExWithCache(key, 0, value);
  };
  const setExWithCache = async (key, expireMillisecond, value) => {
    hasKeys[key] = 1;
    const now = Date.now();
    setExJobs[key] = {
      expire: expireMillisecond,
      value
    };
    valueCache[key] = {
      expire: expireMillisecond ? now + expireMillisecond : 0,
      value
    };
    runSetExJobs();
  };
  const getExWithCache = async (key) => {
    const cacheValue = valueCache[key];
    if (cacheValue === undefined) {
      const data = await getWithFormat(key);
      if (data === undefined || data === null) {
        return getDefaultValue(key);
      }
      if (data.expire && data.expire < Date.now()) {
        await delWithCache(key);
        return getDefaultValue(key);
      }
      if (data.value === undefined) {
        data.value = getDefaultValue(key);
      }
      if (!ignoreCache) {
        valueCache[key] = data;
      }
      return data.value;
    }
    if (cacheValue.expire && cacheValue.expire < Date.now()) {
      delWithCache(key);
      return getDefaultValue(key);
    }
    return cacheValue.value;
  };
  const delWithCache = async (key) => {
    delete hasKeys[key];
    delete valueCache[key];
    delete setExJobs[key];
    await delDb(key);
  };
  const assign = async (key, value) => {
    return assignEx(key, 0, value);
  };
  const assignEx = async (key, expireMillisecond, value) => {
    const old = await getExWithCache(key) || getDefaultValue(key);
    if (!old) {
      throw new Error("[NanoIndexed.assign] assign need is object");
    }
    const next = Object.assign(old, value);
    setExWithCache(key, expireMillisecond, next);
    return next;
  };
  const getAll = async () => {
    const keys = Object.keys({
      ...defaultValue,
      ...hasKeys
    });
    const out = {};
    for (const key of keys) {
      const value = await getExWithCache(key);
      out[key] = value;
    }
    return out;
  };
  const flushDb = async () => {
    const keys = Object.keys({
      ...defaultValue,
      ...hasKeys
    });
    for (const key of keys) {
      await delWithCache(key);
    }
  };
  return {
    get: getExWithCache,
    setEx: setExWithCache,
    set,
    assign,
    assignEx,
    del: delWithCache,
    getAll,
    flushDb,
    getDefaultValue
  };
}
var baseFormat = (v) => v;
export {
  IndexedRedis
};

//# debugId=BC46FE6303066C8064756e2164756e21
