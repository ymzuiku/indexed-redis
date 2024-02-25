// lib/index.ts
import {debounce} from "throttle-debounce";
var indexedRedis = (dbName) => {
  const isHaveIndexedDb = typeof window.indexedDB !== "undefined";
  if (!isHaveIndexedDb) {
    console.error("[indexed-redis] [Error] Your browser not have indexedDB, Now use localStorage.");
  }
  let db;
  let lastClearTime = 0;
  let setExJobs = {};
  let valueCache = {};
  const initDb = () => {
    return new Promise((res) => {
      if (!db) {
        const reqDb = window.indexedDB.open("indexed-redis");
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
          db.createObjectStore(dbName, {
            autoIncrement: false,
            keyPath: "key"
          });
        };
      } else {
        res(undefined);
      }
    });
  };
  const getCacheValue = (key) => {
    const old = valueCache[key];
    if (old) {
      if (old.expire && old.expire < Date.now()) {
        delete valueCache[key];
        return;
      }
      return old.value;
    }
  };
  const get = async (key) => {
    const cacheValue = getCacheValue(key);
    if (cacheValue !== undefined) {
      return cacheValue;
    }
    clearExpiredItems();
    if (!isHaveIndexedDb) {
      return new Promise((res) => {
        let data = localStorage.getItem(`[${dbName}] ${key}`);
        if (data) {
          try {
            const obj = JSON.parse(data);
            data = obj?.value;
            if (obj?.expire && obj.expire < Date.now()) {
              localStorage.removeItem(`[${dbName}] ${key}`);
              res(undefined);
              return;
            }
          } catch (err) {
          }
        }
        if (data === undefined || data === null) {
          res(undefined);
          return;
        }
        res(data);
      });
    }
    if (!db) {
      await initDb();
    }
    return new Promise((res) => {
      if (db.objectStoreNames.contains(dbName)) {
        const transaction = db.transaction([dbName]);
        const objectStore = transaction.objectStore(dbName);
        const request = objectStore.get(key);
        request.onsuccess = (event) => {
          const data = event.target.result;
          res(data?.value);
        };
      } else {
        res(undefined);
      }
    });
  };
  const getAll = async () => {
    const out2 = {};
    Object.keys(valueCache).forEach((key) => {
      const v = valueCache[key];
      if (v.expire && v.expire < Date.now()) {
        delete valueCache[key];
        return;
      }
      out2[key] = v.value;
    });
    if (!isHaveIndexedDb) {
      return new Promise((res) => {
        const now = Date.now();
        for (let i = 0;i < localStorage.length; i++) {
          const key = localStorage.key(i) || "";
          if (key.indexOf(`[${dbName}] `) === 0) {
            const itemStr = localStorage.getItem(key);
            if (itemStr) {
              let item;
              try {
                item = JSON.parse(itemStr);
                if (item.expire && now > item.expire) {
                  localStorage.removeItem(key);
                  continue;
                }
                const realKey = key.replace(`[${dbName}] `, "");
                if (out2[realKey] === undefined) {
                  out2[realKey] = item.value;
                }
              } catch (error) {
              }
            }
          }
        }
        res(out2);
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
        const needDelete = [];
        request.onsuccess = (event) => {
          const data = event.target.result;
          const now = Date.now();
          data.forEach((v) => {
            if (v.expire && v.expire < now) {
              needDelete.push(v.key);
              return;
            }
            if (out2[v.key] === undefined) {
              out2[v.key] = v.value;
            }
          });
          res(out2);
          setTimeout(() => {
            needDelete.forEach((key) => {
              del(key);
            });
          });
        };
      } else {
        res(out2);
      }
    });
  };
  const setEx = async (key, expireMillisecond, obj) => {
    clearExpiredItems();
    const theObj = obj;
    if (!isHaveIndexedDb) {
      return new Promise((res) => {
        localStorage.setItem(`[${dbName}] ${key}`, JSON.stringify({
          value: theObj,
          expire: expireMillisecond ? Date.now() + expireMillisecond : 0
        }));
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
          key,
          value: theObj,
          expire: expireMillisecond ? Date.now() + expireMillisecond : 0
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
  const assignEx = async (key, expireMillisecond, obj) => {
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
  const del = async (key) => {
    delete valueCache[key];
    if (!isHaveIndexedDb) {
      return new Promise((res) => {
        localStorage.removeItem(`[${dbName}] ${key}`);
        res(undefined);
      });
    }
    if (!db) {
      await initDb();
    }
    return new Promise((res) => {
      if (db.objectStoreNames.contains(dbName)) {
        const transaction = db.transaction([dbName], "readwrite");
        const objectStore = transaction.objectStore(dbName);
        const request = objectStore.delete(key);
        request.onerror = (err) => {
          console.error(err);
          res(undefined);
        };
        request.onsuccess = res;
      } else {
        res(undefined);
      }
    });
  };
  const clearExpiredItems = async (force = false) => {
    const now = Date.now();
    if (!force && lastClearTime && now - lastClearTime < 300000) {
      return;
    }
    lastClearTime = now;
    return getAll();
  };
  clearExpiredItems();
  const flushDb = async () => {
    const all = await getAll();
    await Promise.all(Object.keys(all).map((key) => {
      return del(key);
    }));
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
      const keys2 = Object.keys(valueCache);
      if (keys2.length > 500) {
        valueCache = {};
      }
    }
    const keys = Object.keys(setExJobs);
    if (keys.length === 0) {
      return;
    }
    keys.forEach((key) => {
      const job = setExJobs[key];
      if (job) {
        setEx(key, job.expire, job.value);
      }
    });
    setExJobs = {};
  });
  const out = {
    set: async (key, value) => {
      out.setEx(key, 0, value);
    },
    setEx: async (key, expireMillisecond, value) => {
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
    },
    get: async (key) => {
      const old = getCacheValue(key);
      if (old !== undefined) {
        return old;
      }
      return get(key);
    },
    getAll,
    assignEx,
    del,
    flushDb,
    clearExpiredItems
  };
  return out;
};
export {
  indexedRedis
};

//# debugId=625BBAF4B923FCEB64756e2164756e21
