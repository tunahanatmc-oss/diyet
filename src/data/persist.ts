/** Persist the personal SQLite bytes to IndexedDB (browser, iPhone PWA and Tauri WebView). */
const DB_NAME = 'diyet-app'; const STORE = 'kv';

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function kvGet<T = any>(key: string): Promise<T | undefined> {
  const d = await idb();
  return new Promise((res, rej) => { const t = d.transaction(STORE).objectStore(STORE).get(key); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); });
}
export async function kvSet(key: string, val: any): Promise<void> {
  const d = await idb();
  return new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(val, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
