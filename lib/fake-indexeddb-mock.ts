import { IDBFactory } from "fake-indexeddb";

// Assign fake-indexeddb to global indexedDB
global.indexedDB = new IDBFactory();
