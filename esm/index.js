// node_modules/throttle-debounce/esm/index.js
var throttle = function(delay, callback, options) {
  var _ref = options || {}, _ref$noTrailing = _ref.noTrailing, noTrailing = _ref$noTrailing === undefined ? false : _ref$noTrailing, _ref$noLeading = _ref.noLeading, noLeading = _ref$noLeading === undefined ? false : _ref$noLeading, _ref$debounceMode = _ref.debounceMode, debounceMode = _ref$debounceMode === undefined ? undefined : _ref$debounceMode;
  var timeoutID;
  var cancelled = false;
  var lastExec = 0;
  function clearExistingTimeout() {
    if (timeoutID) {
      clearTimeout(timeoutID);
    }
  }
  function cancel(options2) {
    var _ref2 = options2 || {}, _ref2$upcomingOnly = _ref2.upcomingOnly, upcomingOnly = _ref2$upcomingOnly === undefined ? false : _ref2$upcomingOnly;
    clearExistingTimeout();
    cancelled = !upcomingOnly;
  }
  function wrapper() {
    for (var _len = arguments.length, arguments_ = new Array(_len), _key = 0;_key < _len; _key++) {
      arguments_[_key] = arguments[_key];
    }
    var self = this;
    var elapsed = Date.now() - lastExec;
    if (cancelled) {
      return;
    }
    function exec() {
      lastExec = Date.now();
      callback.apply(self, arguments_);
    }
    function clear() {
      timeoutID = undefined;
    }
    if (!noLeading && debounceMode && !timeoutID) {
      exec();
    }
    clearExistingTimeout();
    if (debounceMode === undefined && elapsed > delay) {
      if (noLeading) {
        lastExec = Date.now();
        if (!noTrailing) {
          timeoutID = setTimeout(debounceMode ? clear : exec, delay);
        }
      } else {
        exec();
      }
    } else if (noTrailing !== true) {
      timeoutID = setTimeout(debounceMode ? clear : exec, debounceMode === undefined ? delay - elapsed : delay);
    }
  }
  wrapper.cancel = cancel;
  return wrapper;
};
var debounce = function(delay, callback, options) {
  var _ref = options || {}, _ref$atBegin = _ref.atBegin, atBegin = _ref$atBegin === undefined ? false : _ref$atBegin;
  return throttle(delay, callback, {
    debounceMode: atBegin !== false
  });
};

// lib/index.ts
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
          db.createObjectStore(dbName, { autoIncrement: false });
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
            Object.keys(v).forEach((key) => {
              if (key !== "value" && key !== "expire") {
                if (v.expire && v.expire < now) {
                  needDelete.push(key);
                  return;
                }
                if (out2[key] === undefined) {
                  out2[key] = v.value;
                }
              }
            });
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
          [key]: key,
          value: theObj,
          expire: expireMillisecond ? Date.now() + expireMillisecond : 0
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
        expire: expireMillisecond ? now + expireMillisecond : 0,
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

//# debugId=220900F768999E2864756e2164756e21
