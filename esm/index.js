// lib/index.ts
import {debounce} from "throttle-debounce";

// lib/is-have-indexed-db.ts
var isHaveIndexedDb = typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
if (!isHaveIndexedDb) {
  console.error("[indexed-redis] [WARN] Your browser not have indexedDB, Now use localStorage.");
}

// lib/index.ts
class IndexedRedis {
  dbName;
  defaultValue;
  optimisticDelay;
  db;
  lastClearTime;
  valueCache;
  setExJobs;
  initd;
  runSetExJobs;
  reduceValueCache = 0;
  constructor({
    dbName,
    defaultValue,
    optimisticDelay = 500
  }) {
    this.dbName = dbName;
    this.defaultValue = defaultValue;
    this.optimisticDelay = optimisticDelay;
    this.lastClearTime = 0;
    this.valueCache = {};
    this.setExJobs = {};
    this.initd = localStorage.getItem(`indexed-redis-initd-${dbName}`) === "true";
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
        const keys2 = Object.keys(this.valueCache);
        if (keys2.length > 500) {
          this.valueCache = {};
        }
      }
      const keys = Object.keys(this.setExJobs);
      if (keys.length === 0) {
        return;
      }
      keys.forEach((key) => {
        const job = this.setExJobs[key];
        if (job) {
          this.baseSetEx(key, job.expire, job.value);
        }
      });
      this.setExJobs = {};
    });
  }
  initDb = async () => {
    if (this.db) {
      return;
    }
    if (!this.initd) {
      for (const key of Object.keys(this.defaultValue)) {
        await this.baseSetExNoCache(key, 0, this.defaultValue[key]);
      }
      localStorage.setItem(`indexed-redis-initd-${this.dbName}`, "true");
      this.initd = true;
    }
    if (!isHaveIndexedDb) {
      return;
    }
    return new Promise((res) => {
      if (!this.db) {
        const reqDb = window.indexedDB.open(this.dbName);
        reqDb.onerror = console.error;
        reqDb.onsuccess = (event) => {
          if (!this.db) {
            this.db = event.target.result;
          }
          res(undefined);
        };
        reqDb.onupgradeneeded = (event) => {
          if (!this.db) {
            this.db = event.target.result;
          }
          this.db?.createObjectStore(this.dbName, {
            autoIncrement: false,
            keyPath: "key"
          });
        };
      } else {
        res(undefined);
      }
    });
  };
  clearExpiredItems = async (force) => {
    const now = Date.now();
    if (!force && this.lastClearTime && now - this.lastClearTime < 300000) {
      return;
    }
    this.lastClearTime = now;
    await this.getAll();
  };
  baseSetExNoCache = async (key, expireMillisecond, value) => {
    const theObj = value;
    if (!isHaveIndexedDb) {
      return new Promise((res) => {
        localStorage.setItem(`[${this.dbName}] ${key}`, JSON.stringify({
          value: theObj,
          expire: expireMillisecond ? Date.now() + expireMillisecond : 0
        }));
        res(value);
      });
    }
    return new Promise((res) => {
      if (this.db?.objectStoreNames.contains(this.dbName)) {
        const transaction = this.db.transaction([this.dbName], "readwrite");
        const objectStore = transaction.objectStore(this.dbName);
        const data = {
          key,
          value: theObj,
          expire: expireMillisecond ? Date.now() + expireMillisecond : 0
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
  baseSetEx = async (key, expireMillisecond, value) => {
    await this.initDb();
    this.clearExpiredItems();
    this.baseSetExNoCache(key, expireMillisecond, value);
  };
  baseAssignEx = async (key, expireMillisecond, value) => {
    if (typeof value !== "object") {
      throw new Error("[NanoIndexed.assign] assign need is object");
    }
    const old = await this.get(key) || this.defaultValue[key];
    if (!old) {
      throw new Error("[NanoIndexed.assign] assign need has old object");
    }
    const next = Object.assign(old, value);
    this.setEx(key, expireMillisecond, next);
    return next;
  };
  getCacheValue = (key) => {
    const old = this.valueCache[key];
    if (old) {
      if (old.expire && old.expire < Date.now()) {
        delete this.valueCache[key];
        return;
      }
      return old.value;
    }
  };
  baseGetNoCache = async (key) => {
    if (!isHaveIndexedDb) {
      return new Promise((res) => {
        const old = localStorage.getItem(`[${this.dbName}] ${key}`);
        if (old === undefined || old === null) {
          return res(this.defaultValue[key]);
        }
        try {
          const value = JSON.parse(old).value;
          res(value);
        } catch (error) {
          console.error("[indexed-redis] get error:", error);
          return res(this.defaultValue[key]);
        }
      });
    }
    return new Promise((res) => {
      if (this.db?.objectStoreNames.contains(this.dbName)) {
        const transaction = this.db.transaction([this.dbName]);
        const objectStore = transaction.objectStore(this.dbName);
        const request = objectStore.get(key);
        request.onsuccess = (event) => {
          const data = event.target.result;
          if (data?.value === undefined) {
            res(this.defaultValue[key]);
          } else {
            res(data?.value);
          }
        };
      } else {
        res(this.defaultValue[key]);
      }
    });
  };
  get = async (key) => {
    await this.initDb();
    const cacheValue = this.getCacheValue(key);
    if (cacheValue !== undefined) {
      return cacheValue;
    }
    this.clearExpiredItems();
    return this.baseGetNoCache(key);
  };
  setEx = async (key, expireMillisecond, value) => {
    const now = Date.now();
    this.setExJobs[key] = {
      expire: expireMillisecond,
      value
    };
    this.valueCache[key] = {
      expire: expireMillisecond ? now + expireMillisecond : 0,
      value
    };
    this.runSetExJobs();
  };
  set = async (key, value) => {
    return this.setEx(key, 0, value);
  };
  assignEx = (key, expireMillisecond, value) => {
    return this.baseAssignEx(key, expireMillisecond, value);
  };
  assign = (key, value) => {
    return this.baseAssignEx(key, 0, value);
  };
  getAll = async () => {
    await this.initDb();
    const out = {};
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
        for (let i = 0;i < localStorage.length; i++) {
          const key = localStorage.key(i) || "";
          if (key.indexOf(`[${this.dbName}] `) === 0) {
            const itemStr = localStorage.getItem(key);
            if (itemStr) {
              let item;
              try {
                item = JSON.parse(itemStr);
                if (item.expire && now > item.expire) {
                  localStorage.removeItem(key);
                  continue;
                }
                const realKey = key.replace(`[${this.dbName}] `, "");
                if (out[realKey] === undefined) {
                  out[realKey] = item.value;
                }
              } catch (error) {
              }
            }
          }
        }
        res(out);
      });
    }
    return new Promise((res) => {
      if (this.db?.objectStoreNames.contains(this.dbName)) {
        const transaction = this.db.transaction([this.dbName]);
        const objectStore = transaction.objectStore(this.dbName);
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
            if (out[v.key] === undefined) {
              out[v.key] = v.value;
            }
          });
          res(out);
          setTimeout(() => {
            needDelete.forEach((key) => {
              this.del(key);
            });
          });
        };
      } else {
        res(out);
      }
    });
  };
  del = async (key) => {
    await this.initDb();
    delete this.valueCache[key];
    if (!isHaveIndexedDb) {
      return new Promise((res) => {
        localStorage.removeItem(`[${this.dbName}] ${key}`);
        res(this.defaultValue[key]);
      });
    }
    return new Promise((res) => {
      if (this.db?.objectStoreNames.contains(this.dbName)) {
        const transaction = this.db.transaction([this.dbName], "readwrite");
        const objectStore = transaction.objectStore(this.dbName);
        const request = objectStore.delete(key);
        request.onerror = (err) => {
          console.error(err);
          res(this.defaultValue[key]);
        };
        request.onsuccess = res;
      } else {
        res(this.defaultValue[key]);
      }
    });
  };
  flushDb = async () => {
    const all = await this.getAll();
    await Promise.all(Object.keys(all).map((key) => {
      return this.del(key);
    }));
  };
}
export {
  IndexedRedis
};

//# debugId=2C35949EA48C0C3364756e2164756e21
