/**
 * Local image asset store.
 *
 * A `.slide` file references images by a short **name** — `image(photo.jpg)` —
 * so the source stays light and readable (never binary). When you pick a local
 * file we keep that clean reference in the source and persist the file's bytes
 * in the browser (IndexedDB), keyed by name. So:
 *   - the editor shows `image(photo.jpg)`, not a base64 blob;
 *   - the bytes survive save → reopen (they're in IndexedDB, not just memory);
 *   - the preview renders the picture from a cached object URL;
 *   - exports embed the bytes as a data URL so the exported file is portable.
 *
 * A synchronous in-memory cache (hydrated from IndexedDB on startup) backs the
 * `resolveAsset` / `resolveAssetData` calls the (synchronous) renderer needs.
 */

interface Asset {
  blobUrl: string; // object URL for the live preview
  dataUrl: string; // base64 data URL for embedding in exports
}

const cache = new Map<string, Asset>();

// ---- IndexedDB (tiny, dependency-free) ----------------------------------

const DB_NAME = "deckware";
const STORE = "assets";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE); // key = filename, value = dataUrl
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(name: string, dataUrl: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(dataUrl, name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbAll(): Promise<Record<string, string>> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        const out: Record<string, string> = {};
        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();
        tx.oncomplete = () => {
          const keys = keysReq.result as string[];
          const vals = valsReq.result as string[];
          keys.forEach((k, i) => (out[k] = vals[i]));
          resolve(out);
        };
        tx.onerror = () => reject(tx.error);
      }),
  );
}

// ---- Cache helpers -------------------------------------------------------

function dataUrlToBlobUrl(dataUrl: string): string {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "application/octet-stream";
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type: mime }));
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ---- Public API ----------------------------------------------------------

/**
 * Store a picked file and return the short reference name to write into the
 * source (its filename). Persists the bytes so they survive reopen.
 */
export async function putAsset(file: File): Promise<string> {
  const name = file.name;
  const dataUrl = await readAsDataUrl(file);
  const prev = cache.get(name);
  if (prev) URL.revokeObjectURL(prev.blobUrl);
  cache.set(name, { blobUrl: dataUrlToBlobUrl(dataUrl), dataUrl });
  try {
    await idbPut(name, dataUrl);
  } catch {
    // Persistence best-effort; the in-memory cache still serves this session.
  }
  return name;
}

/** Load all persisted assets into the in-memory cache (call once on startup). */
export async function hydrateAssets(): Promise<void> {
  let all: Record<string, string> = {};
  try {
    all = await idbAll();
  } catch {
    return;
  }
  for (const [name, dataUrl] of Object.entries(all)) {
    if (cache.has(name)) continue;
    cache.set(name, { blobUrl: dataUrlToBlobUrl(dataUrl), dataUrl });
  }
}

/** Resolve a reference to a preview object URL, or undefined if not stored. */
export function resolveAsset(ref: string): string | undefined {
  return cache.get(ref)?.blobUrl;
}

/** Resolve a reference to an embeddable data URL (exports), or undefined. */
export function resolveAssetData(ref: string): string | undefined {
  return cache.get(ref)?.dataUrl;
}
