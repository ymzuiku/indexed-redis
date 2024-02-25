// lib/index.ts
var IndexedRedis = (dbName) => {
  const isHaveIndexedDb = typeof window.indexedDB !== "undefined";
  if (!isHaveIndexedDb) {
    console.error("[nano-indexed] [Error] Your browser not have indexedDB, Now use localStorage.");
  }
  let db;
  let lastClearTime = 0;
  const initDb = () => {
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
          db.createObjectStore(dbName, { autoIncrement: false });
        };
      } else {
        res(undefined);
      }
    });
  };
  const get = async (key) => {
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
    if (!isHaveIndexedDb) {
      return new Promise((res) => {
        const out2 = {};
        const now = Date.now();
        for (let i = 0;i < localStorage.length; i++) {
          const key = localStorage.key(i) || "";
          if (key.indexOf(`[${dbName}] `) === 0) {
            const itemStr = localStorage.getItem(key);
            if (itemStr) {
              let item;
              try {
                item = JSON.parse(itemStr);
              } catch (error) {
                continue;
              }
              if (now > item.expiry) {
                localStorage.removeItem(key);
                continue;
              }
              out2[key.replace(`[${dbName}] `, "")] = item.value;
            }
          }
        }
        const keys = Object.keys(localStorage);
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
        request.onsuccess = (event) => {
          const data = event.target.result;
          const out2 = {};
          data.forEach((v) => {
            Object.keys(v).forEach((key) => {
              if (key !== "value") {
                if (v.expire && v.expire < Date.now()) {
                  return;
                }
                out2[key] = v.value;
              }
            });
          });
          res(out2);
        };
      } else {
        res({});
      }
    });
  };
  const setEx = async (key, expireSecond, obj) => {
    clearExpiredItems();
    const theObj = obj;
    if (!isHaveIndexedDb) {
      return new Promise((res, rej) => {
        localStorage.setItem(`[${dbName}] ${key}`, JSON.stringify({
          value: theObj,
          expire: expireSecond ? Date.now() + expireSecond * 1000 : 0
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
          [key]: key,
          value: theObj,
          expire: expireSecond ? Date.now() + expireSecond * 1000 : 0
        };
        const request = objectStore.put(data, key);
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
  const assign = async (key, obj) => {
    if (typeof obj !== "object") {
      throw new Error("[NanoIndexed.assign] assign need is object");
    }
    const old = await out.get(key);
    if (!old) {
      await out.set(key, obj);
      return obj;
    }
    if (typeof old !== "object") {
      return old;
    }
    const next = Object.assign(old, obj);
    await out.set(key, next);
    return next;
  };
  const remove = async (key) => {
    if (!isHaveIndexedDb) {
      return new Promise((res) => {
        localStorage.removeItem((key || 1).toString());
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
  const out = {
    setEx: async (key, expireSecond, obj) => {
      return setEx(key, expireSecond, obj);
    },
    set: async (key, obj) => {
      return setEx(key, 0, obj);
    },
    get,
    getAll,
    assign,
    remove,
    clearExpiredItems
  };
  return out;
};
export {
  IndexedRedis
};

//# debugId=D75DC001B945F33464756e2164756e21
